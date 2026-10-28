import { describe, expect, it, vi } from "vitest";
import type { MarcaDeSaida } from "@/lib/branding/saida";
import type { EventRow } from "@/lib/event-log/dispatcher";
import {
  aplicaEmailTransacional,
  type AssinaturaLida,
  type DepsDosEmails,
} from "@/lib/emails-transacionais/aplicar";

const marca = {
  nome: "ChatAI Online",
  logoUrl: null,
  accent: "#2563eb",
  accentFg: "#ffffff",
  origens: { nome: "padrao", cor: "padrao" },
} as unknown as MarcaDeSaida;

const ORG = "00000000-0000-4000-8000-000000000001";
const agora = new Date("2026-10-28T12:00:00Z");

function evento(event_type: string, payload: Record<string, unknown> = {}): EventRow {
  return {
    id: "evt-1",
    organization_id: ORG,
    event_type,
    entity_kind: "x",
    entity_id: null,
    payload,
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

function montar(o: {
  assinatura?: Partial<AssinaturaLida> | null;
  ultimoPlano?: string | null;
  destinatario?: boolean;
  jaRegistrado?: boolean;
  envio?: { ok: true } | { ok: false; error: string };
}) {
  const reservas: unknown[] = [];
  const devolvidas: string[] = [];
  const enviar = vi.fn(
    async (_a: { to: string; subject: string; tipo: string }) => o.envio ?? { ok: true as const },
  );
  const deps: DepsDosEmails = {
    db: {
      destinatario: async () =>
        o.destinatario === false ? null : { userId: "u1", email: "ana@x.com", nome: "Ana Souza" },
      assinatura: async () =>
        o.assinatura === null
          ? null
          : {
              plan_type: "essencial",
              status: "active",
              billing_cycle: "monthly",
              contracted_amount_cents: 19700,
              expires_at: null,
              current_period_end: null,
              ...o.assinatura,
            },
      ultimoPlano: async () => o.ultimoPlano ?? null,
      reservar: async (e) => {
        reservas.push(e);
        return o.jaRegistrado ? "ja_registrado" : "reservado";
      },
      devolver: async (_org, key) => {
        devolvidas.push(key);
      },
    },
    enviar,
    marca: async () => marca,
    contato: async () => ({ email: "suporte@x.com", whatsapp: "5512981667389" }),
    urlDoApp: "https://crm.x.com",
    agora: () => agora,
  };
  return { deps, reservas, devolvidas, enviar };
}

describe("aplicaEmailTransacional", () => {
  it("boas-vindas: envia uma vez, com o primeiro nome", async () => {
    const m = montar({ assinatura: { status: "trialing" } });
    const r = await aplicaEmailTransacional(m.deps, evento("conta.criada", { user_id: "u1" }));
    expect(r.status).toBe("ok");
    expect(m.enviar).toHaveBeenCalledOnce();
    const arg = m.enviar.mock.calls[0]![0];
    expect(arg.subject).toContain("Ana");
    expect(arg.to).toBe("ana@x.com");
  });

  it("reentrega: ja_registrado não envia de novo", async () => {
    const m = montar({ jaRegistrado: true });
    const r = await aplicaEmailTransacional(m.deps, evento("conta.criada"));
    expect(r).toMatchObject({ status: "skipped", detail: "ja_enviado" });
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("sem destinatário membro: não envia", async () => {
    const m = montar({ destinatario: false });
    const r = await aplicaEmailTransacional(m.deps, evento("conta.criada", { user_id: "intruso" }));
    expect(r.status).toBe("skipped");
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("plano.alterado lê o plano do banco, não do payload", async () => {
    const m = montar({ assinatura: { plan_type: "impulso" } });
    await aplicaEmailTransacional(m.deps, evento("plano.alterado", { plan_type: "essencial" }));
    const arg = m.enviar.mock.calls[0]![0];
    expect(arg.tipo).toBe("plano_contratado");
    expect(arg.subject.toLowerCase()).toContain("impulso");
  });

  it("subida de plano vira plano_melhorado", async () => {
    const m = montar({ assinatura: { plan_type: "impulso" }, ultimoPlano: "essencial" });
    await aplicaEmailTransacional(m.deps, evento("plano.alterado"));
    expect(m.enviar.mock.calls[0]![0].tipo).toBe("plano_melhorado");
  });

  it("assinatura não ativa não envia", async () => {
    const m = montar({ assinatura: { status: "suspended" } });
    const r = await aplicaEmailTransacional(m.deps, evento("plano.alterado"));
    expect(r.detail).toBe("assinatura_nao_ativa");
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("Escala ativado: números da proposta e contatos, sem valor", async () => {
    const m = montar({
      assinatura: { plan_type: "escala", limites_personalizados: { whatsapp: 10 } },
      ultimoPlano: "impulso",
    });
    const r = await aplicaEmailTransacional(m.deps, evento("plano.alterado"));
    expect(r.status).toBe("ok");
    expect(m.reservas[0]).toMatchObject({ tipo: "escala_ativo", planType: "escala" });
    const arg = m.enviar.mock.calls[0]![0] as unknown as { text: string };
    expect(arg.text).toContain("10 números de WhatsApp");
    expect(arg.text).toContain("(12) 98166-7389");
    expect(arg.text).toContain("suporte@x.com");
    expect(arg.text).not.toContain("R$");
  });

  it("sair do Escala não envia, mas registra o plano como base", async () => {
    const m = montar({ assinatura: { plan_type: "impulso" }, ultimoPlano: "escala" });
    const r = await aplicaEmailTransacional(m.deps, evento("plano.alterado"));
    expect(r.status).toBe("skipped");
    expect(m.enviar).not.toHaveBeenCalled();
    expect(m.reservas[0]).toMatchObject({ tipo: "baseline", planType: "impulso" });
  });

  it("reembolso forjado (assinatura não suspensa) não envia", async () => {
    const m = montar({ assinatura: { status: "active" } });
    const r = await aplicaEmailTransacional(
      m.deps,
      evento("reembolso.confirmado", { value: 197, payment_id: "pay_1" }),
    );
    expect(r.detail).toBe("sem_estorno_na_assinatura");
    expect(m.enviar).not.toHaveBeenCalled();
  });

  it("reembolso confirmado envia, com chave por pagamento", async () => {
    const m = montar({ assinatura: { status: "suspended" } });
    const r = await aplicaEmailTransacional(
      m.deps,
      evento("reembolso.confirmado", { value: 197, payment_id: "pay_1", billing_type: "PIX" }),
    );
    expect(r.status).toBe("ok");
    expect(m.reservas[0]).toMatchObject({ dedupeKey: "reembolso:pay_1" });
  });

  it("falha de envio devolve a reserva e pede nova tentativa", async () => {
    const m = montar({ envio: { ok: false, error: "send_failed" } });
    const r = await aplicaEmailTransacional(m.deps, evento("conta.criada"));
    expect(r.status).toBe("retry");
    expect(r.retry_at).toBe(new Date(agora.getTime() + 300_000).toISOString());
    expect(m.devolvidas).toEqual(["boas_vindas"]);
  });

  it("e-mail não configurado: consome o evento sem reprocessar", async () => {
    const m = montar({ envio: { ok: false, error: "not_configured" } });
    const r = await aplicaEmailTransacional(m.deps, evento("conta.criada"));
    expect(r).toMatchObject({ status: "skipped", detail: "email_nao_configurado" });
    expect(m.devolvidas).toEqual(["boas_vindas"]);
  });
});

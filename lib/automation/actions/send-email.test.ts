// @vitest-environment node
/**
 * A ação "Enviar e-mail". O destinatário é escolha FECHADA; ao contato valem as
 * guardas de recusa; o texto é escapado e o assunto não leva quebra de linha.
 * SABOTAGEM: tirar a checagem de `is_blocked`/`recusaRegistrada` ou o `escapar`
 * deixa este arquivo vermelho.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviados = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const resposta = vi.hoisted(() => ({ ok: true, error: undefined as string | undefined }));

vi.mock("@/lib/email/roteador", () => ({
  sendEmail: async (args: Record<string, unknown>) => {
    enviados.push(args);
    return resposta.ok ? { ok: true, id: "m1", via: "smtp" } : { ok: false, error: resposta.error };
  },
}));

import { getAction } from "@/lib/automation/actions";
import "@/lib/automation/actions/send-email";
import { assuntoSeguro, corpoEmHtml, destinatarioDeEmail } from "@/lib/automation/actions/send-email";
import type { ActionCtx } from "@/lib/automation/types";

const ORG = "org-1";
const filtros: Array<[string, unknown]> = [];

function admin() {
  return {
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@equipe.com` } } }) } },
    from() {
      const qb: Record<string, unknown> = {};
      qb.select = () => qb;
      qb.eq = (c: string, v: unknown) => (filtros.push([c, v]), qb);
      qb.is = () => qb;
      qb.in = (c: string, v: unknown) => {
        if (c === "user_id") return Promise.resolve({ data: (v as string[]).map((user_id) => ({ user_id })), error: null });
        return Promise.resolve({ data: [{ user_id: "g1" }], error: null });
      };
      return qb;
    },
  };
}

const ctx = (contexto: Record<string, unknown>): ActionCtx =>
  ({ admin: admin(), organizationId: ORG, ruleId: "r1", ruleName: "R", event: { id: "e1" }, context: contexto }) as unknown as ActionCtx;
const executar = (c: ActionCtx, cfg: Record<string, unknown>) => getAction("send_email")!.execute(c, cfg);
const base = { assunto: "Oi {{contact.name}}", mensagem: "Olá {{contact.name}}" };

beforeEach(() => {
  enviados.length = 0;
  filtros.length = 0;
  resposta.ok = true;
  resposta.error = undefined;
});

describe("send_email", () => {
  it("manda ao contato, com assunto e texto preenchidos", async () => {
    const r = await executar(ctx({ contact: { id: "c1", name: "Ana", email: "ana@x.com" } }), { ...base, destinatario: "contato" });
    expect(r.status).toBe("success");
    expect(enviados[0]).toMatchObject({ to: "ana@x.com", subject: "Oi Ana", text: "Olá Ana" });
  });

  it.each([
    ["bloqueado", { is_blocked: true }, "contact_blocked"],
    ["pessoal", { is_personal: true }, "contact_blocked"],
    ["sempre humano", { ai_opt_out: true }, "contact_blocked"],
    ["recusou marketing", { consent: { marketing: { declined_at: "2026-01-01T00:00:00Z" } } }, "consent_declined"],
    ["sem e-mail", { email: null }, "no_email"],
    ["e-mail torto", { email: "ana@x.com, outra@y.com" }, "no_email"],
  ])("ao contato %s: não envia", async (_n, extra, motivo) => {
    const r = await executar(
      ctx({ contact: { id: "c1", name: "Ana", email: "ana@x.com", ...extra } }),
      { ...base, destinatario: "contato" },
    );
    expect(r).toMatchObject({ status: "skipped", detail: { reason: motivo } });
    expect(enviados).toHaveLength(0);
  });

  it("gerentes: busca só na organização do evento", async () => {
    const r = await executar(ctx({}), { ...base, destinatario: "gerentes" });
    expect(r.status).toBe("success");
    expect(filtros).toContainEqual(["organization_id", ORG]);
    expect(enviados[0]).toMatchObject({ to: "g1@equipe.com" });
  });

  it("dono do negócio: só se ainda for membro ativo", async () => {
    const r = await executar(ctx({ lead: { id: "l1", owner_user_id: "u1" } }), { ...base, destinatario: "dono_do_lead" });
    expect(r.status).toBe("success");
    expect(enviados[0]).toMatchObject({ to: "u1@equipe.com" });
  });

  it("e-mail da instalação desligado vira skipped, não falha", async () => {
    resposta.ok = false;
    resposta.error = "not_configured";
    const r = await executar(ctx({ contact: { id: "c1", name: "Ana", email: "ana@x.com" } }), { ...base, destinatario: "contato" });
    expect(r).toMatchObject({ status: "skipped", detail: { reason: "email_not_configured" } });
  });

  it("falha de entrega é falha", async () => {
    resposta.ok = false;
    resposta.error = "send_failed";
    const r = await executar(ctx({ contact: { id: "c1", name: "Ana", email: "ana@x.com" } }), { ...base, destinatario: "contato" });
    expect(r.status).toBe("failed");
  });

  it("configuração torta (inclusive endereço livre) é recusada", async () => {
    expect((await executar(ctx({}), { ...base, destinatario: "alguem@fora.com" })).status).toBe("skipped");
    expect((await executar(ctx({}), { assunto: "", mensagem: "x", destinatario: "contato" })).status).toBe("skipped");
    expect(enviados).toHaveLength(0);
  });

  it("helpers: assunto sem quebra de linha e corpo escapado", () => {
    expect(assuntoSeguro("Oi\r\nBcc: x@y.com")).toBe("Oi Bcc: x@y.com");
    expect(corpoEmHtml("<script>x</script>\n\nsegundo")).not.toContain("<script>");
    expect(destinatarioDeEmail({ usuario_id: "u" })).toEqual({ usuario_id: "u" });
    expect(destinatarioDeEmail("x@y.com")).toBeNull();
  });
});

// @vitest-environment node
/**
 * A ação "Mensagem para a equipe": recado interno, nunca ao cliente.
 * SABOTAGEM: trocar `organization_id` da busca de gerentes por outro valor, ou
 * remover o recado da Central quando ninguém é alcançado, deixa este arquivo vermelho.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviados = vi.hoisted(() => [] as Array<{ org: string; user: string; payload: Record<string, unknown> }>);
const alcance = vi.hoisted(() => ({ sent: 1 }));

vi.mock("@/lib/notifications/web_push", () => ({
  enviarPushAoUsuario: async (org: string, user: string, payload: Record<string, unknown>) => {
    enviados.push({ org, user, payload });
    return { sent: alcance.sent, gone: 0 };
  },
}));

import { getAction } from "@/lib/automation/actions";
import "@/lib/automation/actions/notify-team";
import { destinatarioDaConfig, interpolarAviso } from "@/lib/automation/actions/notify-team";
import type { ActionCtx } from "@/lib/automation/types";

const ORG = "org-1";
const itens: Array<Record<string, unknown>> = [];
const filtros: Array<[string, unknown]> = [];

function admin() {
  return {
    from(tabela: string) {
      const qb: Record<string, unknown> = {};
      qb.select = () => qb;
      qb.eq = (c: string, v: unknown) => (filtros.push([c, v]), qb);
      qb.is = () => qb;
      qb.in = () => Promise.resolve({ data: [{ user_id: "g1" }, { user_id: "g2" }], error: null });
      qb.insert = (linha: Record<string, unknown>) => {
        if (tabela === "agent_inbox_items") itens.push(linha);
        return Promise.resolve({ error: null });
      };
      return qb;
    },
  };
}

function ctx(contexto: Record<string, unknown>): ActionCtx {
  return {
    admin: admin(),
    organizationId: ORG,
    ruleId: "r1",
    ruleName: "Regra",
    event: { id: "e1", event_type: "lead.won" },
    context: contexto,
  } as unknown as ActionCtx;
}

const executar = (c: ActionCtx, cfg: Record<string, unknown>) => getAction("notify_team")!.execute(c, cfg);

beforeEach(() => {
  enviados.length = 0;
  itens.length = 0;
  filtros.length = 0;
  alcance.sent = 1;
});

describe("notify_team", () => {
  it("avisa o dono do negócio, com os marcadores preenchidos", async () => {
    const r = await executar(
      ctx({ lead: { id: "l1", title: "Plano", owner_user_id: "u1" }, contact: { id: "c1", name: "Ana" } }),
      { mensagem: "{{contact.name}} fechou {{lead.title}}", destinatario: "dono_do_lead" },
    );
    expect(r.status).toBe("success");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ org: ORG, user: "u1", payload: { body: "Ana fechou Plano" } });
    expect(itens).toHaveLength(0);
  });

  it("gerentes: busca só na organização do evento e avisa cada um", async () => {
    await executar(ctx({ lead: { id: "l1", title: "P" } }), { mensagem: "oi", destinatario: "gerentes" });
    expect(filtros).toContainEqual(["organization_id", ORG]);
    expect(enviados.map((e) => e.user)).toEqual(["g1", "g2"]);
  });

  it("ninguém alcançado: o recado vai para a Central, não some", async () => {
    alcance.sent = 0;
    const r = await executar(ctx({ lead: { id: "l1", title: "P", owner_user_id: "u1" } }), {
      titulo: "Venda",
      mensagem: "fechou",
      destinatario: "dono_do_lead",
    });
    expect(r.status).toBe("success");
    expect(itens).toEqual([expect.objectContaining({ organization_id: ORG, title: "Venda", body: "fechou" })]);
  });

  it("sem dono do negócio também cai na Central", async () => {
    await executar(ctx({ lead: { id: "l1", title: "P" } }), { mensagem: "x", destinatario: "dono_do_lead" });
    expect(enviados).toHaveLength(0);
    expect(itens).toHaveLength(1);
  });

  it("configuração torta é recusada sem efeito", async () => {
    const r = await executar(ctx({}), { mensagem: "  ", destinatario: "dono_do_lead" });
    expect(r.status).toBe("skipped");
    const r2 = await executar(ctx({}), { mensagem: "x", destinatario: "todo_mundo" });
    expect(r2.status).toBe("skipped");
    expect(enviados).toHaveLength(0);
    expect(itens).toHaveLength(0);
  });

  it("helpers: destinatário e marcador sem dado fica à vista", () => {
    expect(destinatarioDaConfig({ usuario_id: " u9 " })).toEqual({ usuario_id: "u9" });
    expect(destinatarioDaConfig("gerentes")).toBe("gerentes");
    expect(destinatarioDaConfig(null)).toBeNull();
    expect(interpolarAviso("{{lead.title}} / {{contact.name}}", undefined, undefined)).toBe(
      "{{lead.title}} / {{contact.name}}",
    );
  });
});

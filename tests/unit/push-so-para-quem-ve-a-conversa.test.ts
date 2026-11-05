/**
 * O AVISO DO NAVEGADOR SÓ VAI A QUEM PODE VER A CONVERSA.
 *
 * O push leva nome do contato e trecho da mensagem, e o service worker mostra
 * isso na tela de bloqueio. O handler mandava para TODA inscrição da
 * organização: o atendente a quem o modo de visibilidade esconde a conversa de
 * outro recebia o conteúdo dela, o leitor recebia o grupo privado, e quem foi
 * revogado seguia recebendo tudo — a inscrição dele nunca era apagada.
 *
 * A régua é a de `fn_can_view_conversation` (as duas assinaturas, última
 * definição do baseline), sobre membros ATIVOS.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  enviados: [] as string[],
}));

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let op: "select" | "delete" | "update" = "select";
  let patch: Linha = {};
  const rodar = () => {
    const linhas = db.tabelas[tabela] ?? [];
    const alvo = linhas.filter((l) => filtros.every((f) => f(l)));
    if (op === "delete") db.tabelas[tabela] = linhas.filter((l) => !alvo.includes(l));
    if (op === "update") for (const l of alvo) Object.assign(l, patch);
    return alvo;
  };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
    is: (c: string, v: unknown) => (filtros.push((l) => (l[c] ?? null) === v), q),
    in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q),
    delete: () => ((op = "delete"), q),
    update: (p: Linha) => ((op = "update"), (patch = p), q),
    maybeSingle: async () => ({ data: rodar()[0] ?? null, error: null }),
    then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rodar(), error: null, count: null }).then(ok, erro),
  };
  return q;
}
const cliente = { from: consulta };

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => cliente }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => cliente }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }) => {
      db.enviados.push(sub.endpoint);
      return { statusCode: 201 };
    }),
  },
}));
vi.mock("@/lib/env", () => ({ env: { VAPID_PRIVATE_KEY: "privada" } }));
vi.mock("@/lib/notifications/vapid", () => ({
  vapidPronto: () => true,
  vapidPublica: () => "publica",
  vapidSubject: async () => "mailto:ops@example.com",
}));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: async () => ({ nome: "Marca" }) }));
vi.mock("node:dns/promises", async (orig) => {
  const real = await orig<typeof import("node:dns/promises")>();
  const lookup = async () => [{ address: "142.250.0.10", family: 4 }];
  return { ...real, lookup, default: { ...real, lookup } };
});
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({
    ok: true,
    user: { id: "u-admin", idioma: "pt-BR" },
    org: { orgId: "org-a", role: "admin" },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/inbox/atividade-de-comando", () => ({
  registrarTrocaDeComando: vi.fn(async () => undefined),
}));

import { webPushInboundHandler } from "@/lib/notifications/push.handler";
import { POST as revogar } from "@/app/api/v1/team/[user_id]/revoke/route";

const ORG = "org-a";
const MEMBROS = [
  { id: "m1", user_id: "u-admin", role: "admin", revoked_at: null },
  { id: "m2", user_id: "u-gerente", role: "manager", revoked_at: null },
  { id: "m3", user_id: "u-leitor", role: "viewer", revoked_at: null },
  { id: "m4", user_id: "u-responsavel", role: "agent", revoked_at: null },
  { id: "m5", user_id: "u-outro-atendente", role: "agent", revoked_at: null },
  { id: "m6", user_id: "u-revogado", role: "admin", revoked_at: "2026-10-01T00:00:00Z" },
];
const ponta = (userId: string) => `https://fcm.googleapis.com/fcm/send/${userId}`;

beforeEach(() => {
  db.enviados = [];
  db.tabelas = {
    organizations: [{ id: ORG, settings: {} }],
    user_organizations: MEMBROS.map((m) => ({ ...m, organization_id: ORG })),
    push_subscriptions: [
      ...MEMBROS.map((m, i) => ({
        id: `s${i}`,
        organization_id: ORG,
        user_id: m.user_id,
        endpoint: ponta(m.user_id),
        p256dh: "p",
        auth: "a",
      })),
      // A mesma pessoa noutra organização: revogar aqui não mexe lá.
      {
        id: "s-fora",
        organization_id: "org-b",
        user_id: "u-leitor",
        endpoint: "https://fcm.googleapis.com/fcm/send/leitor-em-b",
        p256dh: "p",
        auth: "a",
      },
    ],
    conversations: [
      {
        id: "c-do-responsavel",
        organization_id: ORG,
        assigned_to_user_id: "u-responsavel",
        is_private: false,
      },
      {
        id: "c-grupo-privado",
        organization_id: ORG,
        assigned_to_user_id: "u-responsavel",
        is_private: true,
      },
    ],
  };
});

const evento = (event_type: string, conversation_id: string) => ({
  id: `ev-${event_type}`,
  organization_id: ORG,
  event_type,
  entity_kind: "message",
  entity_id: "m1",
  payload: { conversation_id, body_preview: "meu CPF é 123", type: "text" },
  metadata: {},
  consumed_by: [],
  attempts: 0,
});

const quemRecebeu = () => db.enviados.map((e) => e.split("/").at(-1)).sort();

describe("push de mensagem: só quem vê a conversa, só membro ativo", () => {
  it("1:1 de outro atendente no modo padrão: o atendente que não a vê não recebe", async () => {
    await webPushInboundHandler.handle(evento("message.received", "c-do-responsavel"));
    expect(quemRecebeu()).toEqual(["u-admin", "u-gerente", "u-leitor", "u-responsavel"]);
  });

  it("grupo privado: só o responsável e a gestão — nem o leitor", async () => {
    await webPushInboundHandler.handle(evento("message.group_received", "c-grupo-privado"));
    expect(quemRecebeu()).toEqual(["u-admin", "u-gerente", "u-responsavel"]);
  });
});

describe("revogar o membro apaga as inscrições dele na organização", () => {
  it("a inscrição de quem saiu some; a dele em outra organização fica", async () => {
    const r = await revogar(new Request("http://x") as never, {
      params: Promise.resolve({ user_id: "u-leitor" }),
    });
    expect(r.status).toBe(200);
    const restantes = db.tabelas.push_subscriptions!.filter((s) => s.user_id === "u-leitor");
    expect(restantes.map((s) => s.organization_id)).toEqual(["org-b"]);
  });
});

/**
 * O envio de Web Push sai para um endereço que QUALQUER membro escolhe ao se
 * inscrever. Então: prazo no socket (sem ele o web-push nunca desiste de um
 * endpoint que segura a conexão, e o envio roda dentro do dreno de todas as
 * organizações) e a mesma guarda de egress dos webhooks na hora de enviar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviados = vi.hoisted(() => [] as Array<{ endpoint: string; opcoes: unknown }>);

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, _body: string, opcoes?: unknown) => {
      enviados.push({ endpoint: sub.endpoint, opcoes });
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
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
// Sem rede no teste: o nome público resolve para um IP público fixo.
vi.mock("node:dns/promises", async (orig) => {
  const real = await orig<typeof import("node:dns/promises")>();
  const lookup = async () => [{ address: "142.250.0.10", family: 4 }];
  return { ...real, lookup, default: { ...real, lookup } };
});

import { enviarPushDaOrg } from "./web_push";

const inscricoes = (endpoints: string[]) => ({
  from: () => ({
    select: () => ({
      eq: async () => ({
        data: endpoints.map((endpoint, i) => ({ id: `s${i}`, endpoint, p256dh: "p", auth: "a" })),
        error: null,
      }),
    }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
});

const AVISO = { title: "t", body: "b", tag: "x", href: "/app/inbox" };

describe("enviarPushDaOrg", () => {
  beforeEach(() => {
    enviados.length = 0;
  });

  it("todo envio leva um prazo de socket", async () => {
    await enviarPushDaOrg("org-a", AVISO, inscricoes(["https://fcm.googleapis.com/fcm/send/abc"]));
    expect(enviados).toHaveLength(1);
    const prazo = (enviados[0]!.opcoes as { timeout?: number } | undefined)?.timeout;
    expect(prazo, "sem timeout o web-push espera um endpoint parado para sempre").toBeGreaterThan(
      0,
    );
    expect(prazo!).toBeLessThanOrEqual(30_000);
  });

  it("endpoint interno ou de rede privada não recebe o POST", async () => {
    const r = await enviarPushDaOrg(
      "org-a",
      AVISO,
      inscricoes([
        "https://127.0.0.1:8443/push",
        "https://169.254.169.254/latest/meta-data/",
        "https://10.0.0.5/push",
        "https://fcm.googleapis.com/fcm/send/ok",
      ]),
    );
    expect(enviados.map((e) => e.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/ok"]);
    expect(r.sent).toBe(1);
  });
});

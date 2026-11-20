import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/channels";

const base = { organizationId: "o", sessionRef: "chave", to: "visitante-do-site" };

describe("chat no site — envio", () => {
  const adapter = getAdapter("webchat");

  it("texto com visitante ligado sai com id próprio", async () => {
    const r = await adapter.send({ ...base, kind: "text", body: "olá", providerConversationId: "webchat:c:h" });
    expect(r.externalId).toMatch(/^webchat:out:/);
  });

  it("mídia é recusada com frase clara, e conversa sem visitante também", async () => {
    await expect(
      adapter.send({ ...base, kind: "image", providerConversationId: "x", media: { url: "https://a/b.png" } as never }),
    ).rejects.toThrow(/só mostra texto/);
    await expect(adapter.send({ ...base, kind: "text", body: "olá" })).rejects.toThrow(/visitante/);
  });

  it("grupo não tem destinatário neste canal", () => {
    expect(adapter.resolveRecipient({ isGroup: true } as never)).toBeNull();
  });
});

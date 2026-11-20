// @vitest-environment jsdom
/**
 * O link do relatório LGPD entra no HTML escapado: uma URL com aspas não fecha
 * o atributo e não injeta marcação. Trazido do produto original (e2fb2b8e9),
 * adaptado ao e-mail daqui, que tem um link só.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarcaDeSaida } from "@/lib/branding/saida";

const enviados = vi.hoisted(() => [] as Array<{ html: string; text: string }>);
vi.mock("@/lib/email/roteador", () => ({
  sendEmail: async (mensagem: { html: string; text: string }) => {
    enviados.push(mensagem);
    return { ok: true, id: "email-sintetico" };
  },
}));
import { sendExportEmail } from "@/lib/lgpd/email-delivery";

beforeEach(() => {
  enviados.length = 0;
});

const marca = {
  nome: "Marca sintética",
  logoUrl: null,
  accent: "#2f6f4e",
  accentFg: "#ffffff",
} as unknown as MarcaDeSaida;

describe("link do relatório LGPD não vira HTML", () => {
  it("conserva a URL no href e no texto, sem marcação injetada", async () => {
    const signedUrl = 'https://storage.example.test/relatorio?token=a&x="><img src=x onerror=alert(1)>';
    await sendExportEmail({
      to: "titular@example.test",
      requestId: "pedido-sintetico",
      signedUrl,
      expiresAt: new Date("2026-11-01T12:00:00Z"),
      marca,
    });
    const mensagem = enviados[0]!;
    const doc = new DOMParser().parseFromString(mensagem.html, "text/html");
    expect(doc.querySelector("a")?.getAttribute("href")).toBe(signedUrl);
    expect(doc.querySelector("img[onerror]")).toBeNull();
    expect(mensagem.text).toContain(signedUrl);
  });
});

describe("link do convite não vira HTML", () => {
  it("conserva a URL no href e no texto visível, sem marcação injetada", async () => {
    const { buildInviteEmail } = await import("@/lib/email/templates/invite");
    const acceptUrl = 'https://crm.example.test/team/accept-invite/abc?x="><img src=x onerror=alert(1)>';
    const { html } = buildInviteEmail({
      inviterName: "Ana",
      orgName: "Loja",
      acceptUrl,
      role: "agent",
      expiresAt: new Date("2026-11-20T12:00:00Z"),
      marca,
    });
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("a")?.getAttribute("href")).toBe(acceptUrl);
    expect(doc.body.textContent).toContain(acceptUrl);
    expect(doc.querySelector("img[onerror]")).toBeNull();
  });
});

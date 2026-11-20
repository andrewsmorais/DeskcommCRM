/**
 * O MOTOR DE BUSCA DA PROSPECÇÃO, escolhido pela empresa na tela.
 *
 * A escolha mora em `organizations.settings.prospecting.provider` e é lida por
 * `provedorDaOrganizacao` (`lib/prospecting/provedor.ts`). Estes casos medem a
 * entrada (o schema só aceita os motores que a tela oferece; o `teste` é de
 * ambiente) e a gravação (o jsonb da empresa não perde o resto das settings).
 */
import { describe, expect, it } from "vitest";

import { escolhaGravada, gravarEscolha, PROVEDORES_NA_TELA, provedorExigeCredencialDaOrganizacao } from "@/lib/prospecting/provedor";
import { prospectingInputSchema } from "@/lib/prospecting/schema";

/** Um banco de uma linha só, que aplica as duas formas de update que `gravarEscolha` usa. */
function bancoDe(settings: Record<string, unknown> | null) {
  const estado = { settings };
  return {
    estado,
    query: async (sql: string, params?: unknown[]) => {
      if (sql.startsWith("select settings")) return { rows: [{ settings: estado.settings }] };
      const atual = (estado.settings ?? {}) as Record<string, unknown>;
      const prospeccao = { ...((atual.prospecting as Record<string, unknown> | undefined) ?? {}) };
      if (sql.includes("#-")) delete prospeccao.provider;
      else prospeccao.provider = params?.[1];
      estado.settings = { ...atual, prospecting: prospeccao };
      return { rows: [] };
    },
  };
}

describe("o motor de busca da prospecção", () => {
  it("o schema aceita os motores da tela, recusa o de teste e deixa a chave vazia só como texto", () => {
    for (const provider of PROVEDORES_NA_TELA) {
      expect(prospectingInputSchema.safeParse({ action: "configure", provider, api_key: "" }).success).toBe(true);
    }
    expect(prospectingInputSchema.safeParse({ action: "configure", provider: "teste", api_key: "x".repeat(12) }).success).toBe(false);
    expect(prospectingInputSchema.safeParse({ action: "configure", api_key: "x".repeat(12) }).success).toBe(true);
  });

  it("gravar a escolha não apaga o resto das settings, e apagar volta para a Apify", async () => {
    const banco = bancoDe({ llm: { provider: "openai" }, prospecting: { voz: "x" } });
    await gravarEscolha(banco as never, "org", "scavio");
    expect(await escolhaGravada(banco as never, "org")).toBe("scavio");
    expect(banco.estado.settings).toMatchObject({ llm: { provider: "openai" }, prospecting: { voz: "x", provider: "scavio" } });
    await gravarEscolha(banco as never, "org", null);
    expect(await escolhaGravada(banco as never, "org")).toBeNull();
    expect(banco.estado.settings).toMatchObject({ prospecting: { voz: "x" } });
  });

  it("só o motor próprio da instalação dispensa a chave da empresa", async () => {
    expect(await provedorExigeCredencialDaOrganizacao(bancoDe(null) as never, "org")).toBe(true);
    expect(await provedorExigeCredencialDaOrganizacao(bancoDe({ prospecting: { provider: "scavio" } }) as never, "org")).toBe(true);
    expect(await provedorExigeCredencialDaOrganizacao(bancoDe({ prospecting: { provider: "local-http" } }) as never, "org")).toBe(false);
  });
});

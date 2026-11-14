import { describe, expect, it } from "vitest";

import {
  configDoChatSchema,
  envioDoVisitanteSchema,
  hashDoVisitante,
  identidadeDoVisitante,
  lerConfigDoChat,
  novaChaveDoChat,
  chaveDoChatSchema,
  origemPermitida,
} from "./config";

const TOKEN = "A".repeat(43);
const ID = "0b0f7a52-3f0e-4c58-9a57-6d2a3c1e9f10";

describe("chat no site — configuração e entrada do visitante", () => {
  it("a chave nova passa no próprio schema e não se repete", () => {
    const a = novaChaveDoChat();
    expect(chaveDoChatSchema.safeParse(a).success).toBe(true);
    expect(novaChaveDoChat()).not.toBe(a);
  });

  it("configuração ausente ou estragada cai no padrão, campo a campo", () => {
    expect(lerConfigDoChat(null).cor).toBe("#4f46e5");
    const lida = lerConfigDoChat({ webchat: { cor: "vermelho", titulo: "Oi" } });
    expect(lida.cor).toBe("#4f46e5");
    expect(lida.titulo).toBe("Oi");
  });

  it("domínio é normalizado: sem protocolo, sem caminho, sem curinga", () => {
    const c = configDoChatSchema.parse({ dominios: ["https://Loja.com.br/pagina", "*.exemplo.com"] });
    expect(c.dominios).toEqual(["loja.com.br", "exemplo.com"]);
    expect(configDoChatSchema.safeParse({ dominios: ["javascript:alert(1)"] }).success).toBe(false);
  });

  it("origem: lista vazia libera tudo; com lista, só o domínio e seus subdomínios", () => {
    expect(origemPermitida(null, [])).toBe(true);
    expect(origemPermitida("https://www.loja.com.br", ["loja.com.br"])).toBe(true);
    expect(origemPermitida("https://loja.com.br", ["loja.com.br"])).toBe(true);
    expect(origemPermitida("https://loja.com.br.atacante.com", ["loja.com.br"])).toBe(false);
    expect(origemPermitida("https://naoloja.com.br", ["loja.com.br"])).toBe(false);
    expect(origemPermitida(null, ["loja.com.br"])).toBe(false);
    expect(origemPermitida("lixo", ["loja.com.br"])).toBe(false);
    expect(origemPermitida("http://loja.com.br", ["loja.com.br"])).toBe(false);
    expect(origemPermitida("http://localhost:3000", ["localhost:3000"])).toBe(true);
  });

  it("o banco guarda o hash, nunca o token", () => {
    const h = hashDoVisitante(TOKEN);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(identidadeDoVisitante("canal", h)).toBe(`webchat:canal:${h}`);
    expect(identidadeDoVisitante("canal", h)).not.toContain(TOKEN);
  });

  it("recusa token fora do formato, texto vazio, texto longo e NUL", () => {
    const base = { visitante: TOKEN, id: ID, texto: "oi" };
    expect(envioDoVisitanteSchema.safeParse(base).success).toBe(true);
    expect(envioDoVisitanteSchema.safeParse({ ...base, visitante: "curto" }).success).toBe(false);
    expect(envioDoVisitanteSchema.safeParse({ ...base, texto: "   " }).success).toBe(false);
    expect(envioDoVisitanteSchema.safeParse({ ...base, texto: "a".repeat(2001) }).success).toBe(false);
    expect(envioDoVisitanteSchema.safeParse({ ...base, texto: "a\u0000b" }).success).toBe(false);
    expect(envioDoVisitanteSchema.safeParse({ ...base, id: "nao-uuid" }).success).toBe(false);
    expect(envioDoVisitanteSchema.safeParse({ ...base, pagina: "javascript:x" }).success).toBe(false);
    expect(envioDoVisitanteSchema.safeParse({ ...base, pagina: "https://loja.com.br/p" }).success).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { origemDeRetorno } from "./origem-de-retorno";

describe("retorno da autenticação local", () => {
  const configured = "https://crm.example.com";
  it.each(["127.0.0.1", "localhost", "[::1]"])("mantém o cookie no host %s em desenvolvimento", (host) => {
    expect(origemDeRetorno(`http://${host}:3000/auth/confirm`, configured, true))
      .toBe(`http://${host}:3000`);
  });
  it.each(["http://127.0.0.1:3000/auth/confirm", "https://attacker.example/auth/confirm"])("preserva a configuração de produção para %s", (url) => {
    expect(origemDeRetorno(url, configured, false)).toBe(configured);
  });
  it.each(["https://localhost.attacker.example", "https://attacker.example", "http://user:pass@localhost:3000", "file://localhost/path", "invalid"])("recusa origem não local ou inválida: %s", (url) => {
    expect(origemDeRetorno(url, configured, true)).toBe(configured);
  });
});

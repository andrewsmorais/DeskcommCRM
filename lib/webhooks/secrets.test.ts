/**
 * O `secret_enc` de uma ação call_webhook é decifrado pelo executor com a
 * service role e a chave única da instalação, e vira a chave do HMAC de um
 * pedido para a URL que quem salvou a regra escolheu. Então o cifrado que
 * volta do editor só pode ser um que a própria regra já tinha gravado — senão
 * o executor decifra para um gerente o token cifrado de um canal que ele lê
 * pela RLS mas não poderia abrir.
 */
import { describe, expect, it } from "vitest";

import { encryptRuleActionSecrets } from "./secrets";

const admin = {
  rpc: async (_fn: string, args: { plaintext: string }) => ({
    data: `\\xenc(${args.plaintext})`,
    error: null,
  }),
} as never;

const webhook = (config: Record<string, unknown>) => ({
  type: "call_webhook",
  config: { url: "https://x.com", ...config },
});

describe("encryptRuleActionSecrets", () => {
  it("segredo digitado é cifrado e o texto aberto nunca é gravado", async () => {
    const r = await encryptRuleActionSecrets(admin, [webhook({ secret: "abc" })], []);
    expect(r).toEqual([webhook({ secret_enc: "enc(abc)" })]);
  });

  it("o secret_enc que a regra já tinha gravado passa no round-trip do editor", async () => {
    const gravadas = [webhook({ secret_enc: "deadbeef" })];
    const r = await encryptRuleActionSecrets(
      admin,
      [webhook({ secret_enc: "deadbeef" })],
      gravadas,
    );
    expect(r).toEqual([webhook({ secret_enc: "deadbeef" })]);
  });

  it("secret_enc que a regra não tinha é descartado, na criação e na edição", async () => {
    const tokenDoCanal = "c0ffee";
    const criada = await encryptRuleActionSecrets(
      admin,
      [webhook({ secret_enc: tokenDoCanal })],
      [],
    );
    expect(criada).toEqual([webhook({})]);

    const gravadas = [webhook({ secret_enc: "deadbeef" })];
    const editada = await encryptRuleActionSecrets(
      admin,
      [webhook({ secret_enc: tokenDoCanal })],
      gravadas,
    );
    expect(editada).toEqual([webhook({})]);
  });

  it("sem cifra na instalação, recusa em vez de gravar aberto", async () => {
    const semCifra = {
      rpc: async () => ({ data: null, error: { message: "sem chave" } }),
    } as never;
    expect(await encryptRuleActionSecrets(semCifra, [webhook({ secret: "abc" })], [])).toBeNull();
  });
});

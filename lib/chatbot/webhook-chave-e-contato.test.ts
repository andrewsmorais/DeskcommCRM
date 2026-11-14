// @vitest-environment node
import { describe, expect, it } from "vitest";

import { lerConfig } from "./passos";
import { chamarWebhookDoChatbot } from "./webhook";

const envio = {
  fluxoId: "f",
  passoId: "p",
  conversationId: "c",
  contato: { id: "ct", nome: 'Ana "Aninha" Souza', telefone: "+5511999998888", email: "ana@exemplo.com" },
  mensagem: null,
  respostas: { cpf: "12345678909" },
};

describe("WebHook: cabeçalho da chave e ficha do contato", () => {
  it("a chave vai no cabeçalho escolhido, e os dados do contato entram no corpo sem quebrar o JSON", async () => {
    let visto: { headers: Record<string, string>; body: string } | null = null;
    const fetchFalso = (async (_url: string, init: RequestInit) => {
      visto = { headers: init.headers as Record<string, string>, body: String(init.body) };
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = lerConfig("webhook", {
      url: "https://api.exemplo.com/clientes",
      metodo: "POST",
      corpo_modo: "personalizado",
      corpo: '{"name":"{{contato_nome}}","cpf":"{{cpf}}","tel":"{{contato_telefone}}"}',
      autorizacao_cabecalho: "access_token",
    });
    const r = await chamarWebhookDoChatbot(c, envio, { segredo: null, autorizacao: "chave-de-teste" }, { fetch: fetchFalso, pularChecagemDeRede: true });
    expect(r.ok).toBe(true);
    expect(visto!.headers.access_token).toBe("chave-de-teste");
    expect(visto!.headers.Authorization).toBeUndefined();
    expect(JSON.parse(visto!.body)).toEqual({ name: 'Ana "Aninha" Souza', cpf: "12345678909", tel: "+5511999998888" });
  });

  it("sem escolher nada, a chave segue no Authorization; valor fora da lista volta ao padrão", () => {
    expect(lerConfig("webhook", {}).autorizacao_cabecalho).toBe("Authorization");
    expect(lerConfig("webhook", { autorizacao_cabecalho: "Cookie" }).autorizacao_cabecalho).toBe("Authorization");
  });
});

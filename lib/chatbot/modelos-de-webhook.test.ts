// @vitest-environment node
import { describe, expect, it } from "vitest";

import { MODELOS_DE_WEBHOOK } from "./modelos-de-webhook";
import { lerConfig } from "./passos";
import { problemasDoGrafo } from "./validar";
import { chamarWebhookDoChatbot } from "./webhook";
import { cabecalhoReservado, corpoPersonalizado } from "./webhook-corpo";

const envio = {
  fluxoId: "f",
  passoId: "p",
  conversationId: "c",
  contato: { id: "ct", nome: 'Ana "Aninha" Souza', telefone: "+5511999998888", email: "ana@exemplo.com" },
  mensagem: null,
  respostas: { cpf: "12345678909", valor: "150.00", vencimento: "2026-12-10", descricao: "Consulta", asaas_cliente: "cus_1", pipedrive_pessoa: "42" },
};

describe("modelos prontos do WebHook (Asaas e Pipedrive)", () => {
  it.each(MODELOS_DE_WEBHOOK)("$id: passa na validação do fluxo e o corpo vira JSON válido", (m) => {
    const grafo = {
      nodes: [
        { id: "ini", type: "inicio_canal", position: { x: 0, y: 0 }, data: {} },
        { id: "w", type: "webhook", position: { x: 0, y: 0 }, data: { ...m.config } },
      ],
      edges: [{ id: "e", source: "ini", target: "w", sourceHandle: "proximo" }],
    };
    expect(problemasDoGrafo(grafo as never)).toEqual([]);
    const c = lerConfig("webhook", m.config);
    expect(c.url).toBe(m.config.url);
    expect(c.autorizacao_cabecalho).toBe(m.config.autorizacao_cabecalho);
    const corpo = corpoPersonalizado(c.corpo, { ...envio.respostas, contato_nome: envio.contato.nome, contato_telefone: envio.contato.telefone, contato_email: envio.contato.email });
    expect(corpo).not.toBeNull();
    expect(() => JSON.parse(corpo!)).not.toThrow();
    expect(new URL(c.url).protocol).toBe("https:");
  });

  it("a chave vai no cabeçalho do modelo, para o host do modelo, com os dados do contato no corpo", async () => {
    const m = MODELOS_DE_WEBHOOK.find((x) => x.id === "asaas_cliente")!;
    let visto: { url: string; headers: Record<string, string>; body: string } | null = null;
    const fetchFalso = (async (url: string, init: RequestInit) => {
      visto = { url, headers: init.headers as Record<string, string>, body: String(init.body) };
      return new Response(JSON.stringify({ id: "cus_000123" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await chamarWebhookDoChatbot(lerConfig("webhook", m.config), envio, { segredo: null, autorizacao: "$aact_chave_de_teste" }, { fetch: fetchFalso, pularChecagemDeRede: true });
    expect(r.ok).toBe(true);
    expect(visto!.url).toBe("https://api.asaas.com/v3/customers");
    expect(visto!.headers.access_token).toBe("$aact_chave_de_teste");
    expect(visto!.headers.Authorization).toBeUndefined();
    // Aspas no nome do contato não quebram o JSON.
    expect(JSON.parse(visto!.body)).toMatchObject({ name: 'Ana "Aninha" Souza', cpfCnpj: "12345678909", mobilePhone: "+5511999998888" });
  });

  it("sem escolher nada, a chave segue no Authorization como sempre", () => {
    expect(lerConfig("webhook", {}).autorizacao_cabecalho).toBe("Authorization");
    expect(lerConfig("webhook", { autorizacao_cabecalho: "Cookie" }).autorizacao_cabecalho).toBe("Authorization");
    // E os cabeçalhos livres do passo seguem sem poder escrever os da chave.
    expect(cabecalhoReservado("Authorization")).toBe(true);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";

import { historicoEmTexto, linhasDoHistorico, type MensagemDoHistorico } from "./historico";
import { textoParaPdf } from "./historico-pdf";

const m = (p: Partial<MensagemDoHistorico>): MensagemDoHistorico => ({
  type: "text",
  direction: "inbound",
  body: null,
  sent_via: "external_device",
  sent_by_user_id: null,
  sent_at: "2026-11-13T17:30:00Z",
  created_at: "2026-11-13T17:30:00Z",
  ...p,
});
const ctx = { nomeDoContato: "Mariana", nomesDaEquipe: { u1: "Ana Lima" }, fuso: "America/Sao_Paulo" };

describe("histórico da conversa", () => {
  it("quem fala, na hora da empresa", () => {
    const l = linhasDoHistorico(
      [
        m({ body: "Oi, tudo bem?" }),
        m({ direction: "outbound", sent_via: "user", sent_by_user_id: "u1", body: "Tudo! Como ajudo?" }),
        m({ direction: "outbound", sent_via: "ai", body: "Posso ajudar com o pedido." }),
      ],
      ctx,
    );
    expect(l[0]).toEqual({ quando: "13/11/2026 14:30", quem: "Mariana", texto: "Oi, tudo bem?" });
    expect(l[1]?.quem).toBe("Ana Lima");
    expect(l[2]?.quem).toBe("Agente de IA");
  });

  it("mídia vira marcador com legenda; apagada não mostra o texto", () => {
    const l = linhasDoHistorico(
      [m({ type: "image", body: "comprovante" }), m({ type: "audio" }), m({ body: "segredo", revoked_at: "2026-11-13T18:00:00Z" })],
      ctx,
    );
    expect(l.map((x) => x.texto)).toEqual(["[imagem] comprovante", "[áudio]", "[mensagem apagada]"]);
  });

  it("o .txt tem cabeçalho e uma linha por mensagem", () => {
    const txt = historicoEmTexto(linhasDoHistorico([m({ body: "linha 1\nlinha 2" })], ctx), {
      nomeDoContato: "Mariana",
      telefone: "+5511988887777",
      geradoEm: "13/11/2026 19:00",
      truncado: false,
    });
    expect(txt).toContain("Histórico da conversa com Mariana (+5511988887777)");
    expect(txt).toContain("[13/11/2026 14:30] Mariana: linha 1\n    linha 2");
  });

  it("o PDF tira o que a fonte não desenha (emoji), sem perder acento", () => {
    expect(textoParaPdf("Obrigada 😊 pela atenção!")).toBe("Obrigada  pela atenção!");
  });
});

describe("histórico em PDF", () => {
  it("gera um PDF de verdade", async () => {
    const { historicoEmPdf } = await import("./historico-pdf");
    const buf = await historicoEmPdf({
      titulo: "Histórico da conversa com Mariana",
      sub: "Gerado em 13/11/2026 19:00 · 2 mensagens",
      linhas: linhasDoHistorico([m({ body: "Oi 😊" }), m({ direction: "outbound", sent_via: "user", sent_by_user_id: "u1", body: "Olá!" })], ctx),
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    if (process.env.SALVAR_PDF_DO_HISTORICO) (await import("node:fs")).writeFileSync(process.env.SALVAR_PDF_DO_HISTORICO, buf);
  }, 30_000);
});

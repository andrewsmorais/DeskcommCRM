/**
 * Venda ganha → TikTok Events API 2.0 (`CompletePayment`).
 *
 * Fonte: documentação da Events API 2.0, conferida em 20/11/2026 —
 * `POST https://business-api.tiktok.com/open_api/v1.3/event/track/`, cabeçalho
 * `Access-Token`, corpo `{ event_source, event_source_id, data: [...] }`.
 *
 *   - `event_source: "web"` + `event_source_id` = o código do pixel: o clique
 *     que originou a conversa veio de um link (a página do link rastreável), e
 *     o `ttclid` que o TikTok pôs nele é o que liga a venda ao anúncio;
 *   - `user.phone` = SHA-256 do telefone com `+` e só dígitos (`+5511…`), como
 *     a plataforma pede ANTES do hash;
 *   - `event_id` = `<leadId>:Purchase`, a mesma chave de deduplicação dos
 *     outros transportes;
 *   - sucesso é HTTP 200 com `code: 0` no corpo; `code` diferente de zero é
 *     recusa (pixel, token ou campo), e vira `permanente` com a mensagem dela.
 *
 * Código de teste: quando a tela tem um, vai em `test_event_code` e o evento
 * aparece em "Eventos de teste" do gerenciador sem contar para a otimização.
 */
import { logger } from "@/lib/logger";

import { chamar, pelaSituacaoHttp, recusaSeNaoForCompra, sha256 } from "../envio-http";
import type {
  ConversaoOffline,
  CredencialDeConversao,
  ResultadoDeEnvio,
  TransporteDeConversao,
} from "../types";

export const URL_DO_TIKTOK = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

export function corpoDoTiktok(credencial: CredencialDeConversao, conversao: ConversaoOffline) {
  const usuario: Record<string, string> = { ttclid: conversao.cliqueDeOrigem };
  if (conversao.telefone) usuario.phone = sha256(`+${conversao.telefone.replace(/\D/g, "")}`);
  return {
    event_source: "web",
    event_source_id: credencial.datasetId,
    ...(credencial.testEventCode ? { test_event_code: credencial.testEventCode } : {}),
    data: [
      {
        event: "CompletePayment",
        // Segundos: em milissegundos o evento cai no futuro distante.
        event_time: Math.floor(conversao.ocorridoEm.getTime() / 1000),
        event_id: conversao.eventoId,
        user: usuario,
        properties: {
          value: (conversao.valorCentavos ?? 0) / 100,
          currency: conversao.moeda.toUpperCase(),
        },
      },
    ],
  };
}

async function enviar(
  credencial: CredencialDeConversao,
  conversao: ConversaoOffline,
): Promise<ResultadoDeEnvio> {
  const recusa = recusaSeNaoForCompra(conversao.evento, conversao.valorCentavos);
  if (recusa) return recusa;

  const r = await chamar(URL_DO_TIKTOK, {
    method: "POST",
    headers: { "content-type": "application/json", "Access-Token": credencial.accessToken },
    body: JSON.stringify(corpoDoTiktok(credencial, conversao)),
  });
  if (r.tipo === "falha") return { tipo: "transitorio", detalhe: r.detalhe };

  const corpo = (r.corpo ?? {}) as { code?: number; message?: string };
  const mensagem = corpo.message ?? r.texto.slice(0, 300);
  if (r.status === 200 && corpo.code === 0) return { tipo: "ok" };

  logger.warn("[conversoes.tiktok] envio recusado", {
    status: r.status,
    codigo: corpo.code ?? null,
    leadId: conversao.leadId,
  });
  if (r.status === 200) return { tipo: "permanente", detalhe: `código ${corpo.code ?? "?"}: ${mensagem}` };
  return pelaSituacaoHttp(r.status, mensagem);
}

export const transporteTiktok: TransporteDeConversao = { plataforma: "tiktok_ads", enviar };

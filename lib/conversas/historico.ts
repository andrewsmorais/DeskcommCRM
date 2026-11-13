/**
 * HISTÓRICO DA CONVERSA PARA BAIXAR (.txt e .pdf) — o "Baixar histórico" da
 * Umbler Talk. PURO: recebe as mensagens já lidas (pela RLS de quem pediu) e
 * devolve as linhas "[25/12/2026 14:30] Nome: texto".
 *
 * Mídia vira um marcador ("[imagem]", "[áudio]"…) com a legenda, quando há;
 * mensagem apagada vira "[mensagem apagada]". Notas internas NÃO entram: o
 * arquivo é o que o cliente e a empresa conversaram.
 */
import { lerRemetenteDeGrupo, rotuloDoRemetente } from "@/lib/messaging/remetente-de-grupo";

export type MensagemDoHistorico = {
  type: string;
  direction: "inbound" | "outbound" | string;
  body: string | null;
  sent_via: string | null;
  sent_by_user_id: string | null;
  sent_at: string | null;
  created_at: string;
  revoked_at?: string | null;
  metadata?: unknown;
};

export type LinhaDoHistorico = { quando: string; quem: string; texto: string };

const MARCADOR: Record<string, string> = {
  image: "[imagem]",
  video: "[vídeo]",
  audio: "[áudio]",
  voice: "[áudio]",
  ptt: "[áudio]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localização]",
  contact: "[contato]",
  template: "[modelo]",
};

const QUEM_FORA_DA_EQUIPE: Record<string, string> = {
  ai: "Agente de IA",
  automation: "Automação",
  system: "Sistema",
  external_device: "Enviado pelo celular",
  crm: "Sistema",
};

export function quandoNoFuso(instante: string, fuso: string): string {
  const d = new Date(instante);
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(d)
      .replace(",", "");
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function linhasDoHistorico(
  mensagens: MensagemDoHistorico[],
  ctx: { nomeDoContato: string; nomesDaEquipe: Record<string, string>; fuso: string },
): LinhaDoHistorico[] {
  return mensagens.map((m) => {
    let quem: string;
    if (m.direction === "inbound") {
      const g = lerRemetenteDeGrupo(m.metadata);
      quem = g ? rotuloDoRemetente(g) : ctx.nomeDoContato;
    } else if (m.sent_via === "user" && m.sent_by_user_id) {
      quem = ctx.nomesDaEquipe[m.sent_by_user_id] ?? "Atendente";
    } else {
      quem = QUEM_FORA_DA_EQUIPE[m.sent_via ?? ""] ?? "Equipe";
    }
    let texto: string;
    if (m.revoked_at) texto = "[mensagem apagada]";
    else {
      const marcador = MARCADOR[m.type];
      const corpo = (m.body ?? "").trim();
      texto = marcador ? (corpo ? `${marcador} ${corpo}` : marcador) : corpo || "[mensagem sem texto]";
    }
    return { quando: quandoNoFuso(m.sent_at ?? m.created_at, ctx.fuso), quem, texto };
  });
}

/** O arquivo .txt: cabeçalho e uma linha por mensagem (quebras internas indentadas). */
export function historicoEmTexto(
  linhas: LinhaDoHistorico[],
  cab: { nomeDoContato: string; telefone: string | null; geradoEm: string; truncado: boolean },
): string {
  const topo = [
    `Histórico da conversa com ${cab.nomeDoContato}${cab.telefone ? ` (${cab.telefone})` : ""}`,
    `Gerado em ${cab.geradoEm}. ${linhas.length} mensagens.`,
    ...(cab.truncado ? ["Mostrando só as mensagens mais recentes (limite do arquivo)."] : []),
    "",
  ];
  const corpo = linhas.map((l) => `[${l.quando}] ${l.quem}: ${l.texto.replace(/\r?\n/g, "\n    ")}`);
  return `${[...topo, ...corpo].join("\n")}\n`;
}

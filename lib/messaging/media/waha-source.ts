/**
 * MediaSource do WAHA: baixa o binário hospedado pelo container WAHA.
 *
 * A URL anunciada no webhook NÃO é confiável nem correta: o HMAC é
 * best-effort (payload forjado é possível) e o WAHA anuncia seu endereço
 * INTERNO (ex.: localhost:3000 dentro do container, mapeado p/ 3030 no
 * host). Por isso o fetch é SEMPRE reconstruído sobre WAHA_API_BASE_URL,
 * aproveitando apenas path+query da URL anunciada — SSRF impossível por
 * construção (o host nunca vem do payload). A futura MetaMediaSource
 * implementa a mesma assinatura baixando via media_id + Graph API.
 *
 * Trocar o host NÃO bastava (auditoria de 18/11, achado 1): o path e a query
 * vinham de quem escreveu a linha, e `messages.media_url` de mensagem ENVIADA é
 * escrita por qualquer atendente (API, MCP ou PostgREST direto). Com
 * `/api/sessions?all=true` ou `/api/<sessão de outra empresa>/chats` no lugar
 * do arquivo, o servidor fazia o GET na API administrativa do WAHA com a chave
 * da instalação e devolvia a resposta. Por isso o path agora é CONFERIDO: só o
 * armazém de arquivos do WAHA (`/api/files/<arquivo>` ou
 * `/api/files/<sessão>/<arquivo>`), da sessão da própria mensagem, e a query é
 * descartada. Qualquer outro caminho é recusado antes de qualquer rede.
 */
import {
  MAX_MEDIA_BYTES,
  MediaTooLargeError,
  type FetchedMedia,
} from "@/lib/messaging/media/types";

const FETCH_TIMEOUT_MS = 30_000;

/** Um segmento de nome de arquivo do WAHA: letras, dígitos e `_ . @ -`. Sem `%`
 *  (um `%2F` decodificado do outro lado viraria barra) e sem `.`/`..`. */
const SEGMENTO_DE_ARQUIVO = /^[A-Za-z0-9_.@-]+$/;

/**
 * O path seguro de uma mídia anunciada pelo WAHA, ou `null` quando ela não
 * aponta para o armazém de arquivos da sessão. Exportada para os testes.
 */
export function pathDeArquivoDoWaha(
  mediaUrl: string,
  sessionRef?: string | null,
): string | null {
  let advertised: URL;
  try {
    advertised = new URL(mediaUrl);
  } catch {
    return null;
  }
  // `new URL` já resolveu `.`/`..` e `%2e`; o que sobra é conferido segmento a segmento.
  const partes = advertised.pathname.split("/");
  if (partes[0] !== "" || partes[1] !== "api" || partes[2] !== "files") return null;
  const arquivo = partes.slice(3);
  if (arquivo.length !== 1 && arquivo.length !== 2) return null;
  for (const segmento of arquivo) {
    if (!SEGMENTO_DE_ARQUIVO.test(segmento) || segmento === "." || segmento === "..") return null;
  }
  // `/api/files/<sessão>/<arquivo>`: a pasta tem de ser a da PRÓPRIA mensagem.
  if (arquivo.length === 2 && (!sessionRef || arquivo[0] !== sessionRef)) return null;
  return advertised.pathname;
}

export async function fetchWahaMedia(
  mediaUrl: string,
  hintMime?: string | null,
  sessionRef?: string | null,
): Promise<FetchedMedia> {
  const base = process.env.WAHA_API_BASE_URL;
  const path = pathDeArquivoDoWaha(mediaUrl, sessionRef);
  if (!path) throw new Error("waha_media_untrusted_path");
  let url: URL;
  try {
    // Host/porta e query descartados: só o path conferido, resolvido na base.
    url = new URL(path, base ?? "");
  } catch {
    throw new Error("waha_media_untrusted_host");
  }

  const apiKey = process.env.WAHA_API_KEY;
  const res = await fetch(url.toString(), {
    headers: apiKey ? { "X-Api-Key": apiKey } : {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`waha_media_${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const mime = res.headers.get("content-type") || hintMime || "application/octet-stream";
  return { buffer, mime };
}

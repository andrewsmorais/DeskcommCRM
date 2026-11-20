/**
 * FETCH COM O IP FIXADO NA CONEXÃO — fecha o DNS rebinding (auditoria 18/11, nº 21).
 *
 * A guarda da casa (`assertDestinoResolvidoSeguro`) resolve o nome e recusa IP
 * interno, mas o `fetch` global resolve DE NOVO ao conectar. Entre as duas
 * perguntas um DNS malicioso pode trocar a resposta (TTL zero: primeiro um IP
 * público, depois `127.0.0.1` ou `169.254.169.254`), e o servidor da VPS lia a
 * própria rede interna achando que lia o site do prospecto.
 *
 * Aqui a resolução acontece UMA vez: os endereços são conferidos e a conexão é
 * aberta com um `lookup` que só devolve esses endereços. Nome, SNI e cabeçalho
 * `Host` continuam os do site — o certificado é validado normalmente, que era a
 * objeção registrada em `outbound-ip.ts` (fixar trocando a URL pelo IP quebraria
 * TLS; fixar pelo `lookup` não quebra). É a técnica de `lib/extensions/download.ts`.
 *
 * Devolve um `Response` web com o mínimo que os chamadores usam (status,
 * cabeçalhos, corpo em stream, `url`), sem seguir redirecionamento: quem chama
 * segue à mão e passa por aqui de novo a cada salto.
 */
import { lookup as lookupDns } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import zlib from "node:zlib";

import { ipEhEspecial } from "@/lib/automation/outbound-ip";

export type ResolverDns = (
  hostname: string,
  opcoes: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

const STATUS_SEM_CORPO = new Set([101, 103, 204, 205, 304]);

function semColchetes(host: string): string {
  return host.replace(/^\[(.*)\]$/, "$1");
}

/** Erro no formato do `fetch` do Node (`TypeError` com a causa em `cause`). */
function falhaDeFetch(causa: unknown): TypeError {
  return new TypeError("fetch failed", { cause: causa });
}

/**
 * Resolve e confere: todos os endereços têm de ser públicos. Um único interno
 * recusa o nome inteiro — com vários IPs, a conexão poderia escolher justo esse.
 */
export async function enderecosPublicos(
  hostname: string,
  resolver: ResolverDns = lookupDns as unknown as ResolverDns,
  ehInterno: (ip: string) => boolean = ipEhEspecial,
): Promise<Array<{ address: string; family: number }>> {
  const literal = semColchetes(hostname);
  const familia = isIP(literal);
  if (familia !== 0) {
    if (ehInterno(literal)) throw falhaDeFetch(new Error("unsafe_url:private_ip"));
    return [{ address: literal, family: familia }];
  }
  let enderecos: Array<{ address: string; family: number }>;
  try {
    enderecos = await resolver(literal, { all: true, verbatim: true });
  } catch (erro) {
    throw falhaDeFetch(erro);
  }
  if (enderecos.length === 0) throw falhaDeFetch(new Error("unsafe_url:dns_empty"));
  for (const { address } of enderecos) {
    if (ehInterno(address)) throw falhaDeFetch(new Error("unsafe_url:private_ip"));
  }
  return enderecos;
}

/** `lookup` que só responde com os endereços já conferidos, e só para o nome esperado. */
export function lookupFixo(
  esperado: string,
  enderecos: Array<{ address: string; family: number }>,
): LookupFunction {
  return (hostname, opcoes, callback) => {
    if (hostname !== esperado || enderecos.length === 0) {
      callback(Object.assign(new Error("Hostname inesperado."), { code: "EHOSTUNREACH" }), "", 0);
      return;
    }
    if ((opcoes as { all?: boolean }).all) {
      (callback as unknown as (e: null, a: typeof enderecos) => void)(null, enderecos);
      return;
    }
    const primeiro = enderecos[0]!;
    callback(null, primeiro.address, primeiro.family);
  };
}

function descompactar(resposta: http.IncomingMessage): Readable {
  const codificacao = String(resposta.headers["content-encoding"] ?? "").toLowerCase().trim();
  if (codificacao === "gzip" || codificacao === "x-gzip") return resposta.pipe(zlib.createGunzip());
  if (codificacao === "deflate") return resposta.pipe(zlib.createInflate());
  if (codificacao === "br") return resposta.pipe(zlib.createBrotliDecompress());
  return resposta;
}

/**
 * `fetch` com o IP fixado. Mesma assinatura usada pela auditoria de site:
 * `redirect` é sempre manual (a resposta 3xx volta para quem chamou).
 */
export function criarFetchComIpFixo(
  resolver: ResolverDns = lookupDns as unknown as ResolverDns,
  /** Só os testes trocam: produção usa sempre a régua da casa. */
  ehInterno: (ip: string) => boolean = ipEhEspecial,
): typeof fetch {
  return (async (entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw falhaDeFetch(new Error("protocolo-bloqueado"));
    }
    const host = semColchetes(url.hostname);
    const enderecos = await enderecosPublicos(host, resolver, ehInterno);

    const cabecalhos: Record<string, string> = {};
    new Headers(init?.headers).forEach((valor, chave) => {
      cabecalhos[chave] = valor;
    });
    cabecalhos["accept-encoding"] ??= "gzip, deflate, br";

    const transporte = url.protocol === "https:" ? https : http;
    const sinal = init?.signal ?? undefined;

    return new Promise<Response>((resolve, reject) => {
      const pedido = transporte.request(
        url,
        {
          method: init?.method ?? "GET",
          headers: cabecalhos,
          agent: false,
          signal: sinal,
          lookup: lookupFixo(host, enderecos),
          // SNI com o NOME do site (literal de IP não leva SNI): o certificado
          // continua sendo conferido contra o domínio, como no fetch comum.
          ...(url.protocol === "https:" && isIP(host) === 0 ? { servername: host } : {}),
        },
        (resposta) => {
          const status = resposta.statusCode ?? 0;
          if (status < 200 || status > 599) {
            resposta.destroy();
            reject(falhaDeFetch(new Error(`status-invalido:${status}`)));
            return;
          }
          const headers = new Headers();
          for (const [chave, valor] of Object.entries(resposta.headers)) {
            if (valor === undefined) continue;
            for (const v of Array.isArray(valor) ? valor : [valor]) headers.append(chave, v);
          }
          // O corpo já sai descompactado: estes dois não descrevem mais o que chega.
          headers.delete("content-encoding");
          headers.delete("content-length");
          const corpo = STATUS_SEM_CORPO.has(status)
            ? null
            : (Readable.toWeb(descompactar(resposta)) as unknown as ReadableStream<Uint8Array>);
          if (corpo === null) resposta.resume();
          const r = new Response(corpo, { status, headers });
          Object.defineProperty(r, "url", { value: url.href });
          resolve(r);
        },
      );
      pedido.once("error", (erro) => reject(falhaDeFetch(erro)));
      pedido.end();
    });
  }) as typeof fetch;
}

/** O de produção. */
export const fetchComIpFixo: typeof fetch = criarFetchComIpFixo();

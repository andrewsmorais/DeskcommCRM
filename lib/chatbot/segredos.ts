/**
 * Segredos do passo "WebHook" no desenho do chatbot.
 *
 * `chatbot_flows.grafo` é lido por qualquer membro da organização (a lista de
 * fluxos e o editor). Então o texto puro do segredo de assinatura e do
 * cabeçalho de autorização NUNCA é gravado: o editor manda `segredo` /
 * `autorizacao` em texto, e esta função troca por `segredo_enc` /
 * `autorizacao_enc` (pgp_sym, a mesma cifra dos webhooks das automações)
 * antes do UPDATE. String vazia em `*_enc` = a pessoa removeu.
 *
 * O cifrado que VOLTA do editor só é aceito se for exatamente o que já está
 * gravado neste fluxo para o MESMO passo (mesmo id de nó). O executor decifra
 * o que estiver gravado com a service role e a chave única da instalação
 * (`fn_decrypt_oauth`), e põe o resultado no cabeçalho de um pedido para a URL
 * que quem salvou escolheu. Aceitar qualquer `*_enc` vindo do cliente fazia do
 * executor um decifrador: um gerente colava ali o token cifrado de um canal ou
 * o OAuth do Google Agenda de outro membro (que a RLS deixa ler, mas que só a
 * service role decifra) e recebia o texto aberto no próprio servidor. Cifrado
 * desconhecido é descartado; segredo novo só entra digitado, e aí é cifrado
 * aqui.
 *
 * LACRE (11/11/2026). A regra acima só valia na rota: o `grafo` também é
 * gravável pela REST do Supabase por quem tem acesso de gerente, e por ali o
 * cifrado colado chegava ao executor sem passar por esta função. Por isso o
 * texto cifrado agora leva um LACRE — organização, fluxo, passo e campo — e o
 * executor só usa o que abre com o lacre do passo que está rodando. O token de
 * um canal ou o OAuth de outro membro, colado ali, abre sem lacre e é recusado;
 * o segredo de outro passo ou de outro fluxo abre com o lacre errado e também.
 * Segredo gravado antes do lacre precisa ser digitado de novo uma vez (o passo
 * segue por "Falhou" e a conversa ganha nota dizendo isso).
 *
 * Devolve null quando a cifra não está disponível na instalação — a rota
 * responde 422 em vez de gravar o segredo aberto.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";
import type { Grafo } from "./passos";

const CAMPOS = [
  ["segredo", "segredo_enc"],
  ["autorizacao", "autorizacao_enc"],
] as const;

/** Onde um segredo pode ser usado: a organização, o fluxo e o passo que o gravaram. */
export type LacreDoSegredo = { organizationId: string; flowId: string; nodeId: string };

const PREFIXO_DO_LACRE = "cbwh1:";

function lacrar(lacre: LacreDoSegredo, campo: string, valor: string): string {
  return `${PREFIXO_DO_LACRE}${JSON.stringify({ o: lacre.organizationId, f: lacre.flowId, n: lacre.nodeId, c: campo, v: valor })}`;
}

/** O valor, se o texto aberto tem o lacre DESTE passo; senão null. */
export function abrirLacre(aberto: string, lacre: LacreDoSegredo, campo: string): string | null {
  if (!aberto.startsWith(PREFIXO_DO_LACRE)) return null;
  try {
    const x = JSON.parse(aberto.slice(PREFIXO_DO_LACRE.length)) as Record<string, unknown>;
    if (
      x.o !== lacre.organizationId ||
      x.f !== lacre.flowId ||
      x.n !== lacre.nodeId ||
      x.c !== campo
    )
      return null;
    return typeof x.v === "string" && x.v ? x.v : null;
  } catch {
    return null;
  }
}

/** Os `*_enc` de cada passo WebHook do desenho que está gravado, por id de nó (pode haver mais de um). */
function cifradosGravados(anterior: unknown): Map<string, Partial<Record<string, Set<string>>>> {
  const porNo = new Map<string, Partial<Record<string, Set<string>>>>();
  const nos = (anterior as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(nos)) return porNo;
  for (const no of nos as Array<{ id?: unknown; type?: unknown; data?: unknown }>) {
    if (no?.type !== "webhook" || typeof no.id !== "string") continue;
    const data = (no.data ?? {}) as Record<string, unknown>;
    const gravados = porNo.get(no.id) ?? {};
    for (const [, cifrado] of CAMPOS) {
      const valor = data[cifrado];
      if (typeof valor === "string" && valor) (gravados[cifrado] ??= new Set()).add(valor);
    }
    porNo.set(no.id, gravados);
  }
  return porNo;
}

/**
 * `anterior` é o `grafo` que está gravado AGORA neste fluxo (lido pelo
 * servidor, nunca do corpo do pedido); null para fluxo sem desenho.
 */
export async function cifrarSegredosDoGrafo(
  admin: SupabaseClient,
  grafo: Grafo,
  anterior: unknown,
  dono: { organizationId: string; flowId: string },
): Promise<Grafo | null> {
  const gravados = cifradosGravados(anterior);
  const nodes: Grafo["nodes"] = [];
  for (const no of grafo.nodes) {
    if (no.type !== "webhook") {
      nodes.push(no);
      continue;
    }
    const data: Record<string, unknown> = { ...no.data };
    for (const [aberto, cifrado] of CAMPOS) {
      const texto = data[aberto];
      delete data[aberto];
      if (typeof texto === "string" && texto.trim()) {
        const enc = await encryptWebhookSecret(
          admin,
          lacrar({ ...dono, nodeId: no.id }, cifrado, texto.trim()),
        );
        if (enc === null) return null;
        data[cifrado] = enc;
      } else if (typeof data[cifrado] === "string" && data[cifrado] !== "") {
        // Só o que este passo já tinha. Qualquer outro cifrado (de outro
        // passo, de outro fluxo, de outra coluna) cai.
        if (!gravados.get(no.id)?.[cifrado]?.has(data[cifrado] as string)) data[cifrado] = null;
      } else if (data[cifrado] === "") {
        data[cifrado] = null;
      }
    }
    nodes.push({ ...no, data });
  }
  return { ...grafo, nodes };
}

/**
 * Abre os segredos do passo que está rodando. Um segredo gravado que não abre
 * — cifra indisponível, ou lacre ausente/de outro passo — volta `null`, e quem
 * chama NÃO faz a chamada sem ele (sairia sem assinatura ou sem autorização).
 */
export async function decifrarSegredosDoPasso(
  admin: SupabaseClient,
  c: { segredo_enc: string | null; autorizacao_enc: string | null },
  lacre: LacreDoSegredo,
): Promise<{ segredo: string | null; autorizacao: string | null }> {
  const abrir = async (enc: string | null, campo: string) => {
    if (!enc) return null;
    const aberto = await decryptWebhookSecret(admin, enc);
    return aberto === null ? null : abrirLacre(aberto, lacre, campo);
  };
  return {
    segredo: await abrir(c.segredo_enc, "segredo_enc"),
    autorizacao: await abrir(c.autorizacao_enc, "autorizacao_enc"),
  };
}

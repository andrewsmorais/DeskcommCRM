/**
 * Chat no site — o que as rotas PÚBLICAS do balão compartilham.
 *
 * Quem chama estas rotas é o navegador do visitante, num site que não é o
 * nosso: não há cookie, não há sessão, e a organização sai SÓ da linha do
 * canal achada pela chave pública. O que protege:
 *
 *  - a chave do canal (pública) diz QUAL balão; o token do visitante (secreto,
 *    só no navegador dele) diz QUAL conversa — o banco guarda o hash;
 *  - limite por IP e por visitante (o mesmo contador em memória das outras
 *    rotas públicas);
 *  - domínios permitidos opcionais: com a lista preenchida, o navegador de
 *    outro site não lê a resposta (CORS) e o pedido é recusado.
 *
 * O corpo vai como `text/plain` com JSON dentro: é o que torna o pedido
 * "simples" para o navegador (sem pré-voo OPTIONS), e o token do visitante
 * viaja no CORPO — nunca na URL, que vai parar em log.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHANNEL_PROVIDER_WEBCHAT } from "../capabilities";
import { chaveDoChatSchema, lerConfigDoChat, origemPermitida, type ConfigDoChat } from "./config";

export interface CanalDoChat {
  id: string;
  organizationId: string;
  nome: string | null;
  config: ConfigDoChat;
}

/** Maior corpo aceito: uma mensagem de 2000 letras com folga. */
export const MAX_CORPO = 8 * 1024;

export async function canalPelaChave(
  admin: SupabaseClient,
  chave: string,
): Promise<CanalDoChat | null> {
  if (!chaveDoChatSchema.safeParse(chave).success) return null;
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, organization_id, display_name, metadata, status")
    .eq("provider", CHANNEL_PROVIDER_WEBCHAT)
    // Pelo TOKEN DE CAMINHO (único na tabela inteira), que nasce igual à chave
    // pública: é a mesma fonte confiável de organização dos webhooks.
    .eq("webhook_path_token", chave)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("webchat_channel_lookup_failed");
  if (!data) return null;
  const linha = data as {
    id: string;
    organization_id: string;
    display_name: string | null;
    metadata: unknown;
    status: string;
  };
  // Canal desligado pelo dono some do site, como se a chave não existisse.
  if (linha.status !== "WORKING") return null;
  return {
    id: linha.id,
    organizationId: linha.organization_id,
    nome: linha.display_name,
    config: lerConfigDoChat(linha.metadata),
  };
}

/** Cabeçalhos de CORS: ecoa a origem quando há lista; `*` quando não há. */
export function cabecalhosDoBalao(
  origem: string | null,
  dominios: readonly string[] = [],
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": dominios.length > 0 && origem ? origem : "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

export function respostaDoBalao(
  corpo: unknown,
  status: number,
  origem: string | null,
  dominios?: readonly string[],
): NextResponse {
  return NextResponse.json(corpo, { status, headers: cabecalhosDoBalao(origem, dominios) });
}

export function erroDoBalao(
  status: number,
  code: string,
  message: string,
  origem: string | null,
  dominios?: readonly string[],
): NextResponse {
  return respostaDoBalao({ error: { code, message } }, status, origem, dominios);
}

/** Lê o corpo (texto com JSON), com teto de tamanho. `null` = ilegível. */
export async function lerCorpoDoBalao(req: Request): Promise<unknown | null> {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_CORPO) return null;
  const texto = await req.text();
  if (texto.length > MAX_CORPO) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export function origemDoPedido(req: Request): string | null {
  return req.headers.get("origin");
}

export function origemRecusada(canal: CanalDoChat, origem: string | null): boolean {
  return !origemPermitida(origem, canal.config.dominios);
}

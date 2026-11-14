/**
 * Chat no site — o visitante escreveu: contato, conversa, mensagem.
 *
 * Mesma forma das outras entradas (`lib/channels/zernio/ingest.ts`): a rota
 * pública já validou o corpo e resolveu o canal PELA CHAVE no servidor; aqui só
 * moram os efeitos. A organização vem da linha do canal, nunca do corpo.
 *
 * Idempotência: o balão manda um `id` (uuid) por mensagem e reenvia o MESMO
 * quando a rede falha. Ele vira `external_id = webchat:<canal>:<id>`, e o
 * `unique (organization_id, external_id)` devolve 23505 na reentrega — lida
 * como "duplicate", não como erro.
 *
 * Os efeitos de negócio (opt-out, lead, demanda, agente) são o passo
 * COMPARTILHADO `aplicarEfeitosPosEntrada` — regra do produto, não do canal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { marcarConversaComMensagem } from "@/lib/channels/marcar-conversa";
import { aplicarEfeitosPosEntrada } from "@/lib/channels/pos-entrada";

import { hashDoVisitante, identidadeDoVisitante } from "./config";

export interface EntradaDoVisitante {
  organizationId: string;
  canalId: string;
  token: string;
  mensagemId: string;
  texto: string;
  nome?: string;
  email?: string;
  pagina?: string;
}

export type DesfechoDaEntrada =
  | { status: "ingested"; conversationId: string; messageId: string; criadaEm: string }
  | { status: "duplicate"; conversationId: string };

/** Id da mensagem do visitante no NOSSO vocabulário de `external_id`. */
export function externalIdDoVisitante(canalId: string, mensagemId: string): string {
  return `webchat:${canalId}:${mensagemId}`;
}

export async function receberDoVisitante(
  admin: SupabaseClient,
  entrada: EntradaDoVisitante,
): Promise<DesfechoDaEntrada> {
  const hash = hashDoVisitante(entrada.token);
  const identidade = identidadeDoVisitante(entrada.canalId, hash);

  const contactId = await garantirContato(admin, entrada, identidade);
  const conversationId = await garantirConversa(admin, entrada, contactId, identidade);

  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("messages")
    .insert({
      organization_id: entrada.organizationId,
      conversation_id: conversationId,
      contact_id: contactId,
      channel_session_id: entrada.canalId,
      external_id: externalIdDoVisitante(entrada.canalId, entrada.mensagemId),
      direction: "inbound",
      // Veio de fora do CRM, como toda entrada de canal.
      sent_via: "external_device",
      status: "delivered",
      type: "text",
      body: entrada.texto,
      sent_at: agora,
      metadata: entrada.pagina ? { webchat_pagina: entrada.pagina } : {},
    })
    .select("id, sent_at")
    .maybeSingle();
  if (error?.code === "23505") return { status: "duplicate", conversationId };
  if (error || !data) throw new Error(`webchat_insert_failed: ${error?.message ?? "sem id"}`);
  const messageId = (data as { id: string }).id;

  await marcarConversaComMensagem(admin, {
    organizationId: entrada.organizationId,
    conversationId,
    direction: "inbound",
    preview: entrada.texto.slice(0, 200),
    at: agora,
    canal: "webchat",
  });

  await aplicarEfeitosPosEntrada(admin, {
    organizationId: entrada.organizationId,
    contactId,
    conversationId,
    messageId,
    channelSessionId: entrada.canalId,
    texto: entrada.texto,
    nomeDoContato: entrada.nome ?? null,
    origem: "webchat",
  });

  return { status: "ingested", conversationId, messageId, criadaEm: agora };
}

async function garantirContato(
  admin: SupabaseClient,
  entrada: EntradaDoVisitante,
  identidade: string,
): Promise<string> {
  const { data: existente, error: erroDeLeitura } = await admin
    .from("contacts")
    .select("id, name, email")
    .eq("organization_id", entrada.organizationId)
    .eq("social_identity", identidade)
    .is("is_merged_into", null)
    .maybeSingle();
  if (erroDeLeitura) throw new Error("webchat_contact_lookup_failed");
  if (existente) {
    // Nome e e-mail entram quando faltam — nunca sobrescrevem o que o
    // atendente corrigiu na tela.
    const patch: Record<string, string> = {};
    const atual = existente as { id: string; name: string | null; email: string | null };
    if (entrada.nome && !atual.name) Object.assign(patch, { name: entrada.nome, display_name: entrada.nome });
    if (Object.keys(patch).length > 0) {
      await admin.from("contacts").update(patch).eq("id", atual.id).eq("organization_id", entrada.organizationId);
    }
    if (entrada.email && !atual.email) {
      // E-mail é único por organização: se outra ficha já o tem, ele fica só
      // como dado do visitante (o atendente vê e decide juntar). Ligar o
      // visitante à ficha pelo e-mail que ELE digitou deixaria qualquer um
      // entrar na conversa de outra pessoa.
      await admin
        .from("contacts")
        .update({ email: entrada.email })
        .eq("id", atual.id)
        .eq("organization_id", entrada.organizationId);
    }
    return atual.id;
  }

  const nome = entrada.nome ?? "Visitante do site";
  const linha = {
    organization_id: entrada.organizationId,
    social_identity: identidade,
    name: nome,
    display_name: nome,
    source: "webchat",
    source_metadata: {
      webchat: {
        ...(entrada.email ? { email: entrada.email } : {}),
        ...(entrada.pagina ? { primeira_pagina: entrada.pagina } : {}),
      },
    },
  };
  let { data, error } = await admin
    .from("contacts")
    .insert({ ...linha, ...(entrada.email ? { email: entrada.email } : {}) })
    .select("id")
    .single();
  if (error?.code === "23505" && entrada.email && /email/.test(error.message ?? "")) {
    // O e-mail já é de outra ficha (ver o comentário acima): entra sem ele.
    ({ data, error } = await admin.from("contacts").insert(linha).select("id").single());
  }
  if (error?.code === "23505") {
    // Duas primeiras mensagens ao mesmo tempo: quem perdeu a corrida lê o vencedor.
    const { data: vencedor, error: erroDoVencedor } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", entrada.organizationId)
      .eq("social_identity", identidade)
      .is("is_merged_into", null)
      .single();
    if (erroDoVencedor || !vencedor) throw new Error("webchat_contact_race_failed");
    return (vencedor as { id: string }).id;
  }
  if (error || !data) throw new Error(`webchat_contact_insert_failed: ${error?.message ?? ""}`);
  return (data as { id: string }).id;
}

async function garantirConversa(
  admin: SupabaseClient,
  entrada: EntradaDoVisitante,
  contactId: string,
  identidade: string,
): Promise<string> {
  // Mesma RPC dos outros canais: ela resolve a corrida de duas primeiras
  // mensagens numa transação (único por organização + contato + canal).
  const { data, error } = await admin.rpc("fn_upsert_wa_conversation", {
    p_org: entrada.organizationId,
    p_contact: contactId,
    p_session: entrada.canalId,
  });
  if (error || !data) throw new Error("webchat_conversation_upsert_failed");
  const conversationId = data as string;
  // A RPC nasce a conversa como `whatsapp`; aqui ela vira do site, e ganha o
  // id da thread (o mesmo da identidade) para a leitura do balão achá-la.
  const { error: erroDoCanal } = await admin
    .from("conversations")
    .update({ channel: "webchat", provider_conversation_id: identidade })
    .eq("organization_id", entrada.organizationId)
    .eq("id", conversationId);
  if (erroDoCanal) throw new Error("webchat_conversation_update_failed");
  return conversationId;
}

export interface MensagemDoBalao {
  id: string;
  de: "visitante" | "atendente";
  texto: string;
  em: string;
}

/**
 * O que o balão mostra: só a conversa DESTE visitante, só texto, e sem nota
 * interna. A conversa é achada pelo hash do token — sem o token, nada volta.
 */
export async function lerDoVisitante(
  admin: SupabaseClient,
  args: { organizationId: string; canalId: string; token: string; depois?: string },
): Promise<MensagemDoBalao[]> {
  const identidade = identidadeDoVisitante(args.canalId, hashDoVisitante(args.token));
  const { data: conversa, error: erroDaConversa } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", args.organizationId)
    .eq("channel_session_id", args.canalId)
    .eq("provider_conversation_id", identidade)
    .maybeSingle();
  if (erroDaConversa) throw new Error("webchat_conversation_lookup_failed");
  if (!conversa) return [];
  const conversationId = (conversa as { id: string }).id;

  let consulta = admin
    .from("messages")
    .select("id, direction, body, sent_at, created_at, type, revoked_at")
    .eq("organization_id", args.organizationId)
    .eq("conversation_id", conversationId)
    // Resposta do atendente só aparece depois de SAIR: a que ainda está na
    // fila (ou falhou) não pode surgir no balão e depois sumir.
    .or("direction.eq.inbound,status.in.(sent,delivered,read)")
    .eq("type", "text")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  // Folga de 2 minutos: uma resposta nasce na fila e só SAI depois, com o
  // `created_at` de quando nasceu. Sem a folga, a leitura que passou enquanto
  // ela estava na fila a deixaria para trás para sempre. O balão descarta
  // repetidas pelo `id`.
  if (args.depois) {
    const desde = new Date(Date.parse(args.depois) - 120_000).toISOString();
    consulta = consulta.gt("created_at", desde);
  }
  const { data, error } = await consulta;
  if (error) throw new Error("webchat_messages_lookup_failed");

  const linhas = ((data ?? []) as Array<{
    id: string;
    direction: string;
    body: string | null;
    sent_at: string | null;
    created_at: string;
  }>).reverse();

  // A resposta do atendente foi vista pelo visitante: marca como lida.
  const saidas = linhas.filter((m) => m.direction === "outbound").map((m) => m.id);
  if (saidas.length > 0) {
    await admin
      .from("messages")
      .update({ status: "read" })
      .eq("organization_id", args.organizationId)
      .in("id", saidas)
      .in("status", ["sent", "delivered"]);
  }

  return linhas
    .filter((m) => (m.body ?? "").length > 0)
    .map((m) => ({
      id: m.id,
      de: m.direction === "inbound" ? ("visitante" as const) : ("atendente" as const),
      texto: m.body ?? "",
      // `created_at` e não `sent_at`: é a régua do `depois`, e as duas têm de
      // ser a mesma para nenhuma mensagem cair no vão.
      em: m.created_at,
    }));
}

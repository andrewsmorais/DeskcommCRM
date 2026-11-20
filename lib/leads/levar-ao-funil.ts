/**
 * Pôr o CONTATO no funil — a regra única de "criar ou mover negócio".
 *
 * Nasceu dentro da ação de automação `create_or_move_lead` e saiu dela quando o
 * chatbot ganhou o passo "Negócio no funil": duas implementações de "pôr no
 * funil" divergiriam na primeira mudança, e o sintoma seria o mesmo contato
 * ganhar dois negócios abertos por um caminho e não pelo outro (#958, #992).
 *
 * Usa os handlers core de /api/v1/leads (mesmo caminho que REST/MCP): audita,
 * emite `lead.created` / `lead.stage_changed`, confere a etapa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { HandlerCtx } from "@/lib/api/handlers/types";
import { createLeadHandler, moveLeadHandler } from "@/app/api/v1/leads/_handler";
import {
  escolheEtapaDeDestino,
  montaPayloadDoClone,
  recusaTrocaDeFunil,
  type EtapaDoFunil,
  type OrigemParaClonar,
} from "@/lib/leads/clonar-para-funil";
import { encerraDemanda } from "@/lib/leads/encerramento";
import { motivoDaPerdaDaOrigem } from "@/lib/leads/motivo-da-perda";

export type ResultadoNoFunil =
  | { ok: true; acao: "moved" | "transferido" | "created"; lead: Record<string, unknown>; origem?: string }
  | { ok: false; error: string };

/**
 * Leva o CONTATO ao funil: move o negócio aberto dele naquele funil, transfere o
 * que está aberto em outro funil (#992), ou cria um. Usado pela automação e pelo
 * passo "Negócio no funil" do chatbot — uma regra só para "pôr no funil". Lança
 * o erro dos handlers; devolve `ok: false` só para a recusa de troca de funil.
 */
export async function levarContatoAoFunil(
  admin: SupabaseClient,
  handlerCtx: HandlerCtx,
  contact: { id: string },
  pipelineId: string,
  stageId: string,
  opcoes: { tituloNovo: string; source: string; quem: string },
): Promise<ResultadoNoFunil> {
  // Gatilho de CONTATO não traz lead no contexto (`lib/automation/engine.ts`),
  // e sem isto a ação chamada de "criar/mover" só sabia criar: o contato
  // ganhava um negócio novo a cada vez que a regra rodava (#958). O negócio
  // procurado é o ABERTO no funil de destino — negócio de outro funil segue
  // fora, pela mesma regra que recusa mover entre funis.
  const org = handlerCtx.organization_id;
  const existente = await negocioAbertoDoContato(admin, org, contact.id, pipelineId);
  if (existente) {
    const movido = await moveLeadHandler(admin, handlerCtx, existente, { to_stage_id: stageId });
    return { ok: true, acao: "moved", lead: { ...movido, id: movido.id ?? existente } };
  }

      // ── O CONTATO COM NEGÓCIO ABERTO EM OUTRO FUNIL: A REGRA TRANSFERE ───────
      //
      // Até aqui a busca era SÓ no funil de destino, e o contato que já tinha
      // negócio aberto em outro funil não era encontrado — a execução caía no
      // `createLeadHandler` logo abaixo e o cliente ficava com DOIS negócios
      // abertos, um em cada funil (#992). Nenhum aviso, nenhum erro: dois cards,
      // e a equipe sem saber qual dos dois é o de verdade.
      //
      // O caminho é o MESMO da rota `POST /api/v1/leads/[id]/clone` (o módulo
      // `lib/leads/clonar-para-funil.ts` decide o que se copia e qual etapa
      // recebe o clone; `encerraDemanda` fecha a origem). Duas implementações de
      // "trocar de funil" divergiriam na primeira mudança de uma delas.
  const emOutroFunil = await negocioAbertoEmOutroFunil(admin, org, contact.id, pipelineId);
  if (emOutroFunil) {
    const transferencia = await transfereParaOFunil(admin, handlerCtx, emOutroFunil, pipelineId, stageId, opcoes.quem);
    if (!transferencia.ok) return { ok: false, error: transferencia.error };
    return { ok: true, acao: "transferido", lead: transferencia.clone, origem: emOutroFunil.id };
  }
  const created = await createLeadHandler(admin, handlerCtx, {
    pipeline_id: pipelineId,
    stage_id: stageId,
    title: opcoes.tituloNovo,
    contact_id: contact.id,
    source: opcoes.source,
  } as Parameters<typeof createLeadHandler>[2]);
  return { ok: true, acao: "created", lead: created };
}

/**
 * O negócio ABERTO do contato neste funil, se houver um.
 *
 * Só o funil de destino. O negócio do contato em OUTRO funil não é movido de
 * etapa (mover entre funis é recusado logo acima) — ele é o caso de
 * `negocioAbertoEmOutroFunil`, que transfere. Falha de leitura devolve `null`.
 */
async function negocioAbertoDoContato(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  pipelineId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("pipeline_id", pipelineId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** As colunas que o clone precisa copiar da origem. */
const COLUNAS_DA_ORIGEM =
  "id, pipeline_id, status, title, description, contact_id, value_cents, currency, " +
  "owner_user_id, owner_agent_id, expected_close_date, tags, source, custom_fields, source_metadata";

/**
 * O negócio ABERTO do contato em qualquer OUTRO funil, se houver um.
 *
 * É o caso que a #992 mediu: o contato tem negócio aberto no funil A, a regra
 * aponta para o funil B, e sem esta leitura a ação criava um segundo negócio em
 * B em vez de levar o de A. O mais recente primeiro — o mesmo desempate de
 * `negocioAbertoDoContato`, e o mesmo comportamento quando a leitura falha
 * (`null`: a ação cria, como criava antes).
 */
async function negocioAbertoEmOutroFunil(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  pipelineId: string,
): Promise<OrigemParaClonar | null> {
  const { data } = await admin
    .from("crm_leads")
    .select(COLUNAS_DA_ORIGEM)
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("status", "open")
    .neq("pipeline_id", pipelineId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OrigemParaClonar | null) ?? null;
}

/**
 * Leva o negócio do contato para o funil da regra: clona e encerra a origem.
 *
 * Mesma ordem da rota do clone, e pelas mesmas razões: o funil de destino
 * confere a etapa, a origem confere se tem onde fechar (sem isso o clone
 * nasceria com a origem aberta — o defeito de novo, agora em dobro) e só então
 * o clone é criado e a origem encerrada como PERDIDA com o motivo da
 * transferência. O motivo é o canônico `moved_to_another_pipeline`, que não é
 * perda comercial: `fn_attendant_metrics` o exclui (migration 0266).
 *
 * Devolve o erro em vez de lançar: quem chama transforma isso no `status:
 * "failed"` da execução, que é o que a aba Atividade mostra ao operador.
 */
async function transfereParaOFunil(
  admin: SupabaseClient,
  handlerCtx: HandlerCtx,
  origem: OrigemParaClonar,
  pipelineId: string,
  stageId: string,
  quem: string,
): Promise<{ ok: true; clone: Record<string, unknown> } | { ok: false; error: string }> {
  const organizationId = handlerCtx.organization_id;
  const recusa = recusaTrocaDeFunil(origem, pipelineId);
  if (recusa) return { ok: false, error: recusa.code };

  const { data: etapas, error: etapasErr } = await admin
    .from("crm_stages")
    .select("id, pipeline_id, position, is_won, is_lost, is_archived")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipelineId)
    .eq("is_archived", false)
    .order("position", { ascending: true });
  if (etapasErr) return { ok: false, error: etapasErr.message };

  const destino = escolheEtapaDeDestino((etapas ?? []) as EtapaDoFunil[], stageId);
  if (!destino.ok) return { ok: false, error: destino.code };

  const { data: etapaDePerda, error: perdaErr } = await admin
    .from("crm_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", origem.pipeline_id)
    .eq("is_lost", true)
    .eq("is_archived", false)
    .limit(1)
    .maybeSingle();
  if (perdaErr) return { ok: false, error: perdaErr.message };
  if (!etapaDePerda) return { ok: false, error: "origem_sem_etapa_de_perda" };

  const clone = await createLeadHandler(admin, handlerCtx, montaPayloadDoClone(origem, destino.etapa));

  await encerraDemanda(admin, handlerCtx, {
    leadId: origem.id,
    desfecho: "lost",
    motivo: motivoDaPerdaDaOrigem(null),
    razaoNaTimeline: `Levado para outro funil ${quem}`,
    payloadNaTimeline: { to_pipeline_id: pipelineId, to_lead_id: clone.id },
  });

  return { ok: true, clone: clone as unknown as Record<string, unknown> };
}

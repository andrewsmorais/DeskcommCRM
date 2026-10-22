/**
 * A EXCLUSÃO DOS DADOS DE UMA CONTA DEPOIS DO PRAZO DE EXPORTAÇÃO.
 *
 * Os Termos (8.3) e a Política de Privacidade (5.2) prometem: encerrada a conta,
 * 30 dias para exportar; depois disso os dados "poderão ser excluídos
 * definitivamente, ressalvada a guarda exigida por lei". Este módulo cumpre a
 * segunda metade.
 *
 * ─── Excluir aqui é ANONIMIZAR, e não apagar a organização ──────────────────
 *
 * Apagar a linha de `organizations` levaria em cascata exatamente o que a lei
 * manda guardar: a auditoria (registros de acesso, 6 meses — Marco Civil) e as
 * assinaturas (documentos de cobrança). E deixaria a mídia órfã no Storage. Por
 * isso a exclusão é o caminho LGPD que já existe para uma organização inteira —
 * pedido `lgpd_requests` de escopo `tenant`, consumido por
 * `workers/lgpd-redact-worker.ts`, que anonimiza contato por contato com a
 * cascata completa (conversas, mensagens, mídia, leads, propostas, pedidos…),
 * guarda o ponto de retomada e, no fim, marca `organizations.redacted_at`.
 * Este módulo só decide QUEM e QUANDO, desconecta o WhatsApp e abre o pedido.
 *
 * ─── Quatro travas, todas na direção de NÃO apagar ──────────────────────────
 *
 * 1. **Só depois que o link morreu.** A exclusão fica liberada em
 *    `exclusaoLiberadaEm(fim)`, o mesmo instante em que expira o link de
 *    download dos e-mails — nunca há um link válido para uma conta já apagada.
 * 2. **Só quem foi avisado.** Se nenhum e-mail deste ciclo chegou a ninguém (o
 *    e-mail da instalação estava desligado, o endereço do administrador não
 *    existe), a conta NÃO é excluída: a pessoa nunca soube da data. Ela fica no
 *    contador `semAviso` para o operador decidir à mão.
 * 3. **Nunca `active`, nunca sem assinatura** — herdado de `acessoEncerrado`. A
 *    organização do dono e as de teste, que não têm assinatura, nunca entram.
 * 4. **Um pedido por vez.** Pedido de escopo `tenant` em aberto para a
 *    organização segura a rodada seguinte; organização já anonimizada, também.
 *    Se o pedido FALHAR de vez, a rodada do dia seguinte abre outro — a exclusão
 *    converge em vez de morrer em silêncio.
 *
 * ─── Por que desconectar o WhatsApp ANTES ────────────────────────────────────
 *
 * Com a sessão viva no WAHA, toda mensagem que chega ao número vira contato e
 * conversa NOVOS depois da anonimização — dado pessoal entrando numa conta que o
 * sistema diz ter apagado. Por isso o canal sai primeiro, e se não sair a rodada
 * para (tenta de novo amanhã). Canal oficial da Meta não é desligado aqui: desfazer
 * o webhook do número exige a credencial e a ordem certa de
 * `app/api/v1/channel-sessions/[id]/route.ts`; ele vai para o contador
 * `canaisOficiais` e a anonimização segue, porque o dado já existente não pode
 * ficar refém de um canal.
 */
import { audit } from "@/lib/audit";
import { CHANNEL_PROVIDER_WAHA } from "@/lib/channels/capabilities";
import { createLgpdRequest } from "@/lib/lgpd/repository";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWahaClient } from "@/lib/waha/client";

import { lerAssinaturasMaisRecentes, lerOrganizacao, type DadosDaOrganizacao, type LinhaDeAssinatura } from "./avisos";
import { acessoEncerrado, exclusaoLiberada, exclusaoLiberadaEm, fimDoAcesso } from "./ciclo-de-vida";

/** Mesmo SLA do pedido de anonimização de loja inteira (`store-redact`). */
export const SLA_DA_EXCLUSAO_DIAS_UTEIS = 15;

export interface CanaisDesconectados {
  readonly desconectados: number;
  /** Canais oficiais da Meta: ficam ligados e exigem ação manual. */
  readonly oficiais: number;
  /** Algum canal por QR não saiu — a organização espera a próxima rodada. */
  readonly falhou: boolean;
}

export interface DependenciasDaExclusao {
  agora(): Date;
  /** A assinatura MAIS RECENTE de cada organização; `null` quando a leitura falhou. */
  assinaturas(): Promise<LinhaDeAssinatura[] | null>;
  organizacao(orgId: string): Promise<DadosDaOrganizacao | null>;
  /** Já existe pedido de anonimização da organização inteira ainda não concluído. */
  pedidoEmAberto(orgId: string): Promise<boolean>;
  desconectarCanais(orgId: string): Promise<CanaisDesconectados>;
  /** Abre o pedido LGPD e acorda o worker; devolve o id, ou `null` se não conseguiu. */
  agendarAnonimizacao(orgId: string, args: { fim: Date; liberadaEm: Date }): Promise<string | null>;
  auditar(
    orgId: string,
    args: { pedidoId: string; fim: Date; canais: CanaisDesconectados },
  ): Promise<void>;
}

export interface ResultadoDaExclusao {
  /** Contas com o prazo vencido e o link já expirado. */
  readonly avaliadas: number;
  readonly agendadas: { orgId: string; pedidoId: string }[];
  /** O que SERIA agendado, quando a rodada é simulação. */
  readonly simuladas: { orgId: string }[];
  /** Ninguém recebeu aviso deste ciclo: não exclui (trava 2). */
  readonly semAviso: number;
  readonly emAndamento: number;
  readonly falhasDeCanal: number;
  readonly falhasAoAgendar: number;
  /** Canais oficiais que continuaram ligados em contas agendadas. */
  readonly canaisOficiais: number;
  /** A leitura das assinaturas falhou: nada foi avaliado. */
  readonly leituraFalhou: boolean;
}

export async function executarExclusao(
  dep: DependenciasDaExclusao,
  opcoes: { simular?: boolean } = {},
): Promise<ResultadoDaExclusao> {
  const agora = dep.agora();
  const resultado = {
    avaliadas: 0,
    agendadas: [] as ResultadoDaExclusao["agendadas"],
    simuladas: [] as ResultadoDaExclusao["simuladas"],
    semAviso: 0,
    emAndamento: 0,
    falhasDeCanal: 0,
    falhasAoAgendar: 0,
    canaisOficiais: 0,
    leituraFalhou: false,
  };

  const assinaturas = await dep.assinaturas();
  if (assinaturas === null) return { ...resultado, leituraFalhou: true };

  for (const assinatura of assinaturas) {
    if (!acessoEncerrado(assinatura, agora)) continue;
    const fim = fimDoAcesso(assinatura);
    if (!fim || !exclusaoLiberada(fim, agora)) continue;
    const orgId = assinatura.organization_id;

    const org = await dep.organizacao(orgId);
    if (!org || org.redigida) continue;
    resultado.avaliadas += 1;

    // Trava 2: o aviso tem de ser DESTE ciclo. Um aviso de um encerramento
    // anterior (a conta renovou e terminou de novo) não anunciou esta data.
    const avisado =
      org.estado?.fim === fim.toISOString() && Object.keys(org.estado.avisos).length > 0;
    if (!avisado) {
      resultado.semAviso += 1;
      continue;
    }

    if (await dep.pedidoEmAberto(orgId)) {
      resultado.emAndamento += 1;
      continue;
    }

    if (opcoes.simular) {
      resultado.simuladas.push({ orgId });
      continue;
    }

    const canais = await dep.desconectarCanais(orgId);
    if (canais.falhou) {
      resultado.falhasDeCanal += 1;
      continue;
    }

    const pedidoId = await dep.agendarAnonimizacao(orgId, { fim, liberadaEm: exclusaoLiberadaEm(fim) });
    if (!pedidoId) {
      resultado.falhasAoAgendar += 1;
      continue;
    }

    resultado.agendadas.push({ orgId, pedidoId });
    resultado.canaisOficiais += canais.oficiais;
    await dep.auditar(orgId, { pedidoId, fim, canais });
  }

  return resultado;
}

// ───────────────────────────── implementação real ─────────────────────────────

/** Situações de pedido que ainda não terminaram. */
const PEDIDO_EM_ABERTO = ["received", "processing", "pending_review"] as const;

export function dependenciasReaisDaExclusao(): DependenciasDaExclusao {
  const db = createAdminClient();
  return {
    agora: () => new Date(),
    assinaturas: () => lerAssinaturasMaisRecentes(db),
    organizacao: (orgId) => lerOrganizacao(db, orgId),

    async pedidoEmAberto(orgId) {
      const { data, error } = await db
        .from("lgpd_requests")
        .select("id")
        .eq("organization_id", orgId)
        .eq("scope", "tenant")
        .in("status", [...PEDIDO_EM_ABERTO])
        .limit(1);
      // Na dúvida, segura: abrir um segundo pedido em paralelo é pior que esperar um dia.
      if (error) {
        logger.warn("exportacao_exclusao_leitura_de_pedido_falhou", { orgId, detail: error.message });
        return true;
      }
      return (data ?? []).length > 0;
    },

    async desconectarCanais(orgId) {
      const { data, error } = await db
        .from("channel_sessions")
        .select("id, provider, waha_session_name")
        .eq("organization_id", orgId)
        .is("archived_at", null);
      if (error) {
        logger.warn("exportacao_exclusao_leitura_de_canais_falhou", { orgId, detail: error.message });
        return { desconectados: 0, oficiais: 0, falhou: true };
      }
      const linhas = (data ?? []) as { id: string; provider: string | null; waha_session_name: string | null }[];
      const porQr = linhas.filter((c) => (c.provider ?? CHANNEL_PROVIDER_WAHA) === CHANNEL_PROVIDER_WAHA);
      const oficiais = linhas.length - porQr.length;
      if (porQr.length === 0) return { desconectados: 0, oficiais, falhou: false };

      const waha = getWahaClient();
      if (!waha) {
        logger.warn("exportacao_exclusao_sem_waha", { orgId, canais: porQr.length });
        return { desconectados: 0, oficiais, falhou: true };
      }

      let desconectados = 0;
      let falhou = false;
      for (const canal of porQr) {
        try {
          // O cliente já trata "sessão não existe" como desconectada.
          if (canal.waha_session_name) {
            await waha.logoutSession(canal.waha_session_name);
            await waha.deleteSession(canal.waha_session_name);
          }
          const agora = new Date().toISOString();
          const { error: erroAoArquivar } = await db
            .from("channel_sessions")
            .update({ archived_at: agora, status: "STOPPED", last_status_change_at: agora } as never)
            .eq("organization_id", orgId)
            .eq("id", canal.id);
          if (erroAoArquivar) throw new Error(erroAoArquivar.message);
          desconectados += 1;
        } catch (err) {
          falhou = true;
          logger.warn("exportacao_exclusao_canal_nao_desconectou", {
            orgId,
            canal: canal.id,
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return { desconectados, oficiais, falhou };
    },

    async agendarAnonimizacao(orgId, { fim, liberadaEm }) {
      let pedidoId: string;
      try {
        const criado = await createLgpdRequest({
          organizationId: orgId,
          requestType: "redact",
          source: "retention",
          receivedAt: new Date(),
          slaDays: SLA_DA_EXCLUSAO_DIAS_UTEIS,
          emergency: false,
          scope: "tenant",
          payload: {
            motivo: "prazo_de_exportacao_vencido",
            fim_do_acesso: fim.toISOString(),
            exclusao_liberada_em: liberadaEm.toISOString(),
          },
        });
        pedidoId = criado.id;
      } catch (err) {
        logger.warn("exportacao_exclusao_pedido_nao_criado", {
          orgId,
          detail: err instanceof Error ? err.message : String(err),
        });
        return null;
      }

      const { error } = await db.rpc("emit_event" as never, {
        p_event_type: "lgpd.redact_received",
        p_entity_kind: "lgpd_request",
        p_entity_id: pedidoId,
        p_payload: { request_id: pedidoId, organization_id: orgId, scope: "tenant", emergency: false },
        p_metadata: { source: "retention" },
        p_organization_id: orgId,
      } as never);
      if (error) {
        // Sem o evento o worker nunca acorda e o pedido ficaria "received" para
        // sempre — e a trava 4 seguraria todas as rodadas seguintes. Fechá-lo como
        // falho deixa a próxima rodada abrir outro.
        logger.warn("exportacao_exclusao_evento_nao_emitido", { orgId, pedidoId, detail: error.message });
        await db
          .from("lgpd_requests")
          .update({ status: "failed", error_message: "emit_event_failed" })
          .eq("organization_id", orgId)
          .eq("id", pedidoId);
        return null;
      }
      return pedidoId;
    },

    async auditar(orgId, { pedidoId, fim, canais }) {
      await audit({
        action: "lgpd.redact_received",
        organizationId: orgId,
        resourceType: "lgpd_request",
        resourceId: pedidoId,
        bypassedRls: true,
        metadata: {
          source: "retention",
          scope: "tenant",
          motivo: "prazo_de_exportacao_vencido",
          fim_do_acesso: fim.toISOString(),
          canais_desconectados: canais.desconectados,
          canais_oficiais_ligados: canais.oficiais,
        },
      });
    },
  };
}

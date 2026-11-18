import type { ServiceBoundary } from "@/lib/atendimento/fronteira";
/**
 * Motor de regras: consome eventos-gatilho do event_log e executa as
 * automation_rules ativas do tenant. Registrado no registry via engine.handler.
 *
 * Anti-loop: eventos com metadata.caused_by_rule OU metadata.request_id
 * prefixado "rule:" não reprocessam (profundidade 1 no v1 — cadeia
 * regra→regra fica pra v2/Task 9, que estampa esse metadata nos eventos que
 * uma ação do motor emite).
 *
 * entity_kind guard: o trigger legado `fn_emit_event_on_lead_change` emite
 * lead.created/lead.stage_changed com entity_kind='lead' (derivado por
 * split_part do event_type), enquanto os handlers desta feature emitem com
 * entity_kind='crm_lead'. Sem este filtro o motor rodaria a regra 2x por
 * mudança de lead (uma vez por linha de event_log duplicada).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { evaluateConditions, type RuleCondition } from "@/lib/automation/conditions";
import { getAction } from "@/lib/automation/actions";
import type { ActionResultDetail } from "@/lib/automation/types";
import { audit } from "@/lib/audit";
import { regraDoEvento } from "@/lib/automation/gatilho-de-data-do-funil";
import { ENTIDADE_ESPERADA_POR_GATILHO } from "@/lib/schemas/webhooks";
import { acessoPeloPlanoDaOrganizacao } from "@/lib/billing/acesso";
import { logger } from "@/lib/logger";
import { horasDoIntervaloNaConfig } from "@/lib/automation/limite-por-contato";

export const AUTOMATION_CONSUMER_KEY = "automation-rules";

const EXPECTED_ENTITY_KIND: Record<string, string> = ENTIDADE_ESPERADA_POR_GATILHO;

interface RuleRow {
  id: string;
  name: string;
  trigger_config?: Record<string, unknown> | null;
  conditions: RuleCondition[];
  actions: Array<{ type: string; config?: Record<string, unknown> }>;
}

/** Hidrata o contexto avaliado pelas condições/ações a partir do entity do evento. */
export async function buildContext(
  admin: SupabaseClient,
  row: EventRow,
): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = { event: row.payload };
  // Admin client bypassa RLS — todo lookup filtra organization_id do evento
  // (doutrina multi-tenant; um FK cross-org corrompido nunca vaza pro contexto).
  const org = row.organization_id;
  // `lead` é a entidade que o trigger de banco grava em lead.won/lead.lost.
  if ((row.entity_kind === "crm_lead" || row.entity_kind === "lead") && row.entity_id) {
    const { data: lead } = await admin
      .from("crm_leads")
      .select("*")
      .eq("id", row.entity_id)
      .eq("organization_id", org)
      .maybeSingle();
    if (lead) {
      context.lead = lead;
      if (lead.contact_id) {
        const { data: contact } = await admin
          .from("contacts")
          .select("*")
          .eq("id", lead.contact_id)
          .eq("organization_id", org)
          .maybeSingle();
        if (contact) context.contact = contact;
      }
    }
  } else if (row.entity_kind === "contact" && row.entity_id) {
    const { data: contact } = await admin
      .from("contacts")
      .select("*")
      .eq("id", row.entity_id)
      .eq("organization_id", org)
      .maybeSingle();
    if (contact) context.contact = contact;
  } else if (row.entity_kind === "calendar_appointment" && row.entity_id) {
    const { data: appointment } = await admin
      .from("calendar_appointments")
      .select("*")
      .eq("id", row.entity_id)
      .eq("organization_id", org)
      .maybeSingle();
    if (appointment) {
      context.appointment = appointment;
      // O contato sai do COMPROMISSO, não do payload: quem escreve a regra vai
      // querer `contact.name` no texto da mensagem, e a linha do banco é a
      // versão de agora — o payload é a de quando o evento nasceu.
      if (appointment.contact_id) {
        const { data: contact } = await admin
          .from("contacts")
          .select("*")
          .eq("id", appointment.contact_id)
          .eq("organization_id", org)
          .maybeSingle();
        if (contact) context.contact = contact;
      }
    }
  } else if (row.entity_kind === "message" && row.entity_id) {
    const contactId = row.payload.contact_id as string | undefined;
    if (contactId) {
      const { data: contact } = await admin
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .eq("organization_id", org)
        .maybeSingle();
      if (contact) context.contact = contact;
    }
  }
  return context;
}

/**
 * Grava a linha do adiamento — a única evidência de que a regra casou e está
 * esperando.
 *
 * Um run por adiamento, e não um por tique do drain: o evento só volta na hora
 * marcada por `retry_at`, então não há repetição a cada minuto. Se a janela
 * seguir fechada quando ele voltar, sai outra linha — e aí a repetição É a
 * informação (a automação está presa há três dias).
 *
 * Fire-and-forget quanto a erro: perder o registro não pode impedir o
 * adiamento, que é o que protege o número.
 */
async function registrarAdiamento(
  admin: SupabaseClient,
  row: EventRow,
  rule: RuleRow,
  actionType: string,
  retryAt: string,
): Promise<void> {
  const { error } = await admin.from("automation_rule_runs").insert({
    organization_id: row.organization_id,
    rule_id: rule.id,
    event_id: row.id,
    status: "adiado",
    actions_result: [
      {
        type: actionType,
        status: "postponed",
        detail: {
          reason: "fora_da_janela_de_envio",
          retry_at: retryAt,
          explicacao:
            "A regra casou e está esperando a janela de envio do número reabrir — nada foi tentado ainda.",
        },
      },
    ],
  });
  if (error) {
    logger.error("[automation.engine] não foi possível registrar o adiamento", {
      rule_id: rule.id,
      organization_id: row.organization_id,
      error: error.message,
    });
  }
}

// ═══ LIMITE POR CONTATO (vindo do produto original) ═══
//
// Duas respostas para "quando esta regra pode rodar de novo para a MESMA
// pessoa": `trigger_config.uma_vez_por_contato` (nunca mais) e
// `trigger_config.repetir_apos_horas` (só depois de N horas). Ausentes = a regra
// roda em todo evento que casa, como sempre. Decidido pelo ESTADO PERSISTIDO em
// `automation_rule_runs.contact_id` (migration 0524), que sobrevive a reinício
// do worker. Toda leitura que falha é FAIL-OPEN: calar por erro de leitura
// esconderia automação legítima sem rastro.

type MotivoDoBloqueio = "uma_vez_por_contato" | "intervalo_por_contato";

export function regraRodaUmaVezPorContato(rule: Pick<RuleRow, "trigger_config">): boolean {
  return rule.trigger_config?.uma_vez_por_contato === true;
}

export function intervaloPorContatoHoras(rule: Pick<RuleRow, "trigger_config">): number | null {
  return horasDoIntervaloNaConfig(rule.trigger_config);
}

/** O contato do evento: o do payload, a conversa dele, ou o hidratado no contexto. */
async function contatoDoEventoOuContexto(
  admin: SupabaseClient,
  row: EventRow,
  context: Record<string, unknown>,
): Promise<string | null> {
  const direto = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
  if (direto) return direto;
  const doContexto = (context.contact as { id?: unknown } | undefined)?.id;
  if (typeof doContexto === "string") return doContexto;
  const conversa = typeof row.payload.conversation_id === "string" ? row.payload.conversation_id : null;
  if (!conversa) return null;
  const { data } = await admin
    .from("conversations")
    .select("contact_id")
    .eq("id", conversa)
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  return (data as { contact_id?: string } | null)?.contact_id ?? null;
}

/** Esta regra já tem execução registrada para este contato? (`limit(1)`, nunca `maybeSingle`). */
async function regraJaRodouParaOContato(
  admin: SupabaseClient,
  organizationId: string,
  ruleId: string,
  contactId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("automation_rule_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("rule_id", ruleId)
    .eq("contact_id", contactId)
    .limit(1);
  if (error) {
    logger.warn("[automation.engine] limite por contato não conferido — a regra segue (fail-open)", {
      rule_id: ruleId,
      organization_id: organizationId,
      error: error.message,
    });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * A regra RODOU (sucesso ou parcial) para este contato nas últimas N horas? Só
 * execução que saiu move a janela: a linha do próprio bloqueio rolando a janela
 * viraria "uma vez para sempre".
 */
async function regraRodouNasUltimasHoras(
  admin: SupabaseClient,
  organizationId: string,
  ruleId: string,
  contactId: string,
  horas: number,
): Promise<boolean> {
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("automation_rule_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("rule_id", ruleId)
    .eq("contact_id", contactId)
    .in("status", ["success", "partial"])
    .gte("created_at", desde)
    .limit(1);
  if (error) {
    logger.warn("[automation.engine] intervalo por contato não conferido — a regra segue (fail-open)", {
      rule_id: ruleId,
      organization_id: organizationId,
      error: error.message,
    });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Reserva a chave (organização, regra, contato) ANTES de executar "uma vez por
 * contato": dois eventos do mesmo contato processados ao mesmo tempo (worker,
 * cron, dreno) passariam os dois pela leitura acima. Quem insere executa; quem
 * recebe vazio (conflito) não executa. Erro = fail-open.
 */
async function reservarExecucaoPorContato(
  admin: SupabaseClient,
  row: EventRow,
  rule: RuleRow,
  contactId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("automation_rule_contact_claims")
    .upsert(
      { organization_id: row.organization_id, rule_id: rule.id, contact_id: contactId, event_id: row.id },
      { onConflict: "organization_id,rule_id,contact_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) {
    logger.warn("[automation.engine] reserva por contato falhou — a regra segue (fail-open)", {
      rule_id: rule.id,
      organization_id: row.organization_id,
      error: error.message,
    });
    return true;
  }
  return data !== null;
}

/**
 * A DECISÃO DE NÃO RODAR, gravada com a razão: sem esta linha "não apareceu
 * nada na Atividade" e "a regra não rodou" voltariam a ser a mesma tela. Não
 * mexe em `run_count`/`last_run_at` — a regra não rodou.
 */
async function registrarBloqueioPorLimite(
  admin: SupabaseClient,
  row: EventRow,
  rule: RuleRow,
  contactId: string,
  motivo: MotivoDoBloqueio,
): Promise<void> {
  const results: ActionResultDetail[] = (rule.actions ?? []).map((action) => ({
    type: action.type,
    status: "skipped" as const,
    error: motivo,
  }));
  const { error } = await admin.from("automation_rule_runs").insert({
    organization_id: row.organization_id,
    rule_id: rule.id,
    event_id: row.id,
    contact_id: contactId,
    status: statusDoRun(results),
    actions_result: results,
  });
  if (error) {
    logger.error("[automation.engine] bloqueio por contato não registrado", {
      rule_id: rule.id,
      organization_id: row.organization_id,
      error: error.message,
    });
  }
}

/**
 * O estado do run a partir do desfecho de cada ação. `skipped` conta junto de
 * `failed` (as duas significam "não saiu, e a fila não resolve sozinha"), e
 * falha vence adiamento. Fonte única: o run normal e o bloqueio por contato.
 */
export function statusDoRun(
  results: readonly ActionResultDetail[],
): "success" | "partial" | "failed" | "adiado" {
  const naoEnviadas = results.filter((r) => r.status === "failed" || r.status === "skipped").length;
  const adiados = results.filter((r) => r.status === "postponed").length;
  return naoEnviadas > 0
    ? naoEnviadas === results.length
      ? "failed"
      : "partial"
    : adiados > 0
      ? "adiado"
      : "success";
}

export async function runAutomationForEvent(
  admin: SupabaseClient,
  row: EventRow,
): Promise<HandlerResult> {
  const serviceBoundaries = new Map<string, Promise<ServiceBoundary>>();
  const requestId = row.metadata?.request_id;
  const causedByRule =
    Boolean(row.metadata?.caused_by_rule) ||
    (typeof requestId === "string" && requestId.startsWith("rule:"));
  if (causedByRule) {
    return { consumer_key: AUTOMATION_CONSUMER_KEY, status: "skipped", detail: "caused_by_rule" };
  }

  const expectedKind = EXPECTED_ENTITY_KIND[row.event_type];
  if (expectedKind && row.entity_kind !== expectedKind) {
    return {
      consumer_key: AUTOMATION_CONSUMER_KEY,
      status: "skipped",
      detail: "entity_kind_mismatch",
    };
  }

  const { data: rules, error } = await admin
    .from("automation_rules")
    .select("id, name, trigger_config, conditions, actions")
    .eq("organization_id", row.organization_id)
    .eq("trigger_event", row.event_type)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) {
    return { consumer_key: AUTOMATION_CONSUMER_KEY, status: "error", detail: error.message };
  }
  const todas = (rules ?? []) as unknown as RuleRow[];
  if (!todas.length) {
    return { consumer_key: AUTOMATION_CONSUMER_KEY, status: "ok", detail: "no_rules" };
  }

  // ═══ EVENTO DIRIGIDO: A REGRA QUE O RELÓGIO APONTOU ═══
  //
  // O gatilho de data do funil (`lead.date_field_due`) não nasce de uma ação de
  // ninguém: quem o emite é a varredura `cron/lead-date-field-due`, e ela sabe
  // PARA QUAL REGRA — o payload traz `rule_id`. Sem este recorte, duas regras do
  // mesmo gatilho com `dias` diferentes (240 dias antes do casamento e 60
  // depois dele) rodariam as duas no mesmo evento, porque aqui só se casa
  // `event_type`: a confirmação de entrega sairia junto com o aviso de 240 dias.
  //
  // Todo outro gatilho emite payload sem `rule_id`, então `regraDoEvento`
  // devolve `null` e a seleção segue exatamente como sempre foi: todas as
  // regras ativas daquele tipo.
  const regraApontada = regraDoEvento(row.payload);
  const matched = regraApontada ? todas.filter((r) => r.id === regraApontada) : todas;
  if (!matched.length) {
    return { consumer_key: AUTOMATION_CONSUMER_KEY, status: "ok", detail: "no_rules" };
  }

  // ═══ SEM ASSINATURA ATIVA, NENHUMA REGRA RODA ═══
  //
  // A mesma régua do turno do agente e do chatbot (`acessoPeloPlanoDaOrganizacao`).
  // O motor não a consultava: uma regra `message.received → send_ai_message`
  // criada no teste grátis (ou depois, pela API de regras) seguia escrevendo com
  // o modelo da chave da PLATAFORMA e respondendo no WhatsApp da organização
  // que não paga — enquanto o agente, para a mesma organização, já calava.
  //
  // Antes de montar o contexto e antes do adiamento: nem leitura nem linha
  // "adiado" para uma regra que não vai rodar. O motivo fica no `detail` do
  // `skipped`, que o drain preserva na linha do evento.
  const acessoPeloPlano = await acessoPeloPlanoDaOrganizacao(row.organization_id);
  if (!acessoPeloPlano.liberado) {
    logger.info("[automation.engine] organização sem assinatura ativa — regras não rodam", {
      organization_id: row.organization_id,
      event_type: row.event_type,
      motivo: acessoPeloPlano.motivo,
    });
    return {
      consumer_key: AUTOMATION_CONSUMER_KEY,
      status: "skipped",
      detail: `assinatura_${acessoPeloPlano.motivo}`,
    };
  }

  const context = await buildContext(admin, row);

  // Limite por contato: a pergunta ao banco é feita UMA vez por regra, antes do
  // filtro (que é síncrono). Sem contato resolvível a regra segue (fail-open).
  const temAlgumLimite = matched.some(
    (rule) => regraRodaUmaVezPorContato(rule) || intervaloPorContatoHoras(rule) !== null,
  );
  const contatoIdDoEvento = temAlgumLimite ? await contatoDoEventoOuContexto(admin, row, context) : null;
  const motivoDoBloqueio = new Map<string, MotivoDoBloqueio>();
  if (contatoIdDoEvento) {
    for (const rule of matched) {
      // Com as duas chaves, o intervalo vence (a tela não deixa configurar as duas).
      const horas = intervaloPorContatoHoras(rule);
      if (horas !== null) {
        if (await regraRodouNasUltimasHoras(admin, row.organization_id, rule.id, contatoIdDoEvento, horas)) {
          motivoDoBloqueio.set(rule.id, "intervalo_por_contato");
        }
        continue;
      }
      if (!regraRodaUmaVezPorContato(rule)) continue;
      if (await regraJaRodouParaOContato(admin, row.organization_id, rule.id, contatoIdDoEvento)) {
        motivoDoBloqueio.set(rule.id, "uma_vez_por_contato");
      }
    }
  }

  const barradasPeloLimite: Array<{ rule: RuleRow; motivo: MotivoDoBloqueio }> = [];
  const applicable = matched.filter((rule) => {
    if (!evaluateConditions(rule.conditions ?? [], context)) return false;
    const motivo = motivoDoBloqueio.get(rule.id);
    if (motivo) {
      barradasPeloLimite.push({ rule, motivo });
      return false;
    }
    return true;
  });
  for (const { rule, motivo } of barradasPeloLimite) {
    if (contatoIdDoEvento) await registrarBloqueioPorLimite(admin, row, rule, contatoIdDoEvento, motivo);
  }
  if (!applicable.length) {
    const motivos = barradasPeloLimite.map((b) => b.motivo);
    return {
      consumer_key: AUTOMATION_CONSUMER_KEY,
      status: "ok",
      detail: !motivos.length
        ? "no_match"
        : motivos.includes("intervalo_por_contato")
          ? "intervalo_por_contato"
          : "uma_vez_por_contato",
    };
  }

  // Pré-checagem de postpone (throttle etc.): all-or-nothing ANTES de executar
  // qualquer ação — reexecução parcial no retry seria pior que atraso.
  for (const rule of applicable) {
    for (const action of rule.actions ?? []) {
      const executor = getAction(action.type);
      if (!executor?.postponeUntil) continue;
      const until = await executor.postponeUntil(
        {
          admin,
          serviceBoundaries,
          organizationId: row.organization_id,
          ruleId: rule.id,
          ruleName: rule.name,
          event: row,
          context,
          requestId: row.id,
        },
        action.config ?? {},
      );
      if (until) {
        // A ESPERA É UM ESTADO, e um estado que ninguém vê é indistinguível de
        // morte. Sem esta linha o evento sumia até a janela reabrir e a aba
        // Atividade não mostrava NADA — para quem montou a regra, "não apareceu
        // nada" e "não rodou" são a mesma tela (migration 0175).
        await registrarAdiamento(admin, row, rule, action.type, until);
        return { consumer_key: AUTOMATION_CONSUMER_KEY, status: "retry", retry_at: until };
      }
    }
  }

  // A RESERVA de "uma vez por contato" vem DEPOIS do adiamento (reservar e
  // adiar consumiria a chave sem rodar) e ANTES de executar: é o árbitro da
  // corrida entre dois eventos do mesmo contato. O intervalo não reserva.
  const barradasPelaReserva: RuleRow[] = [];
  if (contatoIdDoEvento) {
    for (const rule of applicable) {
      if (intervaloPorContatoHoras(rule) !== null || !regraRodaUmaVezPorContato(rule)) continue;
      if (!(await reservarExecucaoPorContato(admin, row, rule, contatoIdDoEvento))) {
        barradasPelaReserva.push(rule);
        await registrarBloqueioPorLimite(admin, row, rule, contatoIdDoEvento, "uma_vez_por_contato");
      }
    }
  }
  const paraExecutar = applicable.filter((rule) => !barradasPelaReserva.includes(rule));
  if (!paraExecutar.length) {
    return { consumer_key: AUTOMATION_CONSUMER_KEY, status: "ok", detail: "uma_vez_por_contato" };
  }

  for (const rule of paraExecutar) {
    const results: ActionResultDetail[] = [];
    // O índice é o da lista INTEIRA — a posição do resultado em
    // `actions_result` e parte do id da entrega do webhook (#1529).
    for (const [indiceDaAcao, action] of (rule.actions ?? []).entries()) {
      const executor = getAction(action.type);
      if (!executor) {
        results.push({ type: action.type, status: "failed", error: "unknown_action" });
        continue;
      }
      try {
        results.push(
          await executor.execute(
            {
              admin,
              serviceBoundaries,
              organizationId: row.organization_id,
              ruleId: rule.id,
              ruleName: rule.name,
              event: row,
              context,
              requestId: row.id,
              actionIndex: indiceDaAcao,
              ruleActions: rule.actions ?? [],
            },
            action.config ?? {},
          ),
        );
      } catch (err) {
        results.push({
          type: action.type,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ═══ O AGREGADOR TAMBÉM PRECISA DIZER A VERDADE ═══
    //
    // `failed === 0 ? "success"` fazia uma ação `postponed` — mensagem que ficou
    // em `queued` e NÃO chegou ao cliente — virar "Sucesso" verde na tela. É o
    // MESMO defeito que `desfecho-do-envio.ts` existe para matar, ressurgindo
    // um nível acima: a ação passou a ser honesta e quem soma continuava
    // mentindo. Conserto por instância, não por classe.
    //
    // Achado por revisão adversarial, com o cenário alcançável: instalação sem
    // o transporte de WhatsApp configurado (o caso de TODA instalação nova), a
    // janela aberta, `postponeUntil` devolve null, a ação executa, e o envio
    // termina em `queued` com `queued_reason`. É exatamente o estado congelado
    // em `tests/invariants/automation-send-whatsapp.test.ts` caso 2.
    //
    // A MESMA mentira reapareceu de novo, um degrau abaixo: `status ===
    // "skipped"` (guarda-do-contato.ts — sem contato, bloqueado, sem telefone,
    // OU sem consentimento) também não era `failed` nem `postponed`, então caía
    // no `else` e virava "Sucesso" — pra uma mensagem que nunca foi NEM
    // TENTADA. Achado pelo e2e `tests/e2e/automacao-diz-a-verdade.spec.ts`: um
    // lead de webhook genérico (sem Respondi, sem pergunta de consentimento)
    // nunca tem `consent.marketing.granted_at`, então TODO envio automático
    // pra um lead assim batia no gate de consentimento — e a tela dizia
    // "Sucesso" pra um envio que nem chegou a discar o WhatsApp. Pior que o
    // defeito original: aquele pelo menos tinha TENTADO.
    //
    // `skipped` entra junto de `failed` na contagem: as duas significam "não
    // saiu, e não é a fila que vai resolver sozinha" — a diferença entre elas
    // (uma tentou e não conseguiu, a outra nem tentou) é o `reason`/`error` que
    // a ação já registra, não o status agregado.
    //
    // A ordem importa: falha (+ skip) vence adiamento. Uma regra em que uma
    // ação falhou/pulou e outra ficou esperando é `partial` — quem lê precisa
    // saber que algo quebrou, não que está tudo a caminho.
    // (A régua mora em `statusDoRun`: o bloqueio por contato também precisa dela.)
    const status = statusDoRun(results);
    const { data: runRow, error: runErr } = await admin
      .from("automation_rule_runs")
      .insert({
        organization_id: row.organization_id,
        rule_id: rule.id,
        event_id: row.id,
        // O contato da execução: é esta linha que barra a próxima passagem do
        // MESMO contato. Nulo quando não há limite ou o evento não o resolve.
        contact_id: contatoIdDoEvento,
        status,
        actions_result: results,
      })
      .select("id")
      .maybeSingle();
    if (runErr) logger.error("[automation.engine] run insert failed", { error: runErr.message });

    // Audit só em falha/partial (spec §9) — não inflar audit em toda run.
    if (status !== "success") {
      void audit({
        action: "automation.rule_executed",
        organizationId: row.organization_id,
        resourceType: "automation_rule_run",
        resourceId: runRow?.id ?? null,
        metadata: { rule_id: rule.id, status, event_type: row.event_type },
      });
    }

    // run_count sem RPC de increment: read-modify-write é aceitável aqui
    // (contador informativo de UI, não invariante).
    const { data: cur } = await admin
      .from("automation_rules")
      .select("run_count")
      .eq("id", rule.id)
      .maybeSingle();
    await admin
      .from("automation_rules")
      .update({ last_run_at: new Date().toISOString(), run_count: (cur?.run_count ?? 0) + 1 })
      .eq("id", rule.id);
  }

  return { consumer_key: AUTOMATION_CONSUMER_KEY, status: "ok" };
}

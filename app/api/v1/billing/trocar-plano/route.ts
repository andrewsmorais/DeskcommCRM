/**
 * Troca de plano pelo próprio cliente — entre Essencial, Impulso e Escala (0508).
 *
 * POST pede a troca; DELETE desiste da que está em andamento. A regra mora em
 * `lib/billing/troca-de-plano.ts` (a da Umbler Talk): subir paga a diferença
 * proporcional e vale quando o pagamento é confirmado; descer vale no fim do
 * período já pago; no teste, vale na hora.
 *
 * Quem aplica o upgrade pago é o webhook do Asaas na página de vendas, pela
 * identidade da cobrança gravada aqui (`troca_pagamento_id`). Esta rota nunca
 * marca o plano novo antes de o dinheiro entrar.
 *
 * Ordem dos efeitos: primeiro o Asaas, depois o banco com trava otimista
 * (`updated_at`). Se o banco recusar, o efeito no Asaas é desfeito no melhor
 * esforço e a resposta pede para atualizar a página — nunca duas cobranças,
 * nunca plano trocado sem a recorrência acompanhar.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import {
  apagarCobranca,
  atualizarValorDaAssinatura,
  clienteDaAssinatura,
  criarCobrancaAvulsa,
} from "@/lib/asaas";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { getOrganizationBilling, type OrganizationBilling } from "@/lib/billing";
import { PLANOS_COMERCIAIS, planoComercial } from "@/lib/billing/catalogo";
import {
  MENSAGEM_DA_RECUSA,
  PLANOS_TROCAVEIS,
  cicloValido,
  decidirTroca,
  precoDoCiclo,
  type PrecosDoPlano,
} from "@/lib/billing/troca-de-plano";
import { excessosParaOPlano, frasesDoExcesso, lerUsoDoPlano } from "@/lib/billing/uso-do-plano";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const Pedido = z.object({ plano: z.enum(PLANOS_TROCAVEIS) }).strict();

const LIMPA_TROCA = {
  troca_plano: null,
  troca_tipo: null,
  troca_efetiva_em: null,
  troca_pagamento_id: null,
  troca_valor_cents: null,
  troca_link: null,
  troca_pedida_em: null,
};

async function lerAssinatura(
  orgId: string,
  requestId: string,
): Promise<OrganizationBilling | Response> {
  const leitura = await getOrganizationBilling(orgId);
  if (!leitura.ok)
    return fail(
      "billing_unavailable",
      "Não foi possível consultar sua assinatura. Tente novamente.",
      503,
      { requestId },
    );
  const b = leitura.billing;
  if (!b) return fail("not_found", "Assinatura não encontrada.", 404, { requestId });
  if (!b.subscription_id || !b.updated_at)
    return fail(
      "billing_unavailable",
      "Não foi possível confirmar sua assinatura. Tente novamente.",
      503,
      { requestId },
    );
  return b;
}

async function precosDoCatalogo(
  slugs: string[],
): Promise<Map<string, PrecosDoPlano & { id: string }> | null> {
  const { data, error } = await createAdminClient()
    .from("plans")
    .select("id, slug, price_monthly, price_quarterly, price_yearly")
    .in("slug", slugs);
  if (error || !Array.isArray(data)) return null;
  const mapa = new Map<string, PrecosDoPlano & { id: string }>();
  for (const p of data as Array<Record<string, unknown>>) {
    if (
      typeof p.id !== "string" ||
      typeof p.slug !== "string" ||
      typeof p.price_monthly !== "number" ||
      p.price_monthly <= 0
    )
      continue;
    mapa.set(p.slug, {
      id: p.id,
      price_monthly: p.price_monthly,
      price_quarterly: typeof p.price_quarterly === "number" ? p.price_quarterly : null,
      price_yearly: typeof p.price_yearly === "number" ? p.price_yearly : null,
    });
  }
  return slugs.every((s) => mapa.has(s)) ? mapa : null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * O vencimento da cobrança da diferença: dois dias, como uma fatura comum — mas
 * NUNCA depois da véspera da renovação. Paga depois da renovação, a diferença
 * (calculada sobre os dias que faltavam) compraria um período INTEIRO do plano
 * maior pelo preço do menor (auditoria de 19/11). `null` = não há tempo: a
 * subida espera a renovação.
 */
function vencimentoDaDiferenca(agora: Date, fimDoPeriodo: string | null): string | null {
  const fim = fimDoPeriodo ? Date.parse(fimDoPeriodo) : NaN;
  if (!Number.isFinite(fim)) return null;
  const vespera = fim - DIA_MS;
  if (vespera <= agora.getTime()) return null;
  return new Date(Math.min(agora.getTime() + 2 * DIA_MS, vespera)).toISOString().slice(0, 10);
}

/**
 * Pede o e-mail do pedido de troca (`plano.troca_pedida`, consumido pelos
 * e-mails de relacionamento). Cortesia: falhar aqui nunca desfaz a troca, que
 * já está gravada. O e-mail lê a troca do BANCO; o payload só leva quem pediu.
 */
async function avisarTrocaPedida(
  admin: ReturnType<typeof createAdminClient>,
  args: { orgId: string; subscriptionId: string; userId: string },
): Promise<void> {
  try {
    const { error } = await admin.rpc("emit_event" as never, {
      p_event_type: "plano.troca_pedida",
      p_entity_kind: "subscription",
      p_entity_id: args.subscriptionId,
      p_payload: { user_id: args.userId },
      p_metadata: { source: "billing.trocar-plano" },
      p_organization_id: args.orgId,
    } as never);
    if (error) throw error;
  } catch (err) {
    logger.warn("[billing] aviso da troca pedida não foi enfileirado", {
      erro: err instanceof Error ? err.message : "desconhecido",
    });
  }
}

function reais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function POST(req: Request) {
  const requestId = randomUUID();
  // Acompanhamento de suporte não troca o plano de ninguém (guarda de efeito).
  const suporte = await requireSupportWrite();
  if (suporte) return suporte;
  const authz = await requireRole("admin", { requestId, resource: "subscription" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    corpo = null;
  }
  const pedido = Pedido.safeParse(corpo);
  if (!pedido.success)
    return fail("validation_failed", MENSAGEM_DA_RECUSA.plano_invalido, 422, { requestId });

  try {
    const b = await lerAssinatura(orgId, requestId);
    if (b instanceof Response) return b;
    if (b.troca)
      return fail(
        "troca_em_andamento",
        "Já existe uma troca de plano em andamento. Desista dela antes de pedir outra.",
        409,
        { requestId },
      );
    const atual = planoComercial(b.plan_slug);
    if (!atual)
      return fail("plano_invalido", MENSAGEM_DA_RECUSA.plano_invalido, 422, { requestId });
    // Escala com números combinados (proposta acima do pacote) não troca sozinho:
    // a conta proporcional usaria o preço da tabela, não o da proposta.
    if (atual === "escala" && b.escala_com_proposta)
      return fail("sob_consulta", MENSAGEM_DA_RECUSA.sob_consulta, 422, { requestId });
    if (!b.asaas_subscription_id)
      return fail(
        "sem_recorrencia",
        "Esta assinatura não é cobrada pelo cartão ou boleto automático. Fale com o suporte para trocar de plano.",
        422,
        { requestId },
      );

    const novo = pedido.data.plano;
    const precos = await precosDoCatalogo(atual === novo ? [atual] : [atual, novo]);
    if (!precos)
      return fail(
        "billing_unavailable",
        "Não foi possível consultar o preço dos planos. Tente novamente.",
        503,
        { requestId },
      );
    const agora = new Date();
    const decisao = decidirTroca({
      planoAtual: atual,
      planoNovo: novo,
      ciclo: b.billing_cycle,
      status: b.status,
      canceladaEm: b.canceled_at ?? null,
      inicioDoPeriodo: b.current_period_start ?? null,
      fimDoPeriodo: b.current_period_end,
      precoAtual: precos.get(atual)!,
      precoNovo: precos.get(novo) ?? precos.get(atual)!,
      agora,
      escalaPersonalizado: b.escala_com_proposta === true,
    });
    if (!decisao.ok)
      return fail(decisao.motivo, MENSAGEM_DA_RECUSA[decisao.motivo], 422, { requestId });

    const admin = createAdminClient();
    // Para DESCER, primeiro caber no plano novo (lib/billing/uso-do-plano.ts):
    // senão o que só cabe no maior continuaria funcionando pelo preço do menor.
    // Leitura que falha recusa — nunca deixa descer no escuro.
    if (decisao.tipo === "downgrade") {
      const uso = await lerUsoDoPlano(admin, orgId);
      if (!uso)
        return fail(
          "billing_unavailable",
          "Não foi possível conferir o uso do seu plano. Tente novamente.",
          503,
          { requestId },
        );
      const excessos = excessosParaOPlano(uso, novo);
      if (excessos.length > 0)
        return fail(
          "uso_acima_do_plano",
          `Para mudar para o ${PLANOS_COMERCIAIS[novo].nome}, primeiro deixe a conta dentro dele: ${frasesDoExcesso(excessos, novo)}. Arquive ou desligue o que sobra e peça a troca de novo.`,
          422,
          { requestId, details: { excessos } },
        );
    }
    const subId = b.asaas_subscription_id;
    const precoAtualDoCiclo = cicloValido(b.billing_cycle)
      ? precoDoCiclo(precos.get(atual)!, b.billing_cycle)
      : decisao.novoValorDoCicloCents;
    // Um downgrade que já venceu e a renovação ainda não consolidou: o plano em
    // vigor (`atual`) entra na assinatura junto com a troca nova, senão o
    // plano antigo voltaria a valer assim que a troca antiga fosse sobrescrita.
    const consolidar =
      b.plan_type && b.plan_type !== atual
        ? { plan_type: atual, plan_id: precos.get(atual)!.id }
        : {};
    const gravar = (campos: Record<string, unknown>) =>
      admin
        .from("subscriptions")
        .update({ ...consolidar, ...campos, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .eq("id", b.subscription_id!)
        .eq("updated_at", b.updated_at!)
        .select("id");
    const recusaDoBanco = () =>
      fail(
        "billing_conflict",
        "A assinatura mudou enquanto a troca era registrada. Atualize a página para conferir.",
        409,
        { requestId },
      );

    if (decisao.aplicarAgora) {
      // Teste (ou diferença abaixo do mínimo de cobrança): a recorrência passa
      // a cobrar o plano novo, e o plano vale já.
      await atualizarValorDaAssinatura(subId, decisao.novoValorDoCicloCents);
      const { data, error } = await gravar({
        plan_id: precos.get(novo)!.id,
        plan_type: novo,
        contracted_amount_cents: decisao.novoValorDoCicloCents,
        contracted_at: agora.toISOString(),
        price_source: "catalogo",
        // Números combinados de um Escala antigo não sobrevivem à troca: senão,
        // descer e subir de novo devolveria a proposta pelo preço da tabela.
        limites_personalizados: null,
      });
      if (error || data?.length !== 1) {
        await atualizarValorDaAssinatura(subId, precoAtualDoCiclo).catch(() => undefined);
        return recusaDoBanco();
      }
      void audit({
        action: "billing.plan_changed",
        actorUserId: userId,
        organizationId: orgId,
        resourceType: "subscription",
        resourceId: b.subscription_id,
        metadata: {
          de: atual,
          para: novo,
          tipo: decisao.tipo,
          motivo: b.status === "trialing" ? "teste" : "diferenca_minima",
        },
        requestId,
        bypassedRls: true,
      });
      return ok(
        { tipo: decisao.tipo, aplicado_agora: true, valor_cents: 0, link: null, efetiva_em: null },
        { requestId },
      );
    }

    if (decisao.tipo === "upgrade") {
      const vencimento = vencimentoDaDiferenca(agora, b.current_period_end);
      if (!vencimento)
        return fail(
          "renovacao_proxima",
          "Sua renovação é em menos de um dia. Peça a subida depois que ela for paga: assim a diferença é calculada sobre o período novo.",
          422,
          { requestId },
        );
      const cliente = await clienteDaAssinatura(subId);
      const cobranca = await criarCobrancaAvulsa({
        cliente,
        valorCents: decisao.valorCents,
        vencimento,
        descricao: `Troca para o plano ${PLANOS_COMERCIAIS[novo].nome}: diferença proporcional aos ${decisao.diasRestantes} dias restantes do período (${reais(decisao.valorCents)}).`,
        referencia: `troca:${b.subscription_id}`,
      });
      const { data, error } = await gravar({
        troca_plano: novo,
        troca_tipo: "upgrade",
        troca_efetiva_em: null,
        troca_pagamento_id: cobranca.id,
        troca_valor_cents: decisao.valorCents,
        troca_link: cobranca.link,
        troca_pedida_em: agora.toISOString(),
      });
      if (error || data?.length !== 1) {
        await apagarCobranca(cobranca.id).catch(() => undefined);
        return recusaDoBanco();
      }
      await avisarTrocaPedida(admin, {
        orgId,
        subscriptionId: b.subscription_id!,
        userId,
      });
      void audit({
        action: "billing.plan_change_requested",
        actorUserId: userId,
        organizationId: orgId,
        resourceType: "subscription",
        resourceId: b.subscription_id,
        metadata: { de: atual, para: novo, tipo: "upgrade", valor_cents: decisao.valorCents },
        requestId,
        bypassedRls: true,
      });
      return ok(
        {
          tipo: "upgrade",
          aplicado_agora: false,
          valor_cents: decisao.valorCents,
          link: cobranca.link,
          efetiva_em: null,
        },
        { requestId },
      );
    }

    // Downgrade: o período pago segue no plano atual; a próxima cobrança (já
    // gerada ou não) sai com o valor menor.
    await atualizarValorDaAssinatura(subId, decisao.novoValorDoCicloCents);
    const { data, error } = await gravar({
      troca_plano: novo,
      troca_tipo: "downgrade",
      troca_efetiva_em: decisao.efetivaEm,
      troca_pagamento_id: null,
      troca_valor_cents: null,
      troca_link: null,
      troca_pedida_em: agora.toISOString(),
    });
    if (error || data?.length !== 1) {
      await atualizarValorDaAssinatura(subId, precoAtualDoCiclo).catch(() => undefined);
      return recusaDoBanco();
    }
    await avisarTrocaPedida(admin, {
      orgId,
      subscriptionId: b.subscription_id!,
      userId,
    });
    void audit({
      action: "billing.plan_change_requested",
      actorUserId: userId,
      organizationId: orgId,
      resourceType: "subscription",
      resourceId: b.subscription_id,
      metadata: { de: atual, para: novo, tipo: "downgrade", efetiva_em: decisao.efetivaEm },
      requestId,
      bypassedRls: true,
    });
    return ok(
      {
        tipo: "downgrade",
        aplicado_agora: false,
        valor_cents: 0,
        link: null,
        efetiva_em: decisao.efetivaEm,
      },
      { requestId },
    );
  } catch (err) {
    logger.warn("[billing] troca de plano não concluída", {
      erro: err instanceof Error ? err.message : "desconhecido",
    });
    return fail(
      "upstream_unavailable",
      "Não foi possível falar com o sistema de cobrança agora. Nada foi trocado; tente de novo em alguns minutos.",
      503,
      { requestId },
    );
  }
}

export async function DELETE() {
  const requestId = randomUUID();
  // Acompanhamento de suporte não troca o plano de ninguém (guarda de efeito).
  const suporte = await requireSupportWrite();
  if (suporte) return suporte;
  const authz = await requireRole("admin", { requestId, resource: "subscription" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  const userId = authz.user.id;
  try {
    const b = await lerAssinatura(orgId, requestId);
    if (b instanceof Response) return b;
    const troca = b.troca;
    if (!troca) return ok({ desistiu: false }, { requestId });
    const admin = createAdminClient();
    let desfazerNoAsaas: (() => Promise<void>) | null = null;

    if (troca.tipo === "upgrade") {
      if (troca.pagamento_id) {
        try {
          await apagarCobranca(troca.pagamento_id);
        } catch {
          return fail(
            "troca_ja_paga",
            "Não foi possível cancelar a cobrança da diferença — se ela já foi paga, o plano novo entra em instantes. Atualize a página para conferir.",
            409,
            { requestId },
          );
        }
      }
    } else {
      // Volta a recorrência ao valor do plano que continua.
      const atual = planoComercial(b.plan_slug);
      const destino = planoComercial(troca.plano);
      const precos =
        atual && destino ? await precosDoCatalogo(atual === destino ? [atual] : [atual, destino]) : null;
      if (!atual || !destino || !precos || !b.asaas_subscription_id || !cicloValido(b.billing_cycle))
        return fail(
          "billing_unavailable",
          "Não foi possível confirmar o valor do seu plano. Tente novamente.",
          503,
          { requestId },
        );
      await atualizarValorDaAssinatura(
        b.asaas_subscription_id,
        precoDoCiclo(precos.get(atual)!, b.billing_cycle),
      );
      // Se o banco recusar a desistência logo abaixo, a recorrência volta ao
      // valor da troca que continua valendo (nunca plano menor cobrado maior).
      desfazerNoAsaas = () =>
        atualizarValorDaAssinatura(
          b.asaas_subscription_id!,
          precoDoCiclo(precos.get(destino)!, b.billing_cycle as "monthly"),
        ).then(() => undefined);
    }

    let consulta = admin
      .from("subscriptions")
      .update({ ...LIMPA_TROCA, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("id", b.subscription_id!)
      .eq("troca_tipo", troca.tipo)
      .eq("troca_plano", troca.plano);
    if (troca.pagamento_id) consulta = consulta.eq("troca_pagamento_id", troca.pagamento_id);
    const { data, error } = await consulta.select("id");
    if (error || data?.length !== 1) {
      if (desfazerNoAsaas) await desfazerNoAsaas().catch(() => undefined);
      return fail(
        "billing_conflict",
        "A assinatura mudou enquanto a desistência era registrada. Atualize a página para conferir.",
        409,
        { requestId },
      );
    }
    void audit({
      action: "billing.plan_change_canceled",
      actorUserId: userId,
      organizationId: orgId,
      resourceType: "subscription",
      resourceId: b.subscription_id,
      metadata: { para: troca.plano, tipo: troca.tipo },
      requestId,
      bypassedRls: true,
    });
    return ok({ desistiu: true }, { requestId });
  } catch (err) {
    logger.warn("[billing] desistência da troca de plano não concluída", {
      erro: err instanceof Error ? err.message : "desconhecido",
    });
    return fail(
      "upstream_unavailable",
      "Não foi possível falar com o sistema de cobrança agora. Tente de novo em alguns minutos.",
      503,
      { requestId },
    );
  }
}

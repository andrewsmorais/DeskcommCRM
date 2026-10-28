import { redirect } from "next/navigation";
import { format } from "date-fns";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { emailDeSuporte } from "@/lib/branding/saida";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { traduzir } from "@/lib/i18n/dicionario";
import { localeDeData } from "@/lib/i18n/datas";
import { getOrganizationBilling } from "@/lib/billing";
import { enderecoDosPlanos } from "@/lib/billing/pagina-de-planos";
import { faturaEmAberto } from "@/lib/billing/fatura-em-aberto";
import { createAdminClient } from "@/lib/supabase/admin";
import { CancelSubscription } from "@/components/app/CancelSubscription";
import { FalhaNaLeituraDoPlano } from "@/components/app/EstadoDoPlano";
import { RECURSOS_DO_PLANO, planoInclui, type RecursoDoPlano } from "@/lib/billing/catalogo";
import { consultarCotaDaEquipe } from "@/lib/billing/equipe";
import { contarCanaisDoPlano } from "@/lib/channels/cota-do-plano";
import { disparoEmMassaLigado } from "@/lib/instalacao/disparo-em-massa";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const idioma = user.idioma;
  const admin = createAdminClient();
  const leituraDoPlano = await getOrganizationBilling(activeOrg.orgId);
  // Campanhas só aparecem na lista de recursos quando o disparo em massa está
  // ligado na instalação; desligado, o recurso não existe para ninguém.
  const comDisparo = await disparoEmMassaLigado();
  const billing = leituraDoPlano.ok ? leituraDoPlano.billing : null;
  // Assinatura parada: o caminho de volta é pagar a cobrança aberta no Asaas.
  const fatura = billing && !billing.is_active ? await faturaEmAberto(activeOrg.orgId) : null;
  const equipe = billing
    ? await consultarCotaDaEquipe(admin, activeOrg.orgId).catch(() => null)
    : null;

  // Conta uso atual
  // A mesma conta que a cota aplica (`lib/channels/cota-do-plano.ts`).
  const { count: whatsappCount, error: whatsappError } = await contarCanaisDoPlano(
    admin,
    activeOrg.orgId,
  );
  const [
    { count: pipelinesCount, error: pipelinesError },
    { count: agentesCount, error: agentesError },
    { count: chatbotsCount, error: chatbotsError },
  ] = await Promise.all([
    admin
      .from("crm_pipelines")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", activeOrg.orgId)
      .eq("is_archived", false),
    // As mesmas contas que as cotas aplicam (cota-de-agentes, chatbot/plano).
    admin
      .from("ai_agents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", activeOrg.orgId)
      .is("archived_at", null),
    admin
      .from("chatbot_flows")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", activeOrg.orgId)
      .eq("is_active", true),
  ]);

  const t = (texto: string) => traduzir(texto, idioma);
  const formatDate = (date: string) =>
    format(new Date(date), "dd 'de' MMMM 'de' yyyy", { locale: localeDeData(idioma) });

  const ciclos: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    yearly: "Anual",
  };

  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    trialing: "bg-blue-100 text-blue-800",
    past_due: "bg-yellow-100 text-yellow-800",
    suspended: "bg-red-100 text-red-800",
    canceled: "bg-gray-100 text-gray-800",
  };

  const translatedStatus: Record<string, string> = {
    active: t("Ativo"),
    trialing: t("Em Período de Teste"),
    past_due: t("Pagamento Atrasado"),
    suspended: t("Suspenso"),
    canceled: t("Cancelado"),
  };

  const statusStr = billing ? billing.status : "canceled";
  const badgeColor = statusColors[statusStr] || "bg-gray-100 text-gray-800";
  const badgeLabel =
    billing && !billing.is_active && (statusStr === "active" || statusStr === "trialing")
      ? "Período encerrado"
      : translatedStatus[statusStr] || statusStr;

  const getLimitLabel = (limit: number | undefined, count?: number) => {
    if (limit === -1) return t("Ilimitado");
    if (limit === undefined) return "Não confirmado";
    if (count !== undefined) return `${count} ${t("de")} ${limit}`;
    return String(limit);
  };

  // Se não tem banco de tickets no CRM, jogamos pro número de atendimento da Chatai
  // A instrução diz: "por enquanto aponta para o suporte (WhatsApp de atendimento do produto)"
  // Vou usar o número 554799999999 ou só mandar pra o email de suporte que já temos
  const suporteEmail = await emailDeSuporte();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Plano e cobrança")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Gerencie sua assinatura e uso de recursos da plataforma.")}
        </p>
      </header>

      {!leituraDoPlano.ok ? (
        <FalhaNaLeituraDoPlano reason={leituraDoPlano.reason} />
      ) : billing ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-medium">{t("Assinatura Atual")}</h2>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-xl font-semibold">{billing.plan_name}</p>
                <p className="text-sm text-muted-foreground">
                  {t("Ciclo")} {t(ciclos[billing.billing_cycle] ?? billing.billing_cycle)}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeColor}`}>
                {badgeLabel}
              </span>
            </div>

            {billing.current_period_end && billing.status !== "canceled" && (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("Sua assinatura renova em")}{" "}
                <span className="font-medium text-foreground">
                  {formatDate(billing.current_period_end)}
                </span>
                .
              </p>
            )}

            <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {fatura ? (
                <Button asChild>
                  <a
                    href={fatura.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="fatura-em-aberto"
                  >
                    {t("Pagar a fatura em aberto")}
                  </a>
                </Button>
              ) : null}
              <Button asChild variant={fatura ? "outline" : "default"}>
                <a
                  href={enderecoDosPlanos(activeOrg.orgId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("Ver outros planos")}
                </a>
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-medium">{t("Limites do Plano")}</h2>
            <div className="mt-4 space-y-4">
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("Números de WhatsApp")}</span>
                <span className="text-sm text-muted-foreground">
                  {whatsappError || whatsappCount === null
                    ? t("Não confirmado")
                    : getLimitLabel(billing.limits?.whatsapp, whatsappCount)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("Agentes de IA")}</span>
                <span className="text-sm text-muted-foreground">
                  {agentesError || agentesCount === null
                    ? t("Não confirmado")
                    : getLimitLabel(billing.limits?.agentes_ia, agentesCount)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("Chatbots ligados")}</span>
                <span className="text-sm text-muted-foreground">
                  {chatbotsError || chatbotsCount === null
                    ? t("Não confirmado")
                    : getLimitLabel(billing.limits?.chatbots, chatbotsCount)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("Funis")}</span>
                <span className="text-sm text-muted-foreground">
                  {pipelinesError || pipelinesCount === null
                    ? t("Não confirmado")
                    : getLimitLabel(billing.limits?.pipelines, pipelinesCount)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("Usuários da equipe")}</span>
                <span className="text-sm text-muted-foreground">
                  {equipe
                    ? `${equipe.ocupados} ${t("ativos")} + ${equipe.reservados} ${t("vagas reservadas")} / ${getLimitLabel(billing.limits?.usuarios)}`
                    : t("Não foi possível confirmar a ocupação")}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("Uso de IA")}</span>
                <span className="text-sm text-muted-foreground">{t("Sem limite")}</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {t(
                "Agentes de IA não ocupam vagas de usuários. Convites válidos reservam uma vaga até serem aceitos, revogados ou expirarem. Se você mudar para um plano menor, nada do que já existe é apagado: só não dá para criar mais até voltar ao limite.",
              )}
            </p>
            <h3 className="mt-6 text-base font-medium">{t("Recursos do plano")}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {Object.entries(RECURSOS_DO_PLANO)
                .filter(([key]) => comDisparo || key !== "campanhas")
                .map(([key, oferta]) => (
                  <li key={key} className="flex justify-between gap-3">
                    <span>{oferta.nome}</span>
                    <span className="text-muted-foreground">
                      {planoInclui(billing.plan_slug, key as RecursoDoPlano)
                        ? billing.is_active
                          ? t("Incluído")
                          : t("Assinatura inativa")
                        : `${t("A partir de")} ${oferta.desde === "impulso" ? "Impulso" : "Escala"}`}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>

          <CancelSubscription
            status={statusStr}
            currentPeriodEnd={billing.current_period_end}
            idioma={idioma}
            suporteUrl={suporteEmail ? `mailto:${suporteEmail}` : "https://wa.me/5511999999999"}
          />
        </div>
      ) : (
        <Card className="max-w-xl p-6">
          <h2 className="text-lg font-medium">{t("Nenhuma assinatura ativa")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Sua organização atualmente não possui um plano vinculado.")}
          </p>
          <div className="mt-6">
            <Button asChild>
              <a
                href={enderecoDosPlanos(activeOrg.orgId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Escolher um plano")}
              </a>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

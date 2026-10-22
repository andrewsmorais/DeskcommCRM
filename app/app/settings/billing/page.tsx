import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ptBR, es, enUS } from "date-fns/locale";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { emailDeSuporte } from "@/lib/branding/saida";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { traduzir } from "@/lib/i18n/dicionario";
import { getOrganizationBilling } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { CancelSubscription } from "@/components/app/CancelSubscription";
import { FalhaNaLeituraDoPlano } from "@/components/app/EstadoDoPlano";
import { RECURSOS_DO_PLANO, planoInclui, type RecursoDoPlano } from "@/lib/billing/catalogo";
import { consultarCotaDaEquipe } from "@/lib/billing/equipe";
import { CANAIS_CONTADOS_NO_PLANO } from "@/lib/channels/cota-do-plano";
import { disparoEmMassaLigado } from "@/lib/instalacao/disparo-em-massa";

export const dynamic = "force-dynamic";

function getLocale(idioma: string) {
  if (idioma === "en-US") return enUS;
  if (idioma === "es") return es;
  return ptBR;
}

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
  const equipe = billing
    ? await consultarCotaDaEquipe(admin, activeOrg.orgId).catch(() => null)
    : null;

  // Conta uso atual
  const { count: whatsappCount, error: whatsappError } = await admin
    .from("channel_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", activeOrg.orgId)
    .is("archived_at", null)
    .in("provider", CANAIS_CONTADOS_NO_PLANO);
  const { count: pipelinesCount, error: pipelinesError } = await admin
    .from("crm_pipelines")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false);

  const t = (texto: string) => traduzir(texto, idioma);
  const formatDate = (date: string) =>
    format(new Date(date), "dd 'de' MMMM 'de' yyyy", { locale: getLocale(idioma) });

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
                  {billing.seats} {t("atendente(s)")} • {t("Ciclo")} {billing.billing_cycle}
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
              <Button asChild>
                <a href="https://chataionline.io/#precos" target="_blank" rel="noopener noreferrer">
                  {t("Ver outros planos")}
                </a>
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-medium">{t("Limites do Plano")}</h2>
            <div className="mt-4 space-y-4">
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">Atendentes humanos</span>
                <span className="text-sm text-muted-foreground">
                  {equipe
                    ? `${equipe.ocupados} ativos + ${equipe.reservados} vagas reservadas / ${billing.seats} contratados`
                    : "Não foi possível confirmar a ocupação"}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("WhatsApps (Canais)")}</span>
                <span className="text-sm text-muted-foreground">
                  {whatsappError || whatsappCount === null
                    ? "Não confirmado"
                    : getLimitLabel(billing.limits?.whatsapp, whatsappCount)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("Pipelines")}</span>
                <span className="text-sm text-muted-foreground">
                  {pipelinesError || pipelinesCount === null
                    ? "Não confirmado"
                    : getLimitLabel(billing.limits?.pipelines, pipelinesCount)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm font-medium">{t("Setores")}</span>
                <span className="text-sm text-muted-foreground">
                  {getLimitLabel(billing.limits?.sectors)}
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Agentes de IA não ocupam vagas de atendentes humanos. Convites válidos reservam uma
              vaga até serem aceitos, revogados ou expirarem.
            </p>
            <h3 className="mt-6 text-base font-medium">Recursos do plano</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {Object.entries(RECURSOS_DO_PLANO).filter(([key]) => comDisparo || key !== "campanhas").map(([key, oferta]) => (
                <li key={key} className="flex justify-between gap-3">
                  <span>{oferta.nome}</span>
                  <span className="text-muted-foreground">
                    {planoInclui(billing.plan_slug, key as RecursoDoPlano)
                      ? billing.is_active
                        ? "Incluído"
                        : "Assinatura inativa"
                      : `A partir de ${oferta.desde === "impulso" ? "Impulso" : "Escala"}`}
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
              <a href="https://chataionline.io/#precos" target="_blank" rel="noopener noreferrer">
                {t("Escolher um plano")}
              </a>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

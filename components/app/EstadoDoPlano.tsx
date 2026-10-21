"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import type { BillingReadResult, OrganizationBilling } from "@/lib/billing";

type Falha = Extract<BillingReadResult, { ok: false }>;

export function FalhaNaLeituraDoPlano({ reason }: Pick<Falha, "reason">) {
  const t = useT();
  const router = useRouter();

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm"
    >
      <p>
        {reason === "plano_desconhecido"
          ? t(
              "Sua assinatura foi encontrada, mas não foi possível identificar o plano. Tente novamente; se continuar, fale com o suporte.",
            )
          : t(
              "Não foi possível consultar seu plano agora. Tente novamente. Seus dados continuam disponíveis.",
            )}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
        {t("Tentar novamente")}
      </Button>
    </div>
  );
}

export function ResumoDoPlano({
  billing,
}: {
  billing: Pick<OrganizationBilling, "plan_name" | "billing_cycle" | "status">;
}) {
  const t = useT();
  const ciclos: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    yearly: "Anual",
  };
  const estados: Record<string, string> = {
    active: "Ativo",
    trialing: "Em período de teste",
    pending: "Pagamento pendente",
    past_due: "Pagamento atrasado",
    suspended: "Suspenso",
    canceled: "Cancelado",
  };

  return (
    <section
      aria-label={t("Plano escolhido")}
      className="mb-6 space-y-1 rounded-lg border border-border bg-background p-4 text-sm"
    >
      <p className="font-medium">
        {t("Seu plano")}: {billing.plan_name}
      </p>
      <p className="text-muted-foreground">
        {t(ciclos[billing.billing_cycle] ?? "Ciclo não informado")} ·{" "}
        {t(estados[billing.status] ?? "Situação não informada")}
      </p>
      <p className="text-muted-foreground">{t("Continue abaixo para configurar seu agente.")}</p>
    </section>
  );
}

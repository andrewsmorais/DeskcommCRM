import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { getOrganizationBilling } from "@/lib/billing";
import { decidirAcessoPeloPlano } from "@/lib/billing/exigencia";
import { enderecoDosPlanos } from "@/lib/billing/pagina-de-planos";
import { faturaEmAberto } from "@/lib/billing/fatura-em-aberto";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Assinatura",
};

/**
 * Para onde o CRM manda quem está sem assinatura ativa (lib/billing/exigencia.ts).
 *
 * Mora FORA de `app/app/` de propósito, como `account-suspended`: o layout de
 * `/app` é quem redireciona para cá, e uma tela dentro dele dependeria de uma
 * lista de exceções para não redirecionar para si mesma.
 */
export default async function AssinaturaPage() {
  const user = await loadAuthUser();
  if (!user) redirect("/login");
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const leitura = await getOrganizationBilling(activeOrg.orgId);
  const acesso = decidirAcessoPeloPlano(leitura, {
    isento: user.is_platform_admin || Boolean(user.support),
  });
  // Pagou (o webhook já chegou) ou é isento: esta tela não tem mais o que dizer.
  if (acesso.liberado) redirect("/app");

  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);
  const administra = ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;
  const vencido = acesso.motivo === "vencido";
  // Quem atrasou não precisa de plano novo: paga a cobrança que está aberta no
  // Asaas e o webhook reabre o CRM. Sem cobrança achada, fica só "Escolher plano".
  const fatura = vencido && administra ? await faturaEmAberto(activeOrg.orgId) : null;
  const tag = tagDeIdioma(idioma);
  const valorDaFatura =
    fatura?.valor != null
      ? fatura.valor.toLocaleString(tag, { style: "currency", currency: "BRL" })
      : null;
  const vencimentoDaFatura = fatura?.vencimento
    ? new Date(`${fatura.vencimento}T12:00:00`).toLocaleDateString(tag)
    : null;

  return (
    <IdiomaProvider locale={idioma}>
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-lg space-y-5 p-8" data-testid="assinatura-pendente">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {vencido
                ? t("Sua assinatura não está ativa")
                : t("Escolha um plano para começar a usar")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {vencido
                ? t(
                    "O período de teste terminou ou o pagamento não foi confirmado. Enquanto isso, o CRM e os agentes ficam pausados.",
                  )
                : t(
                    "Sua conta foi criada, mas ainda não tem um plano. Todos os planos começam com 7 dias grátis.",
                  )}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("Seus contatos, conversas e configurações continuam guardados.")}
            </p>
          </div>

          {administra && fatura ? (
            <div
              className="space-y-2 rounded-lg border border-border p-3"
              data-testid="fatura-em-aberto"
            >
              <p className="text-sm">
                {fatura.vencida ? t("Há uma cobrança vencida") : t("Há uma cobrança em aberto")}
                {valorDaFatura ? ` · ${valorDaFatura}` : ""}
                {vencimentoDaFatura ? ` · ${t("vencimento")} ${vencimentoDaFatura}` : ""}
              </p>
              <Button asChild className="w-full">
                <a href={fatura.url} target="_blank" rel="noopener noreferrer">
                  {t("Pagar a fatura em aberto")}
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Depois de pagar, o acesso volta sozinho em alguns minutos. Pix costuma ser na hora.",
                )}
              </p>
            </div>
          ) : null}

          {administra ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant={fatura ? "outline" : "default"}>
                <a href={enderecoDosPlanos(activeOrg.orgId)}>
                  {fatura ? t("Escolher outro plano") : t("Escolher plano")}
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/settings/billing">{t("Ver cobrança")}</Link>
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border border-border p-3 text-sm">
              {t("Peça para quem administra a sua empresa no sistema regularizar o plano.")}
            </p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
            {administra ? (
              <Link
                href="/app/settings/tenant"
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("Baixar meus dados")}
              </Link>
            ) : null}
            <Link
              href="/login"
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {t("Sair")}
            </Link>
          </div>
        </Card>
      </main>
    </IdiomaProvider>
  );
}

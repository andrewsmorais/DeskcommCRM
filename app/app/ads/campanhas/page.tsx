/**
 * Análise → Vendas por campanha. De qual campanha (Facebook e Instagram, Google
 * Ads, TikTok Ads, Pinterest Ads) vieram os contatos do período, e quantos
 * viraram venda — a pergunta "qual anúncio está dando dinheiro".
 *
 * A origem de cada contato é o primeiro toque gravado pelo próprio CRM (link
 * rastreável com UTM, clique do Google Ads, anúncio de clique para o WhatsApp):
 * nada é lido da plataforma no momento, então a tela abre sem conta conectada.
 * A conta é a da `fn_vendas_por_campanha` (migration 0566).
 *
 * `manager`, como a vizinha Meta Ads: não há recorte por pessoa, o resultado é
 * da empresa inteira.
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  lerVendasPorCampanha,
  NOME_DA_PLATAFORMA,
  PERIODOS,
  periodoDaUrl,
  taxaDeVenda,
  type LinhaDaCampanha,
} from "@/lib/plataformas-de-anuncio/vendas-por-campanha";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Vendas por campanha" };
export const dynamic = "force-dynamic";

export default async function VendasPorCampanhaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const dias = periodoDaUrl((await searchParams).dias);
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);
  const tag = tagDeIdioma(idioma);
  const dinheiro = (cents: number) =>
    (cents / 100).toLocaleString(tag, { style: "currency", currency: "BRL" });
  const inteiro = (n: number) => n.toLocaleString(tag);

  let grupos: Awaited<ReturnType<typeof lerVendasPorCampanha>> = [];
  let falhou = false;
  try {
    grupos = await lerVendasPorCampanha(createAdminClient(), activeOrg.orgId, dias);
  } catch {
    falhou = true;
  }

  const celulas = (l: LinhaDaCampanha) => {
    const taxa = taxaDeVenda(l);
    return (
      <>
        <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.contatos)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.negocios)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.avancaram)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.vendas)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{dinheiro(l.faturamentoCents)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {taxa === null ? "—" : `${taxa.toLocaleString(tag)}%`}
        </td>
      </>
    );
  };

  return (
    <div
      data-superficie="clara"
      className="-m-6 flex min-h-[calc(100%+3rem)] flex-col gap-6 bg-bg p-6 text-text"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Vendas por campanha")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            "De qual campanha vieram as pessoas que chegaram no período, e quantas compraram. Vale para Facebook e Instagram, Google Ads, TikTok Ads e Pinterest Ads.",
          )}
        </p>
      </header>

      <nav aria-label={t("Período")} className="flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={`/app/ads/campanhas?dias=${p}`}
            aria-current={p === dias ? "page" : undefined}
            className={
              p === dias
                ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
                : "rounded-full border px-3 py-1 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {t(`Últimos ${p} dias`)}
          </Link>
        ))}
      </nav>

      {falhou ? (
        <p role="alert" className="rounded-md border p-4 text-sm">
          {t("Não foi possível ler as campanhas agora. Tente de novo em alguns minutos.")}
        </p>
      ) : grupos.length === 0 ? (
        <div className="rounded-md border p-6 text-sm">
          <p className="font-medium">{t("Nenhum contato chegou neste período.")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("Campanha")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Contatos")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Negócios")}</th>
                <th className="px-3 py-2 text-right font-medium" title={t("Negócio ganho ou que saiu da primeira etapa do funil")}>
                  {t("Avançaram no funil")}
                </th>
                <th className="px-3 py-2 text-right font-medium">{t("Vendas")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Faturamento")}</th>
                <th className="px-3 py-2 text-right font-medium" title={t("Vendas ÷ contatos")}>
                  {t("Taxa de venda")}
                </th>
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.plataforma} className="border-t">
                <tr className="bg-muted/30 font-semibold">
                  <th scope="rowgroup" className="px-3 py-2 text-left">
                    {t(NOME_DA_PLATAFORMA[g.plataforma])}
                  </th>
                  {celulas(g.total)}
                </tr>
                {g.plataforma !== "sem_origem" &&
                  g.campanhas.map((c) => (
                    <tr key={`${g.plataforma}:${c.campanha}`} className="border-t">
                      <td className="max-w-[320px] truncate px-3 py-2 pl-6" title={c.campanha ?? ""}>
                        {c.campanha}
                      </td>
                      {celulas(c)}
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <section className="max-w-3xl space-y-2 text-sm text-muted-foreground">
        <h2 className="text-base font-medium text-text">{t("Como cada campanha é reconhecida")}</h2>
        <p>
          {t(
            "O anúncio de clique para o WhatsApp do Facebook e do Instagram é reconhecido sozinho. Para Google Ads, TikTok Ads e Pinterest Ads, use o link rastreável em Configurações › Conversões: lá está o link pronto para cada plataforma, que preenche o nome da campanha no clique.",
          )}
        </p>
        <p>
          {t(
            "Os números contam as pessoas que chegaram no período, e as vendas delas em qualquer data. Uma venda conta quando o negócio é ganho: marcado por você, pelo agente de IA, ou ao entrar numa etapa de venda ganha (como Pago).",
          )}
        </p>
        <p>
          <Link href="/app/settings/conversoes?aba=links" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("Abrir os links rastreáveis")}
          </Link>
        </p>
      </section>
    </div>
  );
}

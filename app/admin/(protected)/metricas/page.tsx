import Link from "next/link";
import type { ReactNode } from "react";

import { removerCustoDaPlataforma, salvarCustoDaPlataforma } from "@/app/actions/admin/salvarCustoDaPlataforma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  lerAquisicao,
  lerCrescimento,
  lerCustos,
  lerIA,
  lerLucro,
  lerReceita,
  ROTULO_DA_ORIGEM,
  ROTULO_DO_PLANO,
} from "@/lib/admin/metricas";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { loadAuthUser } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";
import { formatCentsBRL, formatCentsUSD } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

import { GraficoDeCrescimento } from "./_grafico-crescimento";

export const metadata = { title: "Métricas — Admin Plataforma" };
export const dynamic = "force-dynamic";

const ABAS = [
  { id: "receita", rotulo: "Receita e clientes" },
  { id: "aquisicao", rotulo: "Aquisição" },
  { id: "ia", rotulo: "IA" },
  { id: "lucro", rotulo: "Custos e lucro" },
] as const;
type AbaId = (typeof ABAS)[number]["id"];

/** Tradutor já ligado ao idioma de quem abriu a tela. */
type Traduz = (texto: string) => string;

const CATEGORIAS = ["servidor", "ia", "dominio", "email", "gateway", "ferramentas", "outros"];

function Indicador({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="text-2xl font-semibold tabular-nums">{valor}</p>
        {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
      </CardContent>
    </Card>
  );
}

function Falha({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg">
      {children}
    </p>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

const inteiro = (n: number) => n.toLocaleString("pt-BR");

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; teste?: string; cambio?: string }>;
}) {
  // A página é a porta dos dados de TODAS as empresas: o gate se repete aqui,
  // mesmo com o layout de /admin já o fazendo.
  await requirePlatformAdmin();
  const usuario = await loadAuthUser();
  const idioma = usuario?.idioma ?? IDIOMA_PADRAO;
  const t: Traduz = (texto) => traduzir(texto, idioma);

  const sp = await searchParams;
  const aba: AbaId = ABAS.some((a) => a.id === sp.aba) ? (sp.aba as AbaId) : "receita";
  const incluirTeste = sp.teste === "1";
  const cambio = Number((sp.cambio ?? "").replace(",", "."));
  const cambioUsado = Number.isFinite(cambio) && cambio > 0 ? cambio : 5.5;

  const href = (a: AbaId, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ aba: a, ...extra });
    if (incluirTeste && !("teste" in extra)) q.set("teste", "1");
    return `/admin/metricas?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Métricas do negócio")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Receita, clientes, aquisição, custo de IA e lucro estimado de todas as empresas da plataforma.")}
          </p>
        </div>
        <Link
          href={incluirTeste ? `/admin/metricas?aba=${aba}` : `/admin/metricas?aba=${aba}&teste=1`}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {incluirTeste ? t("Esconder empresas de teste") : t("Incluir empresas de teste")}
        </Link>
      </div>

      {incluirTeste ? (
        <Falha>
          {t("Mostrando também as empresas de teste e homologação. Os números de receita estão inflados por dados de teste.")}
        </Falha>
      ) : null}

      <nav aria-label={t("Abas das métricas")} className="flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={href(a.id)}
            aria-current={a.id === aba ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              a.id === aba
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      {aba === "receita" ? await AbaReceita(incluirTeste, t) : null}
      {aba === "aquisicao" ? await AbaAquisicao(incluirTeste, t) : null}
      {aba === "ia" ? await AbaIA(t) : null}
      {aba === "lucro" ? await AbaLucro(cambioUsado, incluirTeste, t) : null}
    </div>
  );
}

async function AbaReceita(incluirTeste: boolean, t: Traduz) {
  const [receita, crescimento] = await Promise.all([lerReceita(incluirTeste), lerCrescimento(90, incluirTeste)]);
  if (!receita.ok) return <Falha>{t("Não consegui ler a receita agora. Tente de novo em instantes.")}</Falha>;
  const r = receita.dados;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador titulo="MRR" valor={formatCentsBRL(r.mrr_cents)} nota="Receita recorrente mensal" />
        <Indicador titulo="ARR" valor={formatCentsBRL(r.arr_cents)} nota="MRR × 12" />
        <Indicador titulo="Empresas pagantes" valor={inteiro(r.pagantes)} nota={`${inteiro(r.atendentes_pagos)} atendentes pagos`} />
        <Indicador titulo="Ticket médio" valor={formatCentsBRL(r.ticket_medio_cents)} nota="MRR por empresa pagante" />
        <Indicador titulo="Novas (30 dias)" valor={inteiro(r.novas_30d)} />
        <Indicador titulo="Cancelamentos (30 dias)" valor={inteiro(r.cancelamentos_30d)} />
        <Indicador titulo="Churn (30 dias)" valor={`${r.churn_30d_pct.toLocaleString("pt-BR")}%`} nota="Cancelados ÷ (pagantes + cancelados)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Plano mais escolhido")}</CardTitle>
            <CardDescription>Empresas e receita por plano.</CardDescription>
          </CardHeader>
          <CardContent>
            {r.por_plano.length === 0 ? (
              <Vazio>{t("Nenhuma assinatura paga ainda.")}</Vazio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead className="text-right">Empresas</TableHead>
                    <TableHead className="text-right">Atendentes</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.por_plano.map((l) => (
                    <TableRow key={l.plano}>
                      <TableCell>{ROTULO_DO_PLANO[l.plano] ?? l.plano}</TableCell>
                      <TableCell className="text-right tabular-nums">{inteiro(l.empresas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inteiro(l.atendentes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCentsBRL(l.mrr_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Ciclo mais escolhido")}</CardTitle>
            <CardDescription>{t("Mensal, trimestral ou anual (receita já convertida para mês).")}</CardDescription>
          </CardHeader>
          <CardContent>
            {r.por_ciclo.length === 0 ? (
              <Vazio>{t("Nenhuma assinatura paga ainda.")}</Vazio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ciclo</TableHead>
                    <TableHead className="text-right">Empresas</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.por_ciclo.map((l) => (
                    <TableRow key={l.ciclo}>
                      <TableCell className="capitalize">{l.ciclo}</TableCell>
                      <TableCell className="text-right tabular-nums">{inteiro(l.empresas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCentsBRL(l.mrr_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Novos clientes e cancelamentos — últimos 90 dias")}</CardTitle>
        </CardHeader>
        <CardContent>
          {crescimento.ok ? (
            <GraficoDeCrescimento dados={crescimento.dados} />
          ) : (
            <Falha>{t("Não consegui ler o histórico agora.")}</Falha>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("Empresas de teste e a sua própria conta ficam de fora por padrão (marca")} <code>excluir_das_metricas</code> {t("em")}
        <code> organizations.settings</code>).
      </p>
    </div>
  );
}

async function AbaAquisicao(incluirTeste: boolean, t: Traduz) {
  const aq = await lerAquisicao(incluirTeste);
  if (!aq.ok) return <Falha>{t("Não consegui ler a aquisição agora.")}</Falha>;
  const total = aq.dados.reduce((s, l) => s + l.empresas, 0);
  const semOrigem = aq.dados.length > 0 && aq.dados.every((l) => l.origem === "nao_informada");

  return (
    <div className="space-y-4">
      {semOrigem ? (
        <Falha>
          {t("Nenhuma empresa tem origem registrada. O cadastro ainda não grava de onde a pessoa veio (Google, anúncio, WhatsApp, indicação). Enquanto isso, todas aparecem como \"Não informada\".")}
        </Falha>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("De onde vêm as empresas")}</CardTitle>
          <CardDescription>{t("Origem gravada no cadastro de cada empresa.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {aq.dados.length === 0 ? (
            <Vazio>{t("Nenhuma empresa cadastrada.")}</Vazio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Empresas</TableHead>
                  <TableHead className="text-right">Parcela</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aq.dados.map((l) => (
                  <TableRow key={l.origem}>
                    <TableCell>{ROTULO_DA_ORIGEM[l.origem] ?? l.origem}</TableCell>
                    <TableCell className="text-right tabular-nums">{inteiro(l.empresas)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {total === 0 ? "—" : `${Math.round((100 * l.empresas) / total)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function AbaIA(t: Traduz) {
  const ia = await lerIA(30);
  if (!ia.ok) return <Falha>{t("Não consegui ler o uso de IA agora.")}</Falha>;
  const d = ia.dados;

  // Nome da empresa em vez do UUID cru.
  const nomes = new Map<string, string>();
  const ids = d.por_empresa.map((e) => e.organization_id);
  if (ids.length > 0) {
    const { data } = await createAdminClient().from("organizations").select("id, slug, display_name").in("id", ids);
    for (const o of (data ?? []) as { id: string; slug: string; display_name: string | null }[]) {
      nomes.set(o.id, o.display_name || o.slug);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador titulo="Custo de IA (30 dias)" valor={formatCentsUSD(d.custo_cents)} nota="Em dólar, como a OpenAI cobra" />
        <Indicador titulo="Chamadas" valor={inteiro(d.chamadas)} />
        <Indicador
          titulo="Tokens"
          valor={inteiro(d.tokens_entrada + d.tokens_saida)}
          nota={`${inteiro(d.tokens_entrada)} entrada · ${inteiro(d.tokens_saida)} saída`}
        />
        <Indicador
          titulo="Erros"
          valor={inteiro(d.chamadas_com_erro)}
          nota={`Latência média ${inteiro(d.latencia_media_ms)} ms`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custo por modelo</CardTitle>
          </CardHeader>
          <CardContent>
            {d.por_modelo.length === 0 ? (
              <Vazio>{t("Sem chamadas no período.")}</Vazio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Chamadas</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.por_modelo.map((m) => (
                    <TableRow key={m.modelo}>
                      <TableCell className="font-mono text-xs">{m.modelo}</TableCell>
                      <TableCell className="text-right tabular-nums">{inteiro(m.chamadas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCentsUSD(m.custo_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custo por empresa (top 20)</CardTitle>
          </CardHeader>
          <CardContent>
            {d.por_empresa.length === 0 ? (
              <Vazio>{t("Sem chamadas no período.")}</Vazio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Chamadas</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.por_empresa.map((e) => (
                    <TableRow key={e.organization_id}>
                      <TableCell>{nomes.get(e.organization_id) ?? e.organization_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inteiro(e.chamadas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCentsUSD(e.custo_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("O custo de IA inclui as empresas de teste: é dinheiro real gasto, mesmo sem receita.")}
      </p>
    </div>
  );
}

async function AbaLucro(cambio: number, incluirTeste: boolean, t: Traduz) {
  const [lucro, custos] = await Promise.all([lerLucro(cambio), lerCustos()]);
  const l = lucro.ok ? lucro.dados : null;
  const negativo = l ? l.lucro_liquido_cents < 0 : false;

  return (
    <div className="space-y-6">
      {!lucro.ok ? <Falha>{t("Não consegui calcular o lucro agora.")}</Falha> : null}
      {l ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Indicador titulo="Receita (MRR)" valor={formatCentsBRL(l.mrr_cents)} />
          <Indicador
            titulo="IA (30 dias, em reais)"
            valor={formatCentsBRL(l.custo_ia_cents_brl)}
            nota={`Câmbio usado: R$ ${l.cambio_usd_brl.toLocaleString("pt-BR")} por US$ 1`}
          />
          <Indicador titulo="Custos fixos" valor={formatCentsBRL(l.custos_fixos_cents)} />
          <Indicador titulo="Taxas sobre a receita" valor={formatCentsBRL(l.taxas_percentuais_cents)} />
          <Card className={cn(negativo && "border-destructive/50")}>
            <CardContent className="space-y-1 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Lucro líquido estimado")}</p>
              <p className={cn("text-2xl font-semibold tabular-nums", negativo && "text-destructive")}>
                {formatCentsBRL(l.lucro_liquido_cents)}
              </p>
            </CardContent>
          </Card>
          <Indicador
            titulo="Margem"
            valor={l.margem_pct === null ? "—" : `${l.margem_pct.toLocaleString("pt-BR")}%`}
            nota={l.margem_pct === null ? "Sem receita ainda" : undefined}
          />
        </div>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="aba" value="lucro" />
        {incluirTeste ? <input type="hidden" name="teste" value="1" /> : null}
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("Câmbio (R$ por US$ 1)")}
          <Input name="cambio" defaultValue={String(cambio).replace(".", ",")} className="w-28" inputMode="decimal" />
        </label>
        <Button type="submit" variant="outline" size="sm">
          Recalcular
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custos da plataforma</CardTitle>
          <CardDescription>
            {t("Servidor, domínio, e-mail, ferramentas e taxas do gateway. Entram no lucro estimado. O custo de conversa da Meta não entra: quem paga é o cliente.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!custos.ok ? (
            <Falha>{t("Não consegui ler os custos agora.")}</Falha>
          ) : custos.dados.length === 0 ? (
            <Vazio>{t("Nenhum custo lançado ainda. Sem eles, o lucro mostrado considera só a IA.")}</Vazio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {custos.dados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell className="capitalize">{c.categoria}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.tipo === "fixo_mensal" ? "Fixo mensal" : "% da receita"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.tipo === "fixo_mensal"
                        ? formatCentsBRL(c.valor_cents)
                        : `${(c.basis_points / 100).toLocaleString("pt-BR")}%`}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={removerCustoDaPlataforma}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Remover
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <form action={salvarCustoDaPlataforma} className="flex flex-wrap items-end gap-2 border-t pt-4">
            <label className="space-y-1 text-xs text-muted-foreground">
              Nome
              <Input name="nome" required maxLength={80} placeholder="Ex.: VPS" className="w-44" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Categoria
              <select name="categoria" className="h-9 rounded-md border bg-background px-2 text-sm">
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Tipo
              <select name="tipo" className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="fixo_mensal">Fixo mensal (R$)</option>
                <option value="percentual_receita">% da receita</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Valor (R$ ou %)
              <Input name="valor" required inputMode="decimal" placeholder="Ex.: 89,90 ou 3,49" className="w-32" />
            </label>
            <Button type="submit" size="sm">
              Adicionar custo
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("Lucro estimado = MRR − IA dos últimos 30 dias (convertida pelo câmbio acima) − custos fixos − taxas sobre a receita. É uma estimativa gerencial, não contabilidade.")}
      </p>
    </div>
  );
}

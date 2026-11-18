"use client";

/**
 * Meta do mês e progresso no Desempenho (trazido do produto original, #3025).
 *
 * Sem ALVO não há percentual, e a comparação mês a mês ficava na cabeça de quem
 * cobra o time. O painel mostra o realizado contra o alvo com a mesma barra do
 * funil logo abaixo.
 *
 * O estado chega por prop (quem busca é o `MetricsClient`): o que precisa de
 * prova aqui é o DESFECHO de cada estado, e o mais importante é o VAZIO — "sem
 * meta" é ausência de cadastro, e mostrar `0 de 0` ali afirmaria que a empresa
 * não vendeu nada.
 *
 * Percentual acima de 100 é informação (vendeu mais que a meta), mas a barra
 * para em 100% e "quanto falta" some em vez de ficar negativo.
 *
 * No fork, o cadastro mora AQUI (gerente+), em vez de numa página de
 * Configurações à parte: quem olha o número é quem o ajusta, sem porta nova.
 */
import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { definirMetaMensal } from "@/app/actions/settings/definirMetaMensal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { mesLegivel } from "@/lib/metas/periodo";

export interface MetaDaEmpresa {
  id: string;
  escopo: "empresa" | "funil";
  pipeline_id: string | null;
  pipeline_nome: string | null;
  alvo: number;
  realizado: number;
  percentual: number;
  falta: number;
  atingida: boolean;
}

export type EstadoDaMeta = "carregando" | "erro" | "vazio" | "ok";

interface Props {
  estado: EstadoDaMeta;
  /** O 1º dia do mês da meta, como `YYYY-MM-01`. */
  periodo: string | null;
  metas: readonly MetaDaEmpresa[];
  /** manager+: mostra o formulário para definir a meta. */
  podeConfigurar: boolean;
  /** O mês corrente (`YYYY-MM`) em que o formulário grava. */
  mesAtual: string;
}

export function MetaDoMesPanel({ estado, periodo, metas, podeConfigurar, mesAtual }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const mes = mesLegivel(periodo ?? `${mesAtual}-01`);
  const metaDaEmpresa = metas.find((m) => m.escopo === "empresa") ?? null;

  const [editando, setEditando] = useState(false);
  const [alvoTexto, setAlvoTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, iniciar] = useTransition();

  function abrirFormulario() {
    setAlvoTexto(metaDaEmpresa ? String(metaDaEmpresa.alvo) : "");
    setErro(null);
    setEditando(true);
  }

  function salvar() {
    const alvo = Number(alvoTexto);
    if (!Number.isInteger(alvo) || alvo < 1) {
      setErro(t("Informe um número inteiro maior que zero."));
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await definirMetaMensal({ periodo: mesAtual, alvo });
      if (!r.ok) {
        setErro(
          r.error === "forbidden_role"
            ? t("Só gerentes e administradores definem a meta.")
            : r.error === "mfa_required"
              ? t("Confirme a verificação em duas etapas para continuar.")
              : t("Não consegui salvar a meta. Tente de novo."),
        );
        return;
      }
      setEditando(false);
      await queryClient.invalidateQueries({ queryKey: ["metrics", "metas"] });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("Meta do mês")}
          {mes ? ` · ${mes}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {estado === "carregando" ? (
          <div
            className="flex flex-col gap-2"
            aria-busy="true"
            aria-label={t("Carregando a meta do mês")}
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : null}

        {estado === "erro" ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "Não consegui carregar a meta do mês — isto é uma falha de leitura, não a ausência de meta.",
            )}
          </p>
        ) : null}

        {estado === "vazio" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {t("Nenhuma meta cadastrada para este mês.")}
            </p>
            {!podeConfigurar ? (
              <p className="text-sm text-muted-foreground">
                {t("Só gerentes e administradores definem a meta.")}
              </p>
            ) : null}
          </div>
        ) : null}

        {estado === "ok"
          ? metas.map((m) => (
              <div key={m.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm">
                    {m.escopo === "funil" ? (m.pipeline_nome ?? t("Funil")) : t("Empresa")}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <span data-meta="percentual">{m.percentual}%</span> {t("da meta")}
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    data-meta="barra"
                    className={`h-full rounded-full transition-[width] ${
                      m.atingida ? "bg-emerald-500" : "bg-primary"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, m.percentual))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>
                    <span className="tabular-nums" data-meta="realizado">
                      {m.realizado}
                    </span>{" "}
                    {t("de")}{" "}
                    <span className="tabular-nums" data-meta="alvo">
                      {m.alvo}
                    </span>{" "}
                    {t("Vendas ganhas")}
                  </span>
                  <span>
                    {m.atingida ? (
                      t("Meta atingida.")
                    ) : (
                      <>
                        {t("Faltam")}{" "}
                        <span className="tabular-nums" data-meta="falta">
                          {m.falta}
                        </span>{" "}
                        {t("para a meta")}
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))
          : null}

        {podeConfigurar && estado !== "carregando" && estado !== "erro" ? (
          editando ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              <label htmlFor="meta-do-mes-alvo" className="text-sm">
                {t("Quantas vendas ganhas a empresa quer neste mês?")}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="meta-do-mes-alvo"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  className="w-32"
                  value={alvoTexto}
                  onChange={(e) => setAlvoTexto(e.target.value)}
                  disabled={gravando}
                />
                <Button size="sm" onClick={salvar} disabled={gravando}>
                  {gravando ? t("Salvando…") : t("Salvar meta")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditando(false)}
                  disabled={gravando}
                >
                  {t("Cancelar")}
                </Button>
              </div>
              {erro ? (
                <p role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <Button size="sm" variant="outline" onClick={abrirFormulario}>
                {metaDaEmpresa ? t("Mudar a meta") : t("Definir a meta")}
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

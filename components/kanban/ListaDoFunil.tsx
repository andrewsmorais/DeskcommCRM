"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useLeadsPaginados } from "@/hooks/kanban/useLeadsPaginados";
import type { LeadFilters } from "@/lib/kanban/filters";
import {
  type FiltroForaDaLista,
  filtrosDaLista,
  filtrosForaDaLista,
  paramsDosFiltrosDaLista,
} from "@/lib/kanban/filtros-da-lista";
import type { Pipeline, Stage } from "@/lib/kanban/types";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { formatValorDoNegocio } from "@/lib/money";
import type { Lead } from "@/lib/types/leads";

import { LeadDossier } from "./LeadDossier";

interface Props {
  pipelineId: string;
  pipeline: Pipeline;
  stages: Stage[];
  filtros?: LeadFilters;
}

const SEM_FILTRO: LeadFilters = {};

/**
 * A aba LISTA do funil: uma linha por negócio, lida do banco por páginas.
 * Responsável e Status entram na consulta; os outros filtros da barra ainda só
 * valem no Quadro — e a tela AVISA, em vez de fingir que filtrou.
 */
export function ListaDoFunil({ pipelineId, pipeline: funil, stages, filtros = SEM_FILTRO }: Props) {
  const t = useT();
  const tag = useTagDeIdioma();
  const { data: members } = useAssignableMembers(true);
  const ownerNames = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, m.full_name])),
    [members],
  );

  const daLista = useMemo(() => filtrosDaLista(filtros), [filtros]);
  const chaveDoFiltro = paramsDosFiltrosDaLista(daLista);
  const fora = filtrosForaDaLista(filtros);

  const [pagina, setPagina] = useState(1);
  // Filtro novo volta para a página 1.
  const [filtroDaPagina, setFiltroDaPagina] = useState(chaveDoFiltro);
  if (chaveDoFiltro !== filtroDaPagina) {
    setFiltroDaPagina(chaveDoFiltro);
    setPagina(1);
  }
  const [dossieId, setDossieId] = useState<string | null>(null);
  const { data, isLoading, error } = useLeadsPaginados(pipelineId, pagina, daLista);

  const nomeDoFiltro = (f: FiltroForaDaLista): string =>
    ({
      busca: t("Busca"),
      etiqueta: t("Tag"),
      atrasados: t("Apenas atrasados"),
      motivo: t("Motivo"),
      categoria: t("Categoria"),
    })[f];

  const leads = data?.leads ?? [];
  const leadDoDossie = leads.find((l) => l.id === dossieId) ?? null;
  const campoDefs = useMemo(() => camposDoFunil(funil.settings ?? null), [funil.settings]);
  const diaCurto = useMemo(
    () => new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", year: "numeric" }),
    [tag],
  );
  const nomeDaEtapa = (stageId: string) => stages.find((s) => s.id === stageId)?.name ?? "—";
  const valorDe = (l: Lead): string =>
    l.value_cents === null || l.value_cents === undefined
      ? "—"
      : formatValorDoNegocio(l.value_cents, l.currency ?? "BRL", { semCentavos: true });

  return (
    <div className="flex flex-1 flex-col gap-3" data-testid="lista-do-funil">
      {fora.length > 0 && (
        <div
          role="status"
          data-testid="lista-filtros-fora"
          className="rounded-md border border-warning-fg/30 bg-warning-bg px-3 py-2 text-sm text-warning-fg"
        >
          {t("Na Lista, estes filtros ainda não valem: {filtros}. No Quadro eles funcionam.").replace(
            "{filtros}",
            fora.map(nomeDoFiltro).join(", "),
          )}
        </div>
      )}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
          {t("Não consegui carregar os negócios desta lista.")}
        </div>
      ) : isLoading && leads.length === 0 ? (
        <div className="flex flex-1 animate-pulse items-center justify-center text-muted-foreground">
          {t("Carregando…")}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {chaveDoFiltro ? t("Nenhum negócio com este filtro.") : t("Nenhum negócio nesta página.")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-medium">{t("Negócio")}</th>
                <th scope="col" className="p-3 font-medium">{t("Etapa")}</th>
                <th scope="col" className="p-3 text-right font-medium">{t("Valor")}</th>
                <th scope="col" className="p-3 font-medium">{t("Última atividade")}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr
                  key={l.id}
                  className="border-t transition-colors hover:bg-muted/40"
                  data-testid={`lista-negocio-${l.id}`}
                >
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => setDossieId(l.id)}
                      className="text-left font-medium underline-offset-2 hover:underline"
                    >
                      {l.title}
                    </button>
                  </td>
                  <td className="p-3 text-muted-foreground">{nomeDaEtapa(l.stage_id)}</td>
                  <td className="p-3 text-right tabular-nums">{valorDe(l)}</td>
                  <td className="p-3 text-muted-foreground">
                    {l.last_activity_at
                      ? diaCurto.format(new Date(l.last_activity_at))
                      : t("Sem atividade")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && (pagina > 1 || (data?.hasMore ?? false)) && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1 || isLoading}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            {t("Anterior")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("página {atual}").replace("{atual}", String(pagina))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!(data?.hasMore ?? false) || isLoading}
            onClick={() => setPagina((p) => p + 1)}
          >
            {t("Próxima")}
          </Button>
        </div>
      )}

      {leadDoDossie && (
        <LeadDossier
          open
          onOpenChange={(aberto) => {
            if (!aberto) setDossieId(null);
          }}
          lead={leadDoDossie}
          pipelineId={pipelineId}
          fieldDefs={campoDefs}
          stageName={nomeDaEtapa(leadDoDossie.stage_id)}
          ownerNames={ownerNames}
        />
      )}
    </div>
  );
}

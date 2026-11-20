"use client";
/**
 * A estatística do bloco selecionado — como na Umbler: quantas vezes ele foi
 * concluído no período e a porcentagem de cada saída. Exporta o fluxo inteiro
 * em CSV. Só contagens (migration 0512); nada de contato.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { EstatisticaDoBloco as Resumo } from "@/lib/chatbot/estatistica";
import { ehTipoDePasso, saidasDoPasso } from "@/lib/chatbot/passos";

export function EstatisticaDoBloco(props: { fluxoId: string; noId: string; tipo: string; dados: unknown }) {
  const t = useT();
  const [dias, setDias] = useState(30);
  const q = useQuery({
    queryKey: ["chatbot-estatistica", props.fluxoId, dias],
    queryFn: async () =>
      (
        await apiClient.get<{ data: { dias: number; blocos: Resumo[] } }>(
          `/api/v1/chatbot-flows/${props.fluxoId}/estatisticas?dias=${dias}`,
        )
      ).data,
    enabled: Boolean(props.fluxoId),
    staleTime: 60_000,
  });
  const bloco = q.data?.blocos.find((b) => b.node_id === props.noId);
  const rotulos = new Map(
    ehTipoDePasso(props.tipo) ? saidasDoPasso(props.tipo, props.dados).map((s) => [s.id, s.rotulo]) : [],
  );
  const nomeDaSaida = (s: string) =>
    s === "fim" ? t("Fim do fluxo") : rotulos.get(s) || (s === "proximo" ? t("Seguiu") : s);

  return (
    <details className="rounded-md border border-border px-3 py-2 text-sm" data-testid="estatistica-do-bloco">
      <summary className="cursor-pointer font-medium">
        {t("Estatística")}
        {bloco ? ` · ${bloco.total} ${t("conclusões")}` : ""}
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <select
            aria-label={t("Período")}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
          >
            <option value={7}>{t("Últimos 7 dias")}</option>
            <option value={30}>{t("Últimos 30 dias")}</option>
            <option value={90}>{t("Últimos 90 dias")}</option>
          </select>
          <a
            className="text-xs text-primary underline"
            href={`/api/v1/chatbot-flows/${props.fluxoId}/estatisticas?dias=${dias}&formato=csv`}
            download
          >
            {t("Baixar CSV do fluxo")}
          </a>
        </div>
        {q.isLoading ? (
          <p className="text-xs text-muted-foreground">{t("Carregando…")}</p>
        ) : !bloco ? (
          <p className="text-xs text-muted-foreground">{t("Ninguém passou por este bloco no período.")}</p>
        ) : (
          <ul className="space-y-1.5">
            {bloco.saidas.map((s) => (
              <li key={s.saida}>
                <div className="flex justify-between text-xs">
                  <span>{nomeDaSaida(s.saida)}</span>
                  <span className="text-muted-foreground">
                    {s.contagem} · {s.porcentagem}%
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${s.porcentagem}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {t("Conta cada vez que o bloco foi concluído e por qual saída seguiu. Conta a partir desta versão do sistema.")}
        </p>
      </div>
    </details>
  );
}

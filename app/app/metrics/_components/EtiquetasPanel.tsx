"use client";

/**
 * Quadro "POR ETIQUETA" — linha = etiqueta da conversa; colunas = conversas,
 * 1ª resposta (média e MEDIANA) e "Sem resposta".
 *
 * A conta mora na RPC `fn_tag_metrics` (migration 0558); esta tela só apresenta.
 * Uma conversa com duas etiquetas aparece nas duas linhas, por isso NÃO há total:
 * somar as linhas inflaria o número, e o quadro diz isso em vez de mostrar um
 * total que mente.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { useTagMetrics } from "@/hooks/metrics/useTagMetrics";
import { formatarDuracao } from "@/lib/metrics/etiquetas";

const CELULA_DE_NUMERO = "text-right tabular-nums max-md:p-0 max-md:text-left max-md:before:mr-1 max-md:before:text-muted-foreground max-md:before:content-[attr(data-rotulo)]";

interface Props {
  /** O filtro de atendente da página (`null` = todos); a RLS escopa quem olha. */
  owner: string | null;
}

export function EtiquetasPanel({ owner }: Props) {
  const t = useT();
  const { data, isLoading, isError } = useTagMetrics(owner);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("Por etiqueta")}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Por etiqueta")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{t("Erro ao carregar as etiquetas.")}</p>
        </CardContent>
      </Card>
    );
  }

  const etiquetas = data.data.tags;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("Por etiqueta")}
          {owner ? ` · ${t("do atendente")}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {etiquetas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Sem atividade no período.")}</p>
        ) : (
          <>
            <Table className="max-md:block">
              <TableHeader className="max-md:hidden">
                <TableRow>
                  <TableHead>{t("Etiqueta")}</TableHead>
                  <TableHead className="text-right">{t("Conversas")}</TableHead>
                  <TableHead className="text-right">{t("1ª resposta (média)")}</TableHead>
                  <TableHead className="text-right">{t("1ª resposta (mediana)")}</TableHead>
                  <TableHead className="text-right">{t("Sem resposta")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="max-md:block">
                {etiquetas.map((e) => (
                  <TableRow key={e.tag} className="max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:py-2">
                    <TableCell className="font-medium max-md:col-span-2 max-md:p-0">{e.tag}</TableCell>
                    <TableCell data-rotulo={t("Conversas")} className={CELULA_DE_NUMERO}>
                      {e.conversations_handled}
                    </TableCell>
                    <TableCell data-rotulo={t("1ª resposta (média)")} className={CELULA_DE_NUMERO}>
                      {formatarDuracao(e.avg_first_response_seconds)}
                    </TableCell>
                    <TableCell data-rotulo={t("1ª resposta (mediana)")} className={CELULA_DE_NUMERO}>
                      {formatarDuracao(e.median_first_response_seconds)}
                    </TableCell>
                    <TableCell data-rotulo={t("Sem resposta")} className={CELULA_DE_NUMERO}>
                      {e.sem_resposta}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Uma conversa com mais de uma etiqueta aparece em cada uma delas, por isso não há total.")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import { PLANOS_COMERCIAIS, RECURSOS_DO_PLANO, type RecursoDoPlano } from "@/lib/billing/catalogo";
import { enderecoDosPlanos } from "@/lib/billing/pagina-de-planos";

/**
 * Tela trancada pelo plano: diz o que é, qual plano libera e leva à página
 * de planos. Server Component — a decisão já veio de `verificarRecursoDoPlano`.
 */
export function RecursoForaDoPlano({
  recurso,
  orgId,
  idioma,
}: {
  recurso: RecursoDoPlano;
  orgId: string;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const oferta = RECURSOS_DO_PLANO[recurso];
  const plano = PLANOS_COMERCIAIS[oferta.desde].nome;
  return (
    <div
      className="flex h-full items-start justify-center p-6"
      data-testid={`fora-do-plano-${recurso}`}
    >
      <Card className="max-w-lg p-6">
        <div className="flex items-center gap-2 text-primary">
          <Lock className="h-5 w-5" />
          <span className="text-sm font-semibold">
            {t("Disponível a partir do plano")} {plano}
          </span>
        </div>
        <h1 className="mt-3 text-xl font-semibold">{t(oferta.nome)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Este recurso não faz parte do seu plano atual. Mude de plano para liberar.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <a href={enderecoDosPlanos(orgId)} target="_blank" rel="noopener noreferrer">
              {t("Ver planos")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/app/settings/billing">{t("Plano e cobrança")}</a>
          </Button>
        </div>
      </Card>
    </div>
  );
}

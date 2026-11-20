"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import { termoSemAcento } from "@/lib/inbox/termo-de-busca";
import {
  DICA_DA_FONTE,
  GRUPOS_DE_VARIAVEL,
  ROTULO_DO_GRUPO,
  entradasDe,
  type FonteDeVariavel,
} from "@/lib/variaveis/catalogo";

/**
 * O botão "Inserir variável" (ideia do produto original, #3687): busca e
 * grupos, e devolve o token para quem chama inserir na posição do cursor. A
 * lista sai do catálogo desta instalação (`entradasDe(fonte)`) — só o que o
 * renderizador daquela tela resolve.
 */
export function SeletorDeVariavel({
  fonte,
  onInserir,
}: {
  fonte: FonteDeVariavel;
  onInserir: (token: string) => void;
}) {
  const t = useT();
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const idDoSeletor = React.useId();

  const grupos = React.useMemo(() => {
    const termo = termoSemAcento(busca.trim());
    const todos = entradasDe(fonte).map((v) => ({ ...v, rotulo: t(v.descricao) }));
    const filtrados = termo
      ? todos.filter((v) => termoSemAcento(v.chave).includes(termo) || termoSemAcento(v.rotulo).includes(termo))
      : todos;
    return GRUPOS_DE_VARIAVEL.map((grupo) => ({ grupo, itens: filtrados.filter((v) => v.grupo === grupo) })).filter(
      (g) => g.itens.length > 0,
    );
  }, [fonte, busca, t]);

  const dica = DICA_DA_FONTE[fonte];

  const inserir = (chave: string) => {
    onInserir(`{{${chave}}}`);
    setAberto(false);
    setBusca("");
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" size="sm" data-testid="inserir-variavel">
          {t("Inserir variável")}
          <ChevronDown className="ml-1 h-3 w-3" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2" aria-label={t("Inserir variável")}>
        <div className="relative mb-2">
          <Search className="absolute top-2.5 left-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar variável")}
            aria-label={t("Buscar variável")}
            className="h-8 pl-7"
          />
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {grupos.map(({ grupo, itens }) => (
            <div key={grupo} role="group" aria-labelledby={`${idDoSeletor}-${grupo}`} className="space-y-0.5">
              <p id={`${idDoSeletor}-${grupo}`} className="px-2 pt-1 text-xs font-medium text-muted-foreground">
                {t(ROTULO_DO_GRUPO[grupo])}
              </p>
              {itens.map((item) => (
                <button
                  key={item.chave}
                  type="button"
                  onClick={() => inserir(item.chave)}
                  className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-surface-elevated"
                >
                  <span className="font-mono text-xs">{`{{${item.chave}}}`}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.rotulo}</span>
                </button>
              ))}
            </div>
          ))}
          {grupos.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">{t("Nenhuma variável encontrada")}</p>
          )}
          {dica ? <p className="border-t border-border px-2 pt-2 text-xs text-muted-foreground">{t(dica)}</p> : null}
          <p className="px-2 text-xs text-muted-foreground">
            {t("Para a linha sumir quando o campo estiver vazio, envolva-a: {{#campo}}rótulo {{campo}}{{/campo}}.")}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

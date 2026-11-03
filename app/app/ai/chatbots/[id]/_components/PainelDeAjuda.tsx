"use client";

/**
 * O painel do botão "Ajuda" (?) da mini-barra do passo, como na Umbler Talk:
 * nome do passo, aba "Ajuda", a explicação de quando usar e o que acontece, as
 * "Variáveis exportadas" (abre e fecha) e "Fechar". O texto mora em
 * `lib/chatbot/ajuda-dos-passos.ts`.
 */
import { useState } from "react";
import { ChevronRight, CircleHelp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import {
  AJUDA_DOS_PASSOS,
  DESCRICOES_DE_VARIAVEL,
  paragrafosDaAjuda,
  variaveisDoPasso,
} from "@/lib/chatbot/ajuda-dos-passos";
import { ehTipoDePasso, metaDoPasso } from "@/lib/chatbot/passos";

import { IconeDoPasso } from "./icones";
import type { NodeData } from "./node-types";

export function PainelDeAjuda({
  tipo,
  dados,
  onClose,
}: {
  tipo: string;
  dados: NodeData;
  onClose: () => void;
}) {
  const t = useT();
  const [variaveisAbertas, setVariaveisAbertas] = useState(false);
  const meta = metaDoPasso(tipo);
  if (!meta || !ehTipoDePasso(tipo)) return null;
  const paragrafos = paragrafosDaAjuda(t(AJUDA_DOS_PASSOS[tipo]));
  const variaveis = variaveisDoPasso(tipo, dados);

  return (
    <div className="flex h-full flex-col" data-testid="chatbot-painel-de-ajuda">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("Fechar")}
        >
          <X className="h-4 w-4" />
        </button>
        <IconeDoPasso nome={meta.icone} className={`h-4 w-4 ${meta.cor}`} />
        <h2 className="text-base font-semibold">{t(meta.nome)}</h2>
      </div>
      <div className="border-b border-border px-4">
        <span className="inline-flex items-center gap-1.5 border-b-2 border-primary pb-2 text-sm font-medium text-primary">
          <CircleHelp className="h-4 w-4" />
          {t("Ajuda")}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm leading-relaxed">
        {paragrafos.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {variaveis.length > 0 ? (
          <div className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => setVariaveisAbertas((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium"
              aria-expanded={variaveisAbertas}
            >
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${variaveisAbertas ? "rotate-90" : ""}`}
              />
              {t("Variáveis exportadas")}
            </button>
            {variaveisAbertas ? (
              <ul className="space-y-1.5 border-t border-border px-3 py-2 text-xs">
                {variaveis.map((v) => (
                  <li key={v.nome}>
                    <code className="rounded-md bg-muted px-1 py-0.5">{`{{${v.nome}}}`}</code>{" "}
                    <span className="text-muted-foreground">
                      {t(DESCRICOES_DE_VARIAVEL[v.descricao])}
                      {v.detalhe ? ` ${v.detalhe}` : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="border-t border-border p-4">
        <Button type="button" variant="outline" className="w-full" onClick={onClose}>
          {t("Fechar")}
        </Button>
      </div>
    </div>
  );
}

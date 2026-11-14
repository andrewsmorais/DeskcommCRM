"use client";
/**
 * Figurinhas salvas, como na Umbler Talk: a biblioteca da empresa num quadro
 * ao lado do emoji. Clicar manda na conversa; dá para trazer uma do computador
 * (PNG, JPG, WebP ou GIF vira figurinha) e apagar as que não servem mais.
 */
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import {
  useApagarFigurinha,
  useEnviarFigurinha,
  useFigurinhas,
  useSalvarFigurinha,
} from "@/hooks/inbox/useFigurinhas";
import { Sticker, UploadSimple, X } from "@/lib/ui/icons";

export function FigurinhasButton({ conversationId, disabled }: { conversationId: string; disabled?: boolean }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const { data: figurinhas, isLoading } = useFigurinhas(aberto);
  const enviar = useEnviarFigurinha(conversationId);
  const salvar = useSalvarFigurinha(t("Figurinha salva."), t("Essa figurinha já estava salva."));
  const apagar = useApagarFigurinha();
  const arquivo = useRef<HTMLInputElement>(null);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          aria-label={t("Figurinhas")}
          disabled={disabled}
        >
          <Sticker size={18} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-3" data-testid="figurinhas">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("Figurinhas")}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={salvar.isPending}
            onClick={() => arquivo.current?.click()}
          >
            <UploadSimple size={14} className="mr-1" aria-hidden />
            {t("Do computador")}
          </Button>
          <input
            ref={arquivo}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            aria-label={t("Escolher imagem para virar figurinha")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) salvar.mutate({ file: f });
              e.target.value = "";
            }}
          />
        </div>
        {isLoading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t("Carregando…")}</p>
        ) : !figurinhas?.length ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t("Nenhuma figurinha ainda. Traga uma do computador, ou abra o menu de uma figurinha recebida e escolha “Salvar figurinha”.")}
          </p>
        ) : (
          <ul className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto" aria-label={t("Figurinhas salvas")}>
            {figurinhas.map((f) => (
              <li key={f.id} className="group relative">
                <button
                  type="button"
                  className="flex aspect-square w-full items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"
                  disabled={enviar.isPending || !f.url}
                  aria-label={t("Enviar figurinha")}
                  onClick={() =>
                    enviar.mutate(f.id, {
                      onSuccess: () => setAberto(false),
                    })
                  }
                >
                  {f.url ? (
                    // Link assinado do Storage privado: o otimizador de imagem do Next não alcança.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt="" className="h-full w-full object-contain" />
                  ) : null}
                </button>
                <button
                  type="button"
                  className="absolute -top-1 -right-1 hidden rounded-full bg-background p-0.5 shadow group-hover:block focus-visible:block"
                  aria-label={t("Apagar figurinha")}
                  onClick={() => apagar.mutate(f.id)}
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

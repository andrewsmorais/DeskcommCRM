"use client";
/**
 * "Assinar" no campo de mensagem — a assinatura do atendente da Umbler Talk.
 *
 * Ligado, o nome de quem envia vai em negrito antes do texto (o servidor
 * assina; aqui só se pede). A empresa decide em Configurações › Conversas:
 *   - o atendente escolhe → este botão liga e desliga (lembrado no navegador);
 *   - sempre → o botão fica ligado e travado;
 *   - nunca → o botão some.
 * O lápis edita a assinatura do perfil (até 75 letras; vazio usa o nome).
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import { usePreferenciasDeConversa, useSalvarMinhaAssinatura } from "@/hooks/inbox/usePreferenciasDeConversa";
import { ASSINATURA_MAX } from "@/lib/conversas/preferencias";
import { PencilSimple, Signature } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  ligado: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function AssinarButton({ ligado, onChange, disabled }: Props) {
  const t = useT();
  const prefs = usePreferenciasDeConversa();
  const salvar = useSalvarMinhaAssinatura(t("Assinatura salva."));
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  const comportamento = prefs.data?.assinatura ?? "atendente_escolhe";
  if (comportamento === "nunca") return null;
  const sempre = comportamento === "sempre";
  const ativo = sempre || ligado;
  const nome = prefs.data?.meu.assinatura || prefs.data?.meu.nome || "";

  const rotulo = sempre
    ? t("A empresa assina todas as mensagens com o seu nome")
    : ativo
      ? t("Assinatura ligada: seu nome vai antes da mensagem")
      : t("Assinar mensagens");

  return (
    <div className="flex shrink-0 items-center">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("h-9 w-9", ativo && "bg-primary/10 text-primary hover:bg-primary/15")}
        aria-label={t("Assinar")}
        title={nome ? `${rotulo} — ${nome}` : rotulo}
        aria-pressed={ativo}
        disabled={disabled || sempre}
        onClick={() => onChange(!ligado)}
        data-testid="assinar-mensagens"
      >
        <Signature size={18} weight={ativo ? "fill" : "regular"} aria-hidden />
      </Button>
      <Popover
        open={editando}
        onOpenChange={(aberto) => {
          if (aberto) setTexto(prefs.data?.meu.assinatura ?? "");
          setEditando(aberto);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-6 text-muted-foreground"
            aria-label={t("Editar assinatura")}
            title={t("Editar assinatura")}
            disabled={disabled}
            data-testid="editar-assinatura"
          >
            <PencilSimple size={14} aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="space-y-2">
          <Label htmlFor="minha-assinatura" className="font-semibold">
            {t("Assinatura")}
          </Label>
          <Input
            id="minha-assinatura"
            value={texto}
            maxLength={ASSINATURA_MAX}
            placeholder={prefs.data?.meu.nome ?? ""}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("Vazio usa o nome do perfil.")}</span>
            <span>
              {texto.length}/{ASSINATURA_MAX}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
              {t("Cancelar")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate(texto.trim(), { onSuccess: () => setEditando(false) })}
            >
              {t("Salvar")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

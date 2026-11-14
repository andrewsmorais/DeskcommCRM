"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SeletorDeVariavel } from "@/components/variaveis/SeletorDeVariavel";
import { useT } from "@/hooks/i18n/useT";
import type { FonteDeVariavel } from "@/lib/variaveis/catalogo";
import { previaDoTexto } from "@/lib/variaveis/previa";

/**
 * O campo de mensagem com o botão "Inserir variável" e a prévia com um contato
 * de exemplo. A prévia passa pelo MESMO renderizador do envio daquela tela.
 */
export function CampoComVariaveis({
  id,
  rotulo,
  fonte,
  valor,
  onChange,
  placeholder,
  linhas = 4,
  obrigatorio,
  maxLength,
  minLength,
}: {
  id?: string;
  rotulo: string;
  fonte: FonteDeVariavel;
  valor: string;
  onChange: (texto: string) => void;
  placeholder?: string;
  linhas?: number;
  obrigatorio?: boolean;
  maxLength?: number;
  minLength?: number;
}) {
  const t = useT();
  const campoRef = React.useRef<HTMLTextAreaElement>(null);
  const idGerado = React.useId();
  const idDoCampo = id ?? idGerado;

  const inserir = (token: string) => {
    const el = campoRef.current;
    const inicio = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? valor.length;
    onChange(valor.slice(0, inicio) + token + valor.slice(fim));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + token.length, inicio + token.length);
    });
  };

  const previa = valor.includes("{{") ? previaDoTexto(valor, fonte) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={idDoCampo}>{rotulo}</Label>
        <SeletorDeVariavel fonte={fonte} onInserir={inserir} />
      </div>
      <Textarea
        id={idDoCampo}
        ref={campoRef}
        rows={linhas}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={obrigatorio}
        maxLength={maxLength}
        minLength={minLength}
      />
      {previa !== null ? (
        <div className="rounded-md bg-muted/40 p-2 text-xs" data-testid="previa-com-valores">
          <p className="font-medium text-muted-foreground">{t("Prévia com um contato de exemplo")}</p>
          <p className="whitespace-pre-wrap text-foreground">{previa}</p>
        </div>
      ) : null}
    </div>
  );
}

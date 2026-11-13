"use client";
/**
 * "Pedir para digitar" com VÁRIAS RESPOSTAS ACEITAS — como na Umbler Talk.
 *
 * Cada opção tem um nome, um formato pronto (CPF, e-mail…) ou uma regra própria
 * (expressão regular), e uma saída só sua no fluxo. A resposta do contato segue
 * pela primeira opção que bate, na ordem da lista. "Testar opções" mostra, sem
 * salvar nada, por onde uma resposta de exemplo seguiria.
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import {
  FORMATOS_DA_OPCAO,
  opcaoDeRespostaSchema,
  type FormatoDaOpcao,
  type OpcaoDeResposta,
} from "@/lib/chatbot/passos";
import { primeiraOpcaoQueBate } from "@/lib/chatbot/regras";
import { problemaDaRegex, REGEX_MAX } from "@/lib/chatbot/regex-segura";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const MAX_OPCOES = 10;

export function RespostasAceitas(props: {
  opcoes: OpcaoDeResposta[];
  onChange: (opcoes: OpcaoDeResposta[]) => void;
}) {
  const t = useT();
  const [exemplo, setExemplo] = useState("");
  const { opcoes, onChange } = props;
  const nomes: Record<FormatoDaOpcao, string> = {
    qualquer: t("Qualquer texto"),
    email: t("E-mail"),
    telefone: t("Telefone"),
    cpf: t("CPF"),
    cnpj: t("CNPJ"),
    numero: t("Número"),
    data: t("Data (dd/mm/aaaa)"),
    hora: t("Hora (hh:mm)"),
    regex: t("Regra própria (expressão regular)"),
  };
  const mudar = (i: number, parte: Partial<OpcaoDeResposta>) =>
    onChange(opcoes.map((o, j) => (j === i ? { ...o, ...parte } : o)));

  const ligado = opcoes.length > 0;
  const teste = exemplo.trim() ? primeiraOpcaoQueBate(opcoes, exemplo) : null;

  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid="respostas-aceitas">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={ligado}
          data-testid="varias-respostas"
          onChange={(e) =>
            onChange(
              e.target.checked
                ? [
                    opcaoDeRespostaSchema.parse({ nome: t("CPF"), formato: "cpf" }),
                    opcaoDeRespostaSchema.parse({ nome: t("E-mail"), formato: "email" }),
                  ]
                : [],
            )
          }
        />
        <span>
          {t("Aceitar várias respostas")}
          <span className="block text-xs text-muted-foreground">
            {t("Cada opção tem a sua saída no fluxo. A resposta segue pela primeira opção que bate, na ordem da lista.")}
          </span>
        </span>
      </label>

      {ligado ? (
        <>
          <ol className="space-y-3">
            {opcoes.map((o, i) => {
              const problema = o.formato === "regex" ? problemaDaRegex(o.regex) : null;
              return (
                <li key={i} className="space-y-1.5 rounded-md bg-muted/40 p-2" data-testid={`opcao-${i}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{i + 1}.</span>
                    <Input
                      aria-label={t("Nome da opção")}
                      value={o.nome}
                      maxLength={60}
                      onChange={(e) => mudar(i, { nome: e.target.value })}
                      onBlur={(e) => !e.target.value.trim() && mudar(i, { nome: t("Opção") })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("Remover opção")}
                      onClick={() => onChange(opcoes.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <select
                    aria-label={t("Formato da opção")}
                    className={SELECT}
                    value={o.formato}
                    onChange={(e) => mudar(i, { formato: e.target.value as FormatoDaOpcao })}
                  >
                    {FORMATOS_DA_OPCAO.map((f) => (
                      <option key={f} value={f}>
                        {nomes[f]}
                      </option>
                    ))}
                  </select>
                  {o.formato === "regex" ? (
                    <>
                      <Input
                        aria-label={t("Regra")}
                        className="font-mono"
                        value={o.regex}
                        maxLength={REGEX_MAX}
                        placeholder="^[A-Z]{3}-\d{4}$"
                        onChange={(e) => mudar(i, { regex: e.target.value })}
                      />
                      {problema ? (
                        <p className="text-xs text-destructive" role="alert">
                          {t(problema)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {t("Maiúsculas e minúsculas são iguais. Use ^ e $ para exigir a resposta inteira.")}
                        </p>
                      )}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {opcoes.length < MAX_OPCOES ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange([...opcoes, opcaoDeRespostaSchema.parse({ nome: `${t("Opção")} ${opcoes.length + 1}` })])}
            >
              <Plus className="size-4" /> {t("Adicionar opção")}
            </Button>
          ) : null}
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="testar-opcoes">{t("Testar opções")}</Label>
            <Input
              id="testar-opcoes"
              value={exemplo}
              placeholder={t("Escreva uma resposta de exemplo")}
              onChange={(e) => setExemplo(e.target.value)}
            />
            {exemplo.trim() ? (
              <p className="text-xs" data-testid="resultado-do-teste">
                {teste
                  ? `${t("Seguiria por")}: ${opcoes[teste.indice]?.nome ?? ""}`
                  : t("Nenhuma opção bate: o chatbot pede de novo.")}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

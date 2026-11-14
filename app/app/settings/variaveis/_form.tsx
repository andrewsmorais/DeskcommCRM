"use client";
/**
 * O formulário de Variáveis da empresa: uma linha por variável (nome, valor,
 * para que serve), com o `{{empresa.nome}}` pronto para copiar.
 */
import { Copy, Plus, Trash } from "@/lib/ui/icons";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  MAX_VALOR,
  MAX_VARIAVEIS,
  PREFIXO_DA_EMPRESA,
  type VariavelDaEmpresa,
} from "@/lib/empresa/variaveis";

type Linha = { id: number; chave: string; valor: string; descricao: string };

/** O que a pessoa digitou no nome vira um nome válido: "Pix da Loja" → "pix_da_loja". */
export function chaveSugerida(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1")
    .slice(0, 40);
}

const CAMPO =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden";

export function VariaveisForm({ initial }: { initial: VariavelDaEmpresa[] }) {
  const t = useT();
  const [proximo, setProximo] = useState(initial.length + 1);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    initial.map((v, i) => ({ id: i + 1, chave: v.chave, valor: v.valor, descricao: v.descricao ?? "" })),
  );
  const [salvando, startTransition] = useTransition();

  const repetidas = new Set(
    linhas.map((l) => l.chave).filter((c, i, todas) => c && todas.indexOf(c) !== i),
  );

  function mudar(id: number, campo: keyof Omit<Linha, "id">, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  function adicionar() {
    setLinhas((ls) => [...ls, { id: proximo, chave: "", valor: "", descricao: "" }]);
    setProximo((n) => n + 1);
  }

  function copiar(chave: string) {
    void navigator.clipboard
      ?.writeText(`{{${PREFIXO_DA_EMPRESA}${chave}}}`)
      .then(() => toast.success(t("Copiado.")))
      .catch(() => undefined);
  }

  function salvar() {
    const prontas = linhas.filter((l) => l.chave || l.valor);
    if (prontas.some((l) => !l.chave)) {
      toast.error(t("Dê um nome a todas as variáveis antes de salvar."));
      return;
    }
    if (repetidas.size > 0) {
      toast.error(t("Duas variáveis estão com o mesmo nome."));
      return;
    }
    startTransition(async () => {
      try {
        await apiClient.patch("/api/v1/settings/variaveis", {
          variaveis: prontas.map((l) => ({
            chave: l.chave,
            valor: l.valor,
            descricao: l.descricao.trim() || null,
          })),
        });
        setLinhas(prontas);
        toast.success(t("Variáveis salvas."));
      } catch (err) {
        showApiError(err);
      }
    });
  }

  return (
    <Card className="max-w-3xl space-y-4 p-5">
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Nenhuma variável ainda. Exemplo: nome endereco, valor “Rua das Flores, 120 — Centro”.")}
        </p>
      ) : (
        <ul className="space-y-3" aria-label={t("Variáveis da empresa")}>
          {linhas.map((l) => (
            <li key={l.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={t("Nome da variável")}
                  placeholder={t("nome_da_variavel")}
                  value={l.chave}
                  maxLength={40}
                  onChange={(e) => mudar(l.id, "chave", chaveSugerida(e.target.value))}
                  className="w-56 font-mono"
                />
                {l.chave ? (
                  <button
                    type="button"
                    onClick={() => copiar(l.chave)}
                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    title={t("Copiar para usar na mensagem")}
                  >
                    {`{{${PREFIXO_DA_EMPRESA}${l.chave}}}`}
                    <Copy className="h-3 w-3" />
                  </button>
                ) : null}
                {repetidas.has(l.chave) ? (
                  <span className="text-xs text-destructive">{t("Nome repetido")}</span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  aria-label={t("Remover variável")}
                  onClick={() => setLinhas((ls) => ls.filter((x) => x.id !== l.id))}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
              <textarea
                aria-label={t("Valor")}
                placeholder={t("Valor que vai na mensagem")}
                value={l.valor}
                maxLength={MAX_VALOR}
                rows={2}
                onChange={(e) => mudar(l.id, "valor", e.target.value)}
                className={CAMPO}
              />
              <Input
                aria-label={t("Para que serve (opcional)")}
                placeholder={t("Para que serve (opcional)")}
                value={l.descricao}
                maxLength={120}
                onChange={(e) => mudar(l.id, "descricao", e.target.value)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={adicionar} disabled={linhas.length >= MAX_VARIAVEIS}>
          <Plus className="mr-1 h-4 w-4" />
          {t("Adicionar variável")}
        </Button>
        <Button type="button" onClick={salvar} disabled={salvando}>
          {salvando ? t("Salvando…") : t("Salvar")}
        </Button>
      </div>
    </Card>
  );
}

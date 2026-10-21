"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { useMcpToolCatalog } from "@/hooks/ai/useMcpToolCatalog";
import {
  criarModeloDeObjetivo,
  OBJETIVOS_DO_AGENTE,
  type ModeloInicialDoAgente,
  type ObjetivoDoAgente as Objetivo,
} from "@/lib/ai/agents/modelos-de-objetivo";

export function ObjetivoDoAgente({
  nomeDaOrganizacao,
  temAlteracoes,
  disabled,
  onApply,
}: {
  nomeDaOrganizacao: string;
  temAlteracoes: boolean;
  disabled: boolean;
  onApply: (modelo: ModeloInicialDoAgente) => void;
}) {
  const t = useT();
  const catalogo = useMcpToolCatalog();
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [aviso, setAviso] = useState("");

  function aplicar() {
    if (!objetivo || !catalogo.data) return;
    const resultado = criarModeloDeObjetivo({ objetivo, nomeDaOrganizacao, catalogo: catalogo.data.tools, t });
    if (!resultado.ok) {
      setAviso(t("Este modelo tem mais capacidades do que cabem em um agente. Escolha as capacidades no editor abaixo."));
      return;
    }
    onApply(resultado.modelo);
    setAviso(t("Modelo aplicado ao rascunho. Revise as instruções, escolha os materiais e ajuste as capacidades antes de salvar."));
  }

  return (
    <Card className="space-y-3 p-4">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-medium">{t("Qual é o objetivo deste agente?")}</legend>
        <p className="text-xs text-muted-foreground">{t("Escolha um ponto de partida e personalize tudo no editor abaixo.")}</p>
        <div className="flex flex-wrap gap-4">
          {OBJETIVOS_DO_AGENTE.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name="objetivo-do-agente" value={item.id} checked={objetivo === item.id} onChange={() => { setObjetivo(item.id); setAviso(""); }} />
              {t(item.rotulo)}
            </label>
          ))}
        </div>
        {temAlteracoes && <p className="text-xs text-muted-foreground">{t("Seu rascunho tem alterações. Aplicar substitui o nome, a descrição, as instruções, as capacidades e a abertura de pendências para a equipe.")}</p>}
        {objetivo === "suporte" && <p className="text-xs text-muted-foreground">{t("Suporte permite abrir pendências internas para a equipe resolver o que o agente não consegue concluir.")}</p>}
        {objetivo === "agendamento" && <p className="text-xs text-muted-foreground">{t("Para desmarcar compromissos, autorize essa capacidade individualmente no editor.")}</p>}
        {catalogo.isError && <p role="alert" className="text-xs text-destructive">{t("Não foi possível carregar as capacidades. Tente novamente ou continue pelo editor.")} <button type="button" className="underline" onClick={() => void catalogo.refetch()}>{t("Tentar novamente")}</button></p>}
        <Button type="button" variant="outline" disabled={!objetivo || !catalogo.data || catalogo.isError || disabled} onClick={aplicar}>
          {temAlteracoes ? t("Substituir pelas sugestões do objetivo") : t("Aplicar modelo inicial")}
        </Button>
        {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
      </fieldset>
    </Card>
  );
}

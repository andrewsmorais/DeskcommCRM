"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { usePipelines, usePipelineStages } from "@/hooks/webhooks/useWebhookSources";
import { crmUpdateConfigSchema } from "@/lib/followup/graph-schema";

import type { ConfigOf } from "./shared";

const SEM_ETAPA = "__nenhuma__";

function emLista(texto: string): string[] {
  return texto
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * O nó `crm_update` ("Atualizar o card"): move o negócio do contato para uma
 * etapa e/ou põe e tira etiquetas. Nenhuma mensagem sai para o cliente.
 * Como nos outros formulários, o candidato só vira nó vivo quando passa no
 * schema; senão, erro inline e o canvas guarda a última configuração válida.
 */
export function CrmUpdateForm({
  config,
  onChange,
}: {
  config: ConfigOf<"crm_update">;
  onChange: (c: ConfigOf<"crm_update">) => void;
}) {
  const t = useT();
  const { data: pipelines } = usePipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(config.pipeline_id ?? null);
  const { data: board } = usePipelineStages(pipelineId);
  const [erro, setErro] = useState<string | null>(null);
  // O que a pessoa digita fica no campo; só a lista pronta vai para o nó.
  const [pôr, setPôr] = useState(config.adicionar_etiquetas.join(", "));
  const [tirar, setTirar] = useState(config.remover_etiquetas.join(", "));

  const gravar = (candidato: ConfigOf<"crm_update">) => {
    const parsed = crmUpdateConfigSchema.safeParse(candidato);
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(parsed.data);
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="crm-update-form">
      <p className="text-xs text-text-muted sm:col-span-2">
        {t("Este passo muda o card do contato — nenhuma mensagem sai para o cliente.")}
      </p>
      <div className="space-y-1">
        <Label htmlFor="crm-update-funil">{t("Funil")}</Label>
        <Select
          value={pipelineId ?? ""}
          onValueChange={(v) => {
            setPipelineId(v);
            gravar({ ...config, pipeline_id: v, etapa_id: undefined });
          }}
        >
          <SelectTrigger id="crm-update-funil">
            <SelectValue placeholder={t("Funil")} />
          </SelectTrigger>
          <SelectContent>
            {(pipelines?.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="crm-update-etapa">{t("Mover para a etapa")}</Label>
        <Select
          value={config.etapa_id ?? SEM_ETAPA}
          onValueChange={(v) => gravar({ ...config, etapa_id: v === SEM_ETAPA ? undefined : v })}
        >
          <SelectTrigger id="crm-update-etapa">
            <SelectValue placeholder={t("Etapa")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_ETAPA}>{t("Não mover")}</SelectItem>
            {(board?.data.stages ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="crm-update-por">{t("Pôr etiquetas (separe com vírgula)")}</Label>
        <Input
          id="crm-update-por"
          value={pôr}
          onChange={(e) => {
            setPôr(e.target.value);
            gravar({ ...config, adicionar_etiquetas: emLista(e.target.value) });
          }}
          placeholder={t("ex: quente, retorno")}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="crm-update-tirar">{t("Tirar etiquetas (separe com vírgula)")}</Label>
        <Input
          id="crm-update-tirar"
          value={tirar}
          onChange={(e) => {
            setTirar(e.target.value);
            gravar({ ...config, remover_etiquetas: emLista(e.target.value) });
          }}
          placeholder={t("ex: frio")}
        />
      </div>
      {erro && (
        <p className="text-xs text-error-fg sm:col-span-2" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

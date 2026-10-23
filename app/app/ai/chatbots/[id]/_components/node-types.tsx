"use client";

/**
 * Um nó só para todos os passos: o visual sai do catálogo
 * (`lib/chatbot/passos.ts`) — ícone, cor, nome, entradas e saídas. Passo novo
 * no catálogo aparece no quadro sem mexer aqui.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useT } from "@/hooks/i18n/useT";
import { lerConfig, metaDoPasso, saidasDoPasso, ehTipoDePasso } from "@/lib/chatbot/passos";
import { descreverRegra } from "@/lib/chatbot/regras";
import { IconeDoPasso } from "./icones";

export type NodeData = Record<string, unknown>;

/** O que o nó mostra embaixo do título: um resumo da configuração. */
function resumo(tipo: string, dados: unknown, t: (s: string) => string): string {
  if (!ehTipoDePasso(tipo)) return "";
  switch (tipo) {
    case "inicio_canal": {
      const c = lerConfig("inicio_canal", dados);
      return c.gatilho === "palavra_chave"
        ? `${t("Quando a mensagem contém")}: ${c.palavras.join(", ") || "…"}`
        : t("Toda conversa nova");
    }
    case "enviar_mensagem":
      return lerConfig("enviar_mensagem", dados).texto;
    case "pedir_escolher":
      return lerConfig("pedir_escolher", dados).pergunta;
    case "pedir_digitar": {
      const c = lerConfig("pedir_digitar", dados);
      return c.pergunta ? `${c.pergunta} → {{${c.variavel}}}` : "";
    }
    case "mensagem_contem":
      return lerConfig("mensagem_contem", dados).palavras.join(", ");
    case "horarios":
      return lerConfig("horarios", dados)
        .faixas.map((f) => `${f.inicio}–${f.fim}`)
        .join(", ");
    case "dias_semana": {
      const nomes = [t("Dom"), t("Seg"), t("Ter"), t("Qua"), t("Qui"), t("Sex"), t("Sáb")];
      return lerConfig("dias_semana", dados)
        .dias.slice()
        .sort()
        .map((d) => nomes[d])
        .join(", ");
    }
    case "editar_etiquetas": {
      const c = lerConfig("editar_etiquetas", dados);
      return [...c.adicionar.map((e) => `+${e}`), ...c.remover.map((e) => `−${e}`)].join(" ");
    }
    case "transferir_equipe":
    case "transferir_atendente":
    case "finalizar_conversa":
      return (dados as { mensagem?: string })?.mensagem ?? "";
    case "bloco_de_notas":
      return lerConfig("bloco_de_notas", dados).texto;
    case "criar_nota":
      return lerConfig("criar_nota", dados).texto;
    case "campo_contato": {
      const c = lerConfig("campo_contato", dados);
      const nomes: Record<string, string> = {
        nome: t("Nome"),
        email: t("E-mail"),
        aniversario: t("Aniversário"),
      };
      const campo = c.campo === "personalizado" ? c.chave || "…" : nomes[c.campo];
      return c.valor ? `${campo} ← ${c.valor}` : "";
    }
    case "definir_condicao":
      return descreverRegra(lerConfig("definir_condicao", dados).regra);
    case "pedir_avaliacao": {
      const c = lerConfig("pedir_avaliacao", dados);
      return `${c.pergunta} (${c.escala === "1_5" ? "1–5" : "0–10"}) → {{avaliacao}}`;
    }
    case "pedir_feedback":
      return `${lerConfig("pedir_feedback", dados).pergunta} → {{feedback}}`;
    case "notificar_atendente":
      return lerConfig("notificar_atendente", dados).mensagem;
    case "aguardar_intervalo": {
      const c = lerConfig("aguardar_intervalo", dados);
      const unidades: Record<string, string> = {
        segundos: t("segundos"),
        minutos: t("minutos"),
        horas: t("horas"),
        dias: t("dias"),
      };
      return `${t("Esperar")} ${c.quantidade} ${unidades[c.unidade]}`;
    }
    case "aguardar_ate": {
      const c = lerConfig("aguardar_ate", dados);
      const todos = c.dias.length === 7;
      const nomes = [t("Dom"), t("Seg"), t("Ter"), t("Qua"), t("Qui"), t("Sex"), t("Sáb")];
      return `${t("Até")} ${c.hora}${todos ? "" : ` (${c.dias.slice().sort().map((d) => nomes[d]).join(", ")})`}`;
    }
    case "webhook": {
      const c = lerConfig("webhook", dados);
      return c.url ? `${c.metodo} ${c.url}` : "";
    }
    case "multi_condicional": {
      const n = lerConfig("multi_condicional", dados).regras.length;
      return n === 1 ? t("1 regra") : `${n} ${t("regras")}`;
    }
  }
}

export const PassoNode = memo(function PassoNode({ type, data, selected }: NodeProps) {
  const t = useT();
  const meta = metaDoPasso(type);
  if (!meta) {
    return (
      <div className="rounded-xl border border-destructive bg-surface px-3 py-2 text-xs text-destructive">
        {t("Passo desconhecido — apague-o.")}
        <Handle type="target" position={Position.Top} />
      </div>
    );
  }
  const saidas = saidasDoPasso(meta.tipo, data);
  const texto = resumo(meta.tipo, data, t);
  const nota = meta.tipo === "bloco_de_notas";

  return (
    <div
      className={`max-w-[280px] min-w-[220px] rounded-xl border shadow-sm ${
        nota ? "border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/30" : "bg-surface"
      } ${selected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border"}`}
      data-testid={`passo-${meta.tipo}`}
    >
      {meta.temEntrada ? (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-surface !bg-primary"
        />
      ) : null}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <IconeDoPasso nome={meta.icone} className={`h-4 w-4 shrink-0 ${meta.cor}`} />
        <span className="truncate text-xs font-semibold">{t(meta.nome)}</span>
      </div>
      <div className="px-3 py-2">
        <p className="line-clamp-4 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
          {texto || <span className="italic opacity-60">{t("Clique para configurar")}</span>}
        </p>
      </div>
      {saidas.length > 0 ? (
        <div className={saidas.length > 1 ? "border-t border-border px-2 pt-1.5 pb-3" : ""}>
          {saidas.length > 1 ? (
            <div className="flex flex-col gap-1">
              {saidas.map((s) => (
                <div
                  key={s.id}
                  className="relative flex items-center justify-end pr-3 text-[10px] text-muted-foreground"
                >
                  <span className="truncate">{t(s.rotulo)}</span>
                  <Handle
                    id={s.id}
                    type="source"
                    position={Position.Right}
                    className="!h-2.5 !w-2.5 !border-2 !border-surface !bg-primary"
                    style={{ top: "50%", right: -14 }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Handle
              id={saidas[0]?.id ?? "proximo"}
              type="source"
              position={Position.Bottom}
              className="!h-3 !w-3 !border-2 !border-surface !bg-primary"
            />
          )}
        </div>
      ) : null}
    </div>
  );
});

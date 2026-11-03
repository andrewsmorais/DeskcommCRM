"use client";

/**
 * Um nó só para todos os passos: o visual sai do catálogo
 * (`lib/chatbot/passos.ts`) — ícone, cor, nome, entradas e saídas. Passo novo
 * no catálogo aparece no quadro sem mexer aqui.
 */
import { memo } from "react";
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { CircleHelp, Copy, Hash, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyToClipboard } from "@/lib/clipboard";

import { useT } from "@/hooks/i18n/useT";
import {
  ehTipoDePasso,
  lerConfig,
  metaDoPasso,
  saidasDoPasso,
  type ModoDeAtendente,
} from "@/lib/chatbot/passos";
import { descreverRegra, descreverValor } from "@/lib/chatbot/regras";
import { useAcoesDoNo } from "./acoes-do-no";
import { IconeDoPasso } from "./icones";

export type NodeData = Record<string, unknown>;

/** O que o nó mostra embaixo do título: um resumo da configuração. */
/** Como o card do "Transferir p/ atendente" diz quem recebe (o específico não diz). */
const RESUMO_DO_MODO_DE_ATENDENTE: Record<Exclude<ModoDeAtendente, "especifico">, string> = {
  rodizio: "Rodízio",
  menos_conversas: "Menos conversas abertas",
  anterior: "Quem atendeu antes",
};

function resumo(tipo: string, dados: unknown, t: (s: string) => string): string {
  if (!ehTipoDePasso(tipo)) return "";
  switch (tipo) {
    case "inicio_automacao":
      return t("Quando uma automação mandar");
    case "inicio_manual":
      return t("Quando um atendente acionar na conversa");
    case "distribuir_fluxo":
      return "";
    case "contato_ativo":
      return `${t("Mensagem do contato nas últimas")} ${lerConfig("contato_ativo", dados).horas}h`;
    case "tem_etiqueta": {
      const c = lerConfig("tem_etiqueta", dados);
      if (c.etiquetas.length === 0) return "";
      return `${c.modo === "todas" ? t("Todas") : t("Alguma")}: ${c.etiquetas.join(", ")}`;
    }
    case "canal_da_conversa": {
      const n = lerConfig("canal_da_conversa", dados).canais.length;
      return n === 0 ? "" : n === 1 ? t("1 número") : `${n} ${t("números")}`;
    }
    case "setor_da_conversa": {
      const n = lerConfig("setor_da_conversa", dados).setores.length;
      return n === 0 ? "" : n === 1 ? t("1 setor") : `${n} ${t("setores")}`;
    }
    case "atendente_da_conversa": {
      const n = lerConfig("atendente_da_conversa", dados).atendentes.length;
      return n === 0 ? t("Qualquer atendente") : n === 1 ? t("1 atendente") : `${n} ${t("atendentes")}`;
    }
    case "primeira_conversa":
    case "presenca_do_atendente":
    case "bot_paralelo":
    case "status_da_conversa":
      return "";
    case "bloquear_contato":
      return lerConfig("bloquear_contato", dados).mensagem;
    case "excluir_contato":
      return t("Abre o pedido LGPD para um admin aprovar");
    case "inicio_canal": {
      const c = lerConfig("inicio_canal", dados);
      const quando =
        c.gatilho === "palavra_chave"
          ? `${t("Quando a mensagem contém")}: ${c.palavras.join(", ") || "…"}`
          : t("Toda conversa nova");
      const origens = c.origens.map((o) => o.etiqueta).join(", ");
      return origens ? `${quando}\n🏷 ${origens}` : quando;
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
    case "transferir_atendente": {
      const c = lerConfig(tipo, dados);
      const modo = tipo === "transferir_atendente" ? lerConfig(tipo, dados).modo : "especifico";
      const setor =
        tipo === "transferir_equipe"
          ? lerConfig("transferir_equipe", dados).nome_do_setor
          : modo === "especifico"
            ? ""
            : t(RESUMO_DO_MODO_DE_ATENDENTE[modo]);
      const espera =
        c.espera_minutos > 0 && c.espera_mensagem
          ? `⏳ ${t("Espera")}: ${c.espera_minutos} min${c.espera_vezes > 1 ? ` × ${c.espera_vezes}` : ""}`
          : "";
      return [setor ? `→ ${setor}` : "", c.mensagem, espera].filter(Boolean).join("\n");
    }
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
    case "iniciar_followup":
      return "";
    case "webhook": {
      const c = lerConfig("webhook", dados);
      return c.url ? `${c.metodo} ${c.url}` : "";
    }
    case "multi_condicional": {
      const n = lerConfig("multi_condicional", dados).regras.length;
      return n === 1 ? t("1 regra") : `${n} ${t("regras")}`;
    }
    case "enviar_midia": {
      const c = lerConfig("enviar_midia", dados);
      if (!c.storage_path) return "";
      return [`📎 ${c.nome_arquivo || t("Arquivo")}`, c.legenda].filter(Boolean).join("\n");
    }
    case "agendar_horario": {
      const c = lerConfig("agendar_horario", dados);
      return c.event_type_id
        ? `${t("Oferece")} ${c.quantidade} ${t("horários dos próximos")} ${c.dias_a_frente} ${t("dias")}`
        : "";
    }
    case "negocio_funil": {
      const c = lerConfig("negocio_funil", dados);
      return c.stage_id ? c.nome_do_destino : "";
    }
    case "acionar_fluxo": {
      const c = lerConfig("acionar_fluxo", dados);
      return c.flow_id ? `→ ${c.nome_do_fluxo}` : "";
    }
    case "valor":
      return descreverValor(lerConfig("valor", dados));
    case "transferir_ia":
      return lerConfig("transferir_ia", dados).mensagem;
    case "enviar_template": {
      const c = lerConfig("enviar_template", dados);
      return c.template_id ? `📄 ${c.nome_do_modelo}` : "";
    }
    case "enviar_pagamento": {
      const c = lerConfig("enviar_pagamento", dados);
      return [
        [c.descricao, c.valor].filter(Boolean).join(" — "),
        c.link ? `🔗 ${c.link}` : "",
        c.pix ? t("Pix") : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "enviar_formulario": {
      const n = lerConfig("enviar_formulario", dados).perguntas.length;
      return n === 1 ? t("1 pergunta") : `${n} ${t("perguntas")}`;
    }
    case "privar_liberar":
      return lerConfig("privar_liberar", dados).acao === "privar"
        ? t("Torna a conversa privada")
        : t("Libera a conversa");
    case "fluxo_de_espera":
      return lerConfig("fluxo_de_espera", dados).acao === "ligar"
        ? t("Liga as mensagens de espera")
        : t("Desliga as mensagens de espera");
  }
}

/** A mini-barra em cima do passo selecionado, como na Umbler: ajuda, ID, duplicar, apagar. */
function BarraDoPasso({ id, inicio }: { id: string; inicio: boolean }) {
  const t = useT();
  const acoes = useAcoesDoNo();
  const botao =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground";
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-md"
      data-testid="chatbot-barra-do-passo"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={botao}
            aria-label={t("Ajuda")}
            onClick={() => acoes?.ajuda(id)}
            data-testid="chatbot-ajuda-do-passo"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{t("Ajuda")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={botao}
            aria-label={t("Copiar Id")}
            onClick={async () => {
              if (await copyToClipboard(id)) toast.success(t("Id do passo copiado."));
            }}
          >
            <Hash className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{t("Copiar Id")}</TooltipContent>
      </Tooltip>
      {inicio ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={botao}
              aria-label={t("Duplicar bloco (Ctrl + O, Ctrl + P)")}
              onClick={() => acoes?.duplicar(id)}
              data-testid="chatbot-duplicar-passo"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{t("Duplicar bloco (Ctrl + O, Ctrl + P)")}</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`${botao} hover:!text-destructive`}
            aria-label={t("Excluir")}
            onClick={() => acoes?.apagar(id)}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{t("Excluir")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export const PassoNode = memo(function PassoNode({ id, type, data, selected }: NodeProps) {
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
      <NodeToolbar isVisible={Boolean(selected)} position={Position.Top} offset={8}>
        <BarraDoPasso id={id} inicio={meta.grupo === "inicio"} />
      </NodeToolbar>
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

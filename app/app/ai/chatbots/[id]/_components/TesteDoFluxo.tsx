"use client";

/**
 * "Testar": um chat de mentira ao lado do desenho. Roda o MESMO motor do
 * WhatsApp no navegador (`lib/chatbot/simulador.ts`) com o desenho como está
 * na tela — inclusive o que ainda não foi salvo. Nada é enviado, gravado ou
 * marcado; o que vem de fora do motor (WebHook, horários da Agenda, outro
 * fluxo) é imitado e a tela diz isso.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Paperclip, RotateCcw, Send, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import type { Grafo } from "@/lib/chatbot/passos";
import {
  comecarPorAutomacao,
  comecarTeste,
  enviarNoTeste,
  mudarSituacao,
  pularEspera,
  responderWebhookNoTeste,
  type BolhaDoTeste,
  type EstadoDoTeste,
  type EventoDoTeste,
  type OpcoesDoTeste,
} from "@/lib/chatbot/simulador";

import type { OpcoesDoPainel } from "./NodePanel";

type Props = {
  /** Uma FOTO do desenho na tela, tirada ao abrir e a cada "Recomeçar": mexer no quadro não troca o fluxo no meio da conversa. */
  fotoDoDesenho: () => Grafo;
  opcoes: OpcoesDoPainel;
  onFechar: () => void;
  /** O passo em que o teste parou, para o quadro destacar. */
  onPasso: (noId: string | null) => void;
};

const FUSO =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Sao_Paulo";

export function TesteDoFluxo({ fotoDoDesenho, opcoes, onFechar, onPasso }: Props) {
  const t = useT();
  const o: OpcoesDoTeste = useMemo(() => ({ fluxoAtual: opcoes.fluxoAtual, fuso: FUSO }), [opcoes.fluxoAtual]);
  const [grafo, setGrafo] = useState<Grafo>(fotoDoDesenho);
  const [estado, setEstado] = useState<EstadoDoTeste>(() => comecarTeste(grafo));
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onPasso(estado.noAtual);
  }, [estado.noAtual, onPasso]);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [estado.bolhas.length]);

  const recomecar = () => {
    const novo = fotoDoDesenho();
    setGrafo(novo);
    // A situação escolhida continua valendo: quem testa a mesma condição recomeça várias vezes.
    setEstado(comecarTeste(novo, estado.fatos));
    setTexto("");
  };
  // Durante um "Aguardar" a mensagem do cliente também conta: o passo decide se o fluxo segue.
  const aceitaMensagem = estado.espera.tipo === "mensagem" || estado.espera.tipo === "relogio";
  const enviar = () => {
    const m = texto.trim();
    if (!m || !aceitaMensagem) return;
    setEstado(enviarNoTeste(grafo, estado, m, o));
    setTexto("");
  };

  return (
    <div className="flex h-full flex-col" data-testid="chatbot-teste">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{t("Testar o fluxo")}</h2>
        <button
          type="button"
          onClick={recomecar}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="chatbot-teste-recomecar"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("Recomeçar")}
        </button>
        <button
          type="button"
          onClick={onFechar}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("Fechar")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="border-b border-border bg-surface-elevated px-4 py-2 text-xs text-muted-foreground">
        {t(
          "Teste com o desenho como está na tela, mesmo sem salvar. Nada é enviado no WhatsApp nem gravado no CRM.",
        )}
      </p>

      <Situacao estado={estado} opcoes={opcoes} onMudar={(p) => setEstado(mudarSituacao(estado, p))} />

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {estado.bolhas.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {estado.espera.tipo === "comecar"
              ? t('Este fluxo começa por automação. Clique em "Começar" para ver o que o contato receberia.')
              : t("Escreva a primeira mensagem como se você fosse o cliente.")}
          </p>
        ) : null}
        {estado.bolhas.map((b, i) => (
          <Bolha key={i} bolha={b} opcoes={opcoes} />
        ))}
        <div ref={fim} />
      </div>

      <div className="space-y-2 border-t border-border p-3">
        {estado.espera.tipo === "comecar" ? (
          <Button type="button" className="w-full" onClick={() => setEstado(comecarPorAutomacao(grafo, estado, o))}>
            {t("Começar")}
          </Button>
        ) : null}
        {estado.espera.tipo === "webhook" ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {t("No teste, o WebHook não é chamado. Escolha como ele responderia:")}
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="flex-1" onClick={() => setEstado(responderWebhookNoTeste(grafo, estado, true, o))}>
                {t("Deu certo")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setEstado(responderWebhookNoTeste(grafo, estado, false, o))}
              >
                {t("Falhou")}
              </Button>
            </div>
          </div>
        ) : null}
        {estado.espera.tipo === "relogio" ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs text-muted-foreground">
              {t("O fluxo está esperando o relógio.")} ({new Date(estado.espera.ate).toLocaleString()})
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setEstado(pularEspera(grafo, estado, o))}>
              {t("Pular espera")}
            </Button>
          </div>
        ) : null}
        {estado.espera.tipo === "espera_da_equipe" ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs text-muted-foreground">
              {t("Se ninguém da equipe responder, a mensagem de espera sai em")}{" "}
              {new Date(estado.espera.ate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setEstado(pularEspera(grafo, estado, o))}>
              {t("Simular a espera")}
            </Button>
          </div>
        ) : null}
        {estado.espera.tipo === "fim" && estado.bolhas.length > 0 ? (
          <p className="text-center text-xs text-muted-foreground">{t("O fluxo terminou aqui.")}</p>
        ) : null}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={aceitaMensagem ? t("Mensagem do cliente") : t("Aguarde o fluxo")}
            disabled={!aceitaMensagem}
            aria-label={t("Mensagem do cliente")}
            data-testid="chatbot-teste-mensagem"
          />
          <Button type="submit" size="sm" disabled={!texto.trim() || !aceitaMensagem} aria-label={t("Enviar")}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function Bolha({ bolha, opcoes }: { bolha: BolhaDoTeste; opcoes: OpcoesDoPainel }) {
  const t = useT();
  if (bolha.de === "contato")
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-line text-primary-foreground">
          {bolha.texto}
        </p>
      </div>
    );
  if (bolha.de === "bot")
    return (
      <div className="flex justify-start" data-testid="chatbot-teste-bolha-bot">
        <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-elevated px-3 py-2 text-sm whitespace-pre-line">
          {bolha.texto}
        </p>
      </div>
    );
  if (bolha.de === "midia") {
    const tipos: Record<string, string> = {
      image: t("Imagem"),
      video: t("Vídeo"),
      audio: t("Áudio"),
      document: t("Documento"),
    };
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-elevated px-3 py-2 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Paperclip className="h-3.5 w-3.5" />
            {tipos[bolha.tipo] ?? t("Arquivo")}: {bolha.storage_path.split("/").pop()}
          </p>
          {bolha.legenda ? <p className="mt-1 whitespace-pre-line">{bolha.legenda}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <p className="text-center text-[11px] text-muted-foreground" data-testid="chatbot-teste-evento">
      {textoDoEvento(bolha.evento, opcoes, t)}
    </p>
  );
}

function textoDoEvento(e: EventoDoTeste, opcoes: OpcoesDoPainel, t: (s: string) => string): string {
  switch (e.tipo) {
    case "transferiu_equipe":
      return `— ${t("Conversa transferida para a fila da equipe (Aguardando)")} —`;
    case "transferiu_atendente": {
      const nome = opcoes.atendentes.find((a) => a.id === e.user_id)?.nome ?? t("um atendente");
      return `— ${t("Conversa transferida para")} ${nome} —`;
    }
    case "etiquetas":
      return `🏷 ${[...e.adicionar.map((x) => `+${x}`), ...e.remover.map((x) => `−${x}`)].join(" ")}`;
    case "nota":
      return `📝 ${t("Nota interna")}: ${e.texto}`;
    case "campo":
      return `✏️ ${e.campo} ← ${e.valor}`;
    case "avaliacao":
      return `⭐ ${t("Avaliação registrada")}: ${e.nota}`;
    case "feedback":
      return `💬 ${t("Comentário registrado como nota interna")}`;
    case "followup": {
      const nome = opcoes.followups.find((f) => f.id === e.pointer_id)?.nome ?? "follow-up";
      return `🔁 ${t("O contato entraria no follow-up")} "${nome}"`;
    }
    case "aviso":
      return `🔔 ${t("Aviso na Central")}: ${e.texto}`;
    case "negocio": {
      for (const f of opcoes.funis) {
        const etapa = f.etapas.find((x) => x.id === e.stage_id);
        if (etapa) return `📊 ${t("Negócio no funil")}: ${f.nome} › ${etapa.nome}`;
      }
      return `📊 ${t("Negócio no funil")}`;
    }
    case "finalizou":
      return `— ${t("Conversa finalizada")} —`;
    case "bloqueou":
      return `⛔ ${t("Contato bloqueado: ninguém mais escreve para ele")}`;
    case "pedido_exclusao":
      return `🗑 ${t("Pedido de exclusão dos dados (LGPD) aberto para um admin aprovar")}`;
    case "horarios_de_exemplo":
      return `📅 ${t("No teste, os horários são de exemplo. No WhatsApp eles vêm da Agenda.")}`;
    case "marcou_de_exemplo":
      return `📅 ${t("No teste, nada é marcado na Agenda.")}`;
    case "abriria_fluxo": {
      const nome = opcoes.fluxos.find((f) => f.id === e.flow_id)?.nome ?? t("outro fluxo");
      return `↪ ${t("Aqui o fluxo")} "${nome}" ${t("começaria. Teste-o no editor dele.")}`;
    }
    case "voltou_ao_inicio":
      return `↺ ${t("O fluxo voltou ao início")}`;
    case "nao_comecaria":
      return t("Com essa mensagem o fluxo não começaria: ela não tem nenhuma das palavras-chave do início.");
    case "espera_mantida":
      return t("O fluxo continua esperando o relógio; essa mensagem fica para a equipe ver.");
    case "ja_terminou":
      return t('O fluxo já terminou. Clique em "Recomeçar" para testar de novo.');
    case "limite":
      return t("O fluxo deu voltas demais numa mensagem só e foi encerrado. Confira as ligações.");
  }
}

/** As respostas das condições "da conversa" no teste — no WhatsApp elas vêm do CRM. */
function Situacao({
  estado,
  opcoes,
  onMudar,
}: {
  estado: EstadoDoTeste;
  opcoes: OpcoesDoPainel;
  onMudar: (p: Partial<EstadoDoTeste["fatos"]>) => void;
}) {
  const t = useT();
  const f = estado.fatos;
  const marca = (rotulo: string, valor: boolean, chave: "primeira_conversa" | "equipe_disponivel" | "outro_bot") => (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={valor} onChange={(e) => onMudar({ [chave]: e.target.checked })} />
      {rotulo}
    </label>
  );
  return (
    <details className="border-b border-border px-4 py-2 text-xs" data-testid="chatbot-teste-situacao">
      <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {t("Situação do teste")}
      </summary>
      <div className="mt-2 space-y-1.5">
        {marca(t("Primeira conversa do contato"), f.primeira_conversa, "primeira_conversa")}
        {marca(t("Alguém da equipe disponível"), f.equipe_disponivel, "equipe_disponivel")}
        {marca(t("Agente de IA ou outro chatbot na conversa"), f.outro_bot, "outro_bot")}
        <label className="flex items-center gap-2">
          <span className="w-24 shrink-0">{t("Número")}</span>
          <select
            className="h-7 flex-1 rounded-md border border-border bg-background px-1"
            value={f.canal ?? ""}
            onChange={(e) => onMudar({ canal: e.target.value || null })}
          >
            <option value="">{t("Nenhum")}</option>
            {opcoes.canais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-24 shrink-0">{t("Atendente")}</span>
          <select
            className="h-7 flex-1 rounded-md border border-border bg-background px-1"
            value={f.atendente ?? ""}
            onChange={(e) => onMudar({ atendente: e.target.value || null })}
          >
            <option value="">{t("Ninguém")}</option>
            {opcoes.atendentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <p className="text-muted-foreground">
          {t("Vale a partir da próxima mensagem. No WhatsApp, essas respostas vêm do CRM.")}
        </p>
      </div>
    </details>
  );
}

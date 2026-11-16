"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { format } from "date-fns";
import { useT } from "@/hooks/i18n/useT";
import { ArrowBendUpLeft, ArrowBendUpRight, CaretDown, Check, Checks, PencilSimple, Robot, Star, Sticker, Trash, WarningOctagon } from "@/lib/ui/icons";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Message } from "@/lib/types/messaging";
import type { ReacaoNoBalao } from "@/lib/inbox/reacoes-no-fio";
import { motivoDaFalhaDaMensagem } from "@/lib/inbox/motivo-da-falha";
import { reenvioDaMensagem } from "@/lib/messaging/reenvio";
import { lerRemetenteDeGrupo, rotuloDoRemetente } from "@/lib/messaging/remetente-de-grupo";
import { CitationButton } from "@/components/ai/CitationButton";
import { MediaRenderer } from "@/components/inbox/media/MediaRenderer";
import { ContactCard } from "@/components/inbox/media/ContactCard";
import { LocationCard } from "@/components/inbox/media/LocationCard";
import { localizacaoDaMensagem } from "@/lib/messaging/localizacao";
import {
  extractCitations,
  isAiGeneratedMessage,
} from "@/lib/ai/citations/types";

const PickerDeReacao = lazy(() => import("@emoji-mart/react"));
const REACOES_INICIAIS = ["👍", "❤️", "😂", "😮", "🙏"];
/**
 * Colunas do seletor completo que CABEM no modal: largura do emoji-mart =
 * colunas × 36 + 28; área útil do modal = janela − 58. A 375px, 9 colunas
 * (352px) vazavam 22px pela borda.
 */
export function colunasDoSeletorDeReacao(larguraDaJanela: number): number {
  return Math.max(6, Math.min(9, Math.floor((larguraDaJanela - 58 - 28) / 36)));
}
// Identificador persistido no navegador; não é texto de marca exibido ao usuário.
const REACOES_STORAGE = "inbox:reacoes-frequentes:v1";

function lerContagens(): Record<string, number> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(REACOES_STORAGE) ?? "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([emoji, n]) =>
      emoji.length > 0 && emoji.length <= 64 && typeof n === "number" && Number.isFinite(n) && n > 0,
    ));
  } catch { return {}; }
}

function cincoMaisUsados(contagens: Record<string, number>): string[] {
  const usados = Object.entries(contagens).sort((a, b) => b[1] - a[1]).map(([emoji]) => emoji);
  return [...new Set([...usados, ...REACOES_INICIAIS])].slice(0, 5);
}

/** Quem não tem histórico recebe cinco opções; as escolhas confirmadas sobem para o início. */
function registrarReacao(emoji: string): string[] {
  const contagens = lerContagens();
  contagens[emoji] = (contagens[emoji] ?? 0) + 1;
  try { localStorage.setItem(REACOES_STORAGE, JSON.stringify(contagens)); } catch { /* Sem armazenamento, o menu ainda funciona. */ }
  return cincoMaisUsados(contagens);
}

interface Props {
  message: Message;
  searchMatch?: boolean;
  debugCitations?: boolean;
  /** Escolher esta mensagem para responder "em cima" dela. */
  onResponder?: (m: Message) => void;
  /** A mensagem citada por ESTA, quando houver — desenha o fio. */
  citada?: Message | null;
  /** As reações a ESTA mensagem — marca no canto do balão, nunca balão próprio. */
  reacoes?: ReacaoNoBalao[];
  /** Reagir a esta mensagem no WhatsApp do cliente; ausente = o menu não oferece. */
  onReagir?: (emoji: string) => Promise<void>;
  /**
   * QUEM está lendo a conversa. É o que separa "Você" de "Atendente": a coluna
   * `sent_via='user'` só diz *"um humano digitou no CRM"*, nunca QUAL humano.
   *
   * Sem este id, uma organização com dois atendentes mostrava "Você" nas
   * mensagens do colega — cada um lia o atendimento do outro como se fosse o
   * seu. Por isso a ausência do id NÃO cai em "Você": quem não sabe quem está
   * lendo (a leitura do super-admin em `AdminThread`, por exemplo) rotula
   * "Atendente", que é verdadeiro para todo mundo.
   */
  viewerUserId?: string | null;
  onEditar?: (text: string) => Promise<void>;
  onApagar?: () => Promise<void>;
  onOcultar?: () => Promise<void>;
  onRestaurar?: () => Promise<void>;
  /** Estrela na mensagem (migration 0513). */
  favorita?: boolean;
  onFavoritar?: (favorita: boolean) => void;
  /** Abre a escolha de conversas para encaminhar. */
  onEncaminhar?: () => void;
  /** Guarda a figurinha recebida na biblioteca da empresa (migration 0516). */
  onSalvarFigurinha?: () => void;
  /**
   * Enviar de novo a mensagem que falhou ou ficou parada (vindo do produto
   * original). Quem decide SE pode é `reenvioDaMensagem`, a mesma regra da rota.
   */
  onReenviar?: (confirmado: boolean) => Promise<void>;
  /** Gerente para cima reenvia mensagem de colega — a mesma régua da rota. */
  podeReenviarDeOutros?: boolean;
}

function AckIndicator({ status, t }: { status: string; t: (texto: string) => string }) {
  if (status === "read") {
    return <Checks size={12} weight="bold" className="text-blue-400" aria-label={t("Lida")} />;
  }
  if (status === "delivered") {
    return <Checks size={12} weight="bold" className="text-current/70" aria-label={t("Entregue")} />;
  }
  if (status === "sent") {
    return <Check size={12} weight="bold" className="text-current/70" aria-label={t("Enviada")} />;
  }
  return null;
}

export function MessageBubble({
  message,
  searchMatch = false,
  debugCitations,
  onResponder,
  citada,
  reacoes,
  onReagir,
  viewerUserId,
  onEditar,
  onApagar,
  onOcultar,
  onRestaurar,
  favorita = false,
  onFavoritar,
  onEncaminhar,
  onSalvarFigurinha,
  onReenviar,
  podeReenviarDeOutros = false,
}: Props) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(message.body ?? "");
  const [apagando, setApagando] = useState(false);
  const [ocultando, setOcultando] = useState(false);
  const [confirmandoReenvio, setConfirmandoReenvio] = useState(false);
  const [seletorDeReacaoAberto, setSeletorDeReacaoAberto] = useState(false);
  const [reacoesFrequentes, setReacoesFrequentes] = useState(REACOES_INICIAIS);
  const reacaoPendente = useRef(false);
  const enviarReacao = async (emoji: string) => {
    if (!onReagir || reacaoPendente.current) return;
    reacaoPendente.current = true;
    try {
      await onReagir(emoji);
      setReacoesFrequentes(registrarReacao(emoji));
    } finally {
      reacaoPendente.current = false;
    }
  };
  const [ocupado, setOcupado] = useState(false);
  const salvandoEdicao = useRef(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  async function reenviar(confirmado: boolean) {
    if (!onReenviar) return;
    setOcupado(true);
    try {
      await onReenviar(confirmado);
      setConfirmandoReenvio(false);
    } catch {
      /* O hook já informa a falha; a confirmação fica aberta. */
    } finally {
      setOcupado(false);
    }
  }
  const abrindoEdicao = useRef(false);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!editando) return;
    // O editor aumenta a altura da última bolha; sem rolar o fio, os botões
    // ficam escondidos atrás da área de resposta até a pessoa usar o mouse.
    editorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [editando]);
  const localeDaData = useLocaleDeData();
  const t = useT();
  const isOutbound = message.direction === "outbound";
  const time = format(new Date(message.sent_at), "HH:mm", { locale: localeDaData });
  const isFailed = message.status === "failed";
  const hasMedia = Boolean(message.media_url || message.media_storage_path);
  const isContact = message.type === "contact";
  // Pino com coordenadas: o cartão substitui o corpo, que é só o mesmo link em texto.
  const localizacao = localizacaoDaMensagem(message);
  // Figurinha sem caption: sem moldura de bolha (padrão WhatsApp).
  const isBareSticker = hasMedia && message.type === "sticker" && !message.body;
  // Apagada pelo autor ("apagar para todos"). A linha continua no histórico —
  // sumir com ela deixaria a resposta seguinte respondendo ao nada —, mas o
  // texto não aparece: mostrá-lo seria expor justamente o que o cliente pediu
  // para tirar do ar.
  const apagada = Boolean(message.revoked_at);
  const ocultaNoCrm = Boolean(message.metadata?.crm_hidden_at);
  const editada = Boolean(message.edited_at) && !apagada;
  const enviadaPeloAtendente = isOutbound && ["user", "crm"].includes(message.sent_via)
    && Boolean(message.external_id) && !apagada
    && ["sent", "delivered", "read"].includes(message.status);
  const podeEditar = enviadaPeloAtendente && message.type === "text" && Boolean(message.body)
    && agora - new Date(message.sent_at).getTime() <= 15 * 60 * 1000;
  const podeApagar = enviadaPeloAtendente && Boolean(onApagar);
  const podeOcultar = !isOutbound && !apagada && Boolean(ocultaNoCrm ? onRestaurar : onOcultar);
  const podeEncaminhar = !apagada && Boolean(onEncaminhar)
    && (message.type === "text" ? Boolean(message.body) : ["image", "video", "audio", "document"].includes(message.type) && Boolean(message.media_storage_path));
  const podeFavoritar = !apagada && Boolean(onFavoritar);
  const podeSalvarFigurinha = !apagada && message.type === "sticker" && Boolean(message.media_storage_path) && Boolean(onSalvarFigurinha);
  const reenvio = onReenviar
    ? reenvioDaMensagem(message, { userId: viewerUserId, podeReenviarDeOutros, agora })
    : "nenhum";
  const podeReagir = Boolean(onReagir) && !apagada && !ocultaNoCrm;
  const temMenu = Boolean(onResponder || (podeEditar && onEditar) || podeApagar || podeOcultar || podeEncaminhar || podeFavoritar || podeSalvarFigurinha || podeReagir);
  const aiGenerated = isAiGeneratedMessage(message.metadata);
  const citations = extractCitations(message.metadata);
  const showCitationButton =
    isOutbound && aiGenerated && (debugCitations ?? false);
  // De quem saiu esta linha. `external_device` é a resposta pelo CELULAR — o
  // operador atendeu pelo WhatsApp do telefone, fora do CRM, e o ingest carimba
  // aqui. Antes isto voltava null para tudo que não fosse IA, e a bolha ficava
  // sem nome: o dono lia a conversa como se tudo tivesse sido digitado no CRM.
  // Os rótulos passam por t() no render (ver dicionario.ts para o espanhol).
  //
  // `'automation'` é a categoria de quem não é pessoa nem IA: regra de
  // automação, texto fixo do follow-up e lembrete de agenda (#652, decidida pelo
  // mantenedor em 16/09). Enquanto ninguém gravava o valor, um ramo aqui seria
  // controle decorativo — a tela oferecendo uma distinção que o motor não fazia.
  // O carimbo vive em `origemDaMensagem` (`app/api/v1/messages/_handler.ts`) e o
  // par é vigiado nas duas direções por tests/unit/rotulo-de-origem-tem-emissor.
  const senderLabel = (() => {
    if (!isOutbound) return null;
    // #1613: a autoria "em nome de" sobe a MESA. Quem apertou foi o token, mas
    // quem decidiu foi uma pessoa no outro sistema — sem este ramo a conversa
    // leria "Sistema" e perderia quem mandou. Os nomes vêm GRAVADOS na própria
    // linha (`metadata.sent_on_behalf`, escrito pelo handler), porque o balão
    // não faz join: o que não está na linha não aparece em lugar nenhum.
    const emNomeDe = message.sent_on_behalf_of_user_id
      ? (message.metadata?.sent_on_behalf as
          | { user_name?: string | null; token_name?: string | null }
          | undefined)
      : undefined;
    if (emNomeDe) {
      const nome = emNomeDe.user_name?.trim() || t("Atendente");
      // "Fulano · via {token}": só a palavra "via" passa por `t()`; os nomes
      // são dado do operador e saem como cadastrados — traduzir nome próprio é
      // o mesmo erro de #1046.
      return emNomeDe.token_name ? `${nome} · ${t("via")} ${emNomeDe.token_name}` : nome;
    }
    if (message.sent_via === "ai") return "IA";
    // A REGRA falou, e não a IA: texto fixo de automação, follow-up ou lembrete
    // de agenda (#652). O ramo passou a existir porque o valor passou a ser
    // gravado — antes dele, um rótulo aqui seria promessa sem dado atrás.
    if (message.sent_via === "automation") return "Automação";
    // A integração falou, a IA não. Sem este ramo a bolha omite a autoria e o
    // dono lê a conversa como se tudo tivesse saído do CRM — que é o defeito do
    // #866 visto de dentro da tela.
    if (message.sent_via === "system") return "Sistema";
    if (message.sent_via === "external_device") return "Celular";
    if (message.sent_via === "user" || message.sent_via === "crm") {
      // "Você" exige as DUAS pontas: saber quem lê e saber quem enviou. Falta
      // qualquer uma, o rótulo cai para "Atendente" — que continua dizendo o
      // que `sent_via` de fato garante (um humano, pelo CRM) sem afirmar uma
      // identidade que o dado não sustenta.
      return viewerUserId != null && message.sent_by_user_id === viewerUserId
        ? "Você"
        : "Atendente";
    }
    return null;
  })();
  // QUEM MANDOU, num grupo. Só faz sentido em mensagem RECEBIDA: uma mensagem
  // que ESTE CRM enviou não tem remetente a descobrir, é sempre o atendente (ou
  // a IA) — e `senderLabel`, acima, já diz quem foi. A leitura do dado bruto é
  // `lerRemetenteDeGrupo` (Task 2): este componente não conhece o formato de
  // `metadata.group_sender`, só o resultado já validado.
  const remetente = !isOutbound ? lerRemetenteDeGrupo(message.metadata) : null;

  async function salvarEdicao() {
    const novoTexto = texto.trim();
    if (!onEditar || !novoTexto || salvandoEdicao.current) return;
    // Enter e clique podem chegar antes de React atualizar `ocupado`; o ref
    // impede duas chamadas ao WhatsApp para a mesma edição.
    salvandoEdicao.current = true;
    setOcupado(true);
    try { await onEditar(novoTexto); setEditando(false); }
    catch { /* O hook mostra o erro; manter o texto para nova tentativa. */ }
    finally { salvandoEdicao.current = false; setOcupado(false); }
  }

  return (
    <div
      data-search-match={searchMatch || undefined}
      className={cn(
        "group flex w-full min-w-0 items-center gap-1 px-4 py-1",
        isOutbound ? "justify-end" : "justify-start",
      )}
    >
      <div
        // Identidade, não aparência. O e2e de citação contava bolhas por
        // `[class*='rounded-2xl']`, e qualquer componente novo com a mesma
        // classe utilitária entrava na conta — foi assim que o painel flutuante
        // fez a spec achar que havia mensagem onde não havia (issue #1318).
        data-testid="message-bubble"
        className={cn(
          "relative max-w-[75%] min-w-0 text-sm",
          isBareSticker
            ? "px-0 py-0"
            : cn(
                "rounded-2xl px-3 py-2 shadow-sm",
                temMenu && "pr-8",
                isOutbound
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted text-foreground",
              ),
          isFailed && "border border-destructive",
          // A marca da busca é ANEL, não cor de fundo: o fundo já diz de quem é
          // a mensagem, e trocá-lo apagaria essa leitura justo na bolha achada.
          searchMatch && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
          apagada && "opacity-70",
          // Espaço para a marca de reação, que fica metade para fora do balão.
          Boolean(reacoes?.length) && "mb-3",
        )}
      >
        {temMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={t("Opções da mensagem")} disabled={ocupado}
                onClick={() => setReacoesFrequentes(cincoMaisUsados(lerContagens()))}
                className={cn(
                  "absolute right-1 top-1 z-10 rounded-md p-0.5 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-1",
                  // A setinha visível tem 20px; no toque a área de acerto cresce
                  // 12px para cada lado (44px) sem empurrar o texto do balão.
                  "pointer-coarse:before:absolute pointer-coarse:before:-inset-3",
                  "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                  isOutbound ? "text-primary-foreground hover:bg-primary-foreground/15" : "text-muted-foreground hover:bg-background/70",
                )}>
                <CaretDown size={16} weight="bold" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOutbound ? "end" : "start"} sideOffset={4}
              onCloseAutoFocus={(event) => {
                if (!abrindoEdicao.current) return;
                // O Radix devolve o foco à setinha ao fechar o menu. Isso rola o
                // fio de volta e esconde o Salvar logo depois de abrir o editor.
                event.preventDefault();
                abrindoEdicao.current = false;
                editorRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
                editorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
              }}>
              {onResponder && (
                <DropdownMenuItem onSelect={() => onResponder(message)}>
                  <ArrowBendUpLeft size={16} aria-hidden />{t("Responder a esta mensagem")}
                </DropdownMenuItem>
              )}
              {podeReagir && (
                <div role="group" aria-label={t("Reagir")} className="flex items-center gap-0.5 px-1 py-0.5" data-testid="menu-reacoes">
                  {reacoesFrequentes.map((emoji) => (
                    <DropdownMenuItem key={emoji} className="justify-center px-1.5 text-lg leading-none"
                      aria-label={t("Reagir com {emoji}").replace("{emoji}", emoji)}
                      onSelect={() => void enviarReacao(emoji).catch(() => undefined)}>
                      {emoji}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem className="justify-center px-1.5 text-base leading-none"
                    aria-label={t("Mais emojis")} onSelect={() => setSeletorDeReacaoAberto(true)}>
                    +
                  </DropdownMenuItem>
                </div>
              )}
              {podeFavoritar && onFavoritar && (
                <DropdownMenuItem onSelect={() => onFavoritar(!favorita)}>
                  <Star size={16} weight={favorita ? "fill" : "regular"} aria-hidden />
                  {favorita ? t("Tirar dos favoritos") : t("Favoritar")}
                </DropdownMenuItem>
              )}
              {podeSalvarFigurinha && onSalvarFigurinha && (
                <DropdownMenuItem onSelect={() => onSalvarFigurinha()}>
                  <Sticker size={16} aria-hidden />{t("Salvar figurinha")}
                </DropdownMenuItem>
              )}
              {podeEncaminhar && onEncaminhar && (
                <DropdownMenuItem onSelect={() => onEncaminhar()}>
                  <ArrowBendUpRight size={16} aria-hidden />{t("Encaminhar")}
                </DropdownMenuItem>
              )}
              {podeEditar && onEditar && (
                <DropdownMenuItem onSelect={() => {
                  abrindoEdicao.current = true;
                  setTexto(message.body ?? "");
                  setEditando(true);
                }}>
                  <PencilSimple size={16} aria-hidden />{t("Editar mensagem")}
                </DropdownMenuItem>
              )}
              {podeApagar && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setApagando(true)} className="text-destructive focus:text-destructive">
                    <Trash size={16} aria-hidden />{t("Apagar para todos")}
                  </DropdownMenuItem>
                </>
              )}
              {podeOcultar && (ocultaNoCrm ? onRestaurar : onOcultar) && (
                <DropdownMenuItem onSelect={() => {
                  if (ocultaNoCrm && onRestaurar) void onRestaurar().catch(() => undefined);
                  else setOcultando(true);
                }}>
                  {ocultaNoCrm ? <PencilSimple size={16} aria-hidden /> : <Trash size={16} aria-hidden />}
                  {t(ocultaNoCrm ? "Restaurar no CRM" : "Ocultar no CRM")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/*
          A CITAÇÃO, dentro da bolha e acima do texto — o fio.

          Mostra de quem era e um trecho. `line-clamp-2` porque serve para
          reconhecer, não para reler: a original está logo acima no histórico.
        */}
        {citada && (
          <div
            className={cn(
              "mb-1 rounded-md border-l-2 px-2 py-1 text-xs",
              isOutbound
                ? "border-primary-foreground/50 bg-primary-foreground/10"
                : "border-primary bg-background/60",
            )}
          >
            <div className="font-medium opacity-80">
              {citada.direction === "outbound" ? t("Você") : t("Cliente")}
            </div>
            {/*
              A CITADA PODE TER SIDO APAGADA — e aí o texto dela não volta aqui.

              A bolha principal já trata isto (`apagada`, acima): "mostrá-lo
              seria expor justamente o que o cliente pediu para tirar do ar". A
              citação é o mesmo texto, num segundo lugar da tela — sem esta
              linha, o "apagar para todos" do cliente sumia da bolha original e
              continuava legível dentro de cada resposta que a citou. O fio
              permanece (a citação some, não a resposta); o conteúdo, não.
            */}
            <div className={cn("line-clamp-2 wrap-anywhere opacity-70", Boolean(citada.revoked_at || citada.metadata?.crm_hidden_at) && "italic")}>
              {citada.revoked_at
                ? t("Esta mensagem foi apagada")
                : citada.metadata?.crm_hidden_at
                ? t("Mensagem ocultada no CRM")
                : citada.body?.trim() || t("(sem texto)")}
            </div>
          </div>
        )}
        {remetente && (
          <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
            {rotuloDoRemetente(remetente)}
          </p>
        )}
        {senderLabel && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold opacity-80">
            {senderLabel === "IA" ? (
              <Robot size={10} weight="duotone" aria-hidden />
            ) : null}
            {senderLabel && t(senderLabel)}
          </div>
        )}

        {editando ? (
          <div ref={editorRef} className="space-y-2">
            <textarea
              aria-label={t("Editar mensagem")}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void salvarEdicao();
                }
              }}
              maxLength={4096}
              className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-foreground"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setEditando(false)}>{t("Cancelar")}</Button>
              <Button size="sm" disabled={ocupado || !texto.trim()} onClick={() => void salvarEdicao()}>{t("Salvar")}</Button>
            </div>
          </div>
        ) : apagada ? (
          <div className="space-y-1">
            <p className="italic leading-snug opacity-70">{t("Esta mensagem foi apagada")}</p>
            {/* O WhatsApp revoga o envio; o CRM conserva o corpo para auditoria
                interna. Não revelamos texto de uma mensagem apagada pelo cliente. */}
            {isOutbound && message.body && (
              <div className="border-t border-current/20 pt-1">
                <p className="text-[10px] opacity-70">{t("Visível só aqui no CRM")}</p>
                <p className="whitespace-pre-wrap wrap-anywhere leading-snug">{message.body}</p>
              </div>
            )}
          </div>
        ) : ocultaNoCrm ? (
          <p className="whitespace-pre-wrap wrap-anywhere italic leading-snug opacity-60">
            {t("Mensagem ocultada no CRM")}
          </p>
        ) : (
          <>
            {hasMedia && (
              <div className={cn(message.body && "mb-1")}>
                <MediaRenderer message={message} />
              </div>
            )}

            {isContact && !hasMedia && (
              <div className={cn(message.body && isContact && "mb-1")}>
                <ContactCard message={message} />
              </div>
            )}

            {localizacao && <LocationCard localizacao={localizacao} />}

            {message.body && !isContact && !localizacao && (
              <p className="whitespace-pre-wrap wrap-anywhere leading-snug">{message.body}</p>
            )}
          </>
        )}

        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            isOutbound ? "text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {editada && (
            // Ao lado da hora, não no corpo: o texto mostrado JÁ é o novo, e o
            // que falta é avisar que ele mudou. Sem isso, um combinado de preço
            // ou endereço é lido como se sempre tivesse dito aquilo — e a
            // divergência só aparece quando alguém cobra o que não foi.
            <span title={t("O autor editou esta mensagem")}>{t("editada")}</span>
          )}
          {favorita && <Star size={11} weight="fill" aria-label={t("Favorita")} data-testid="estrela" />}
          {Boolean(message.metadata?.encaminhada_de) && <span>{t("encaminhada")}</span>}
          <span>{time}</span>
          {showCitationButton && (
            <CitationButton citations={citations} messageId={message.id} />
          )}
          {isOutbound && !isFailed && <AckIndicator status={message.status} t={t} />}
          {isFailed && (
            // Provider local: o painel do inbox não tem TooltipProvider ancestral e
            // este Tooltip só monta em mensagem failed — sem o provider, abrir uma
            // conversa com falha de envio derrubava o painel inteiro (error boundary).
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 font-semibold text-destructive">
                    <WarningOctagon size={10} weight="fill" aria-hidden /> {t("Falhou")}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{motivoDaFalhaDaMensagem(message, t)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {/* O MOTIVO à vista (o dedo não abre Tooltip) e o "Tentar de novo",
            quando a regra da rota deixa (vindo do produto original). */}
        {(isFailed || reenvio !== "nenhum") && (
          <div className="mt-1.5 space-y-1.5 border-t border-current/20 pt-1.5">
            {isFailed && (
              <p data-testid="motivo-da-falha" className="text-xs leading-snug">
                {motivoDaFalhaDaMensagem(message, t)}
              </p>
            )}
            {reenvio !== "nenhum" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={ocupado}
                onClick={() => (reenvio === "confirmar" ? setConfirmandoReenvio(true) : void reenviar(false))}
              >
                {t("Tentar de novo")}
              </Button>
            )}
          </div>
        )}
        {reacoes?.length ? (
          <span
            role="img"
            data-testid="message-reactions"
            aria-label={reacoes
              .map((r) =>
                t(r.direction === "inbound" ? "Cliente reagiu com {emoji}" : "Atendente reagiu com {emoji}").replace(
                  "{emoji}",
                  r.emoji,
                ),
              )
              .join(", ")}
            className={cn(
              "absolute -bottom-3 flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-0.5 text-xs leading-none text-foreground shadow-sm",
              isOutbound ? "right-2" : "left-2",
            )}
          >
            {[...new Set(reacoes.map((r) => r.emoji))].join("")}
            {reacoes.length > 1 && <span className="text-[10px] text-muted-foreground">{reacoes.length}</span>}
          </span>
        ) : null}
      </div>
      <Dialog open={seletorDeReacaoAberto} onOpenChange={setSeletorDeReacaoAberto}>
        <DialogContent className="w-fit max-w-[calc(100vw-2rem)] p-3 sm:max-w-fit">
          <DialogHeader>
            <DialogTitle>{t("Escolha uma reação")}</DialogTitle>
          </DialogHeader>
          {seletorDeReacaoAberto && (
            <Suspense fallback={<Skeleton className="h-[420px] w-[min(352px,calc(100vw-4rem))]" />}>
              <PickerDeReacao
                data={async () => (await import("@emoji-mart/data")).default}
                // O idioma vem do pacote instalado: sem isto o seletor busca o pt.json numa
                // CDN externa e fica em branco quando ela não responde.
                i18n={async () => (await import("@emoji-mart/data/i18n/pt.json")).default}
                locale="pt"
                previewPosition="none"
                perLine={colunasDoSeletorDeReacao(window.innerWidth)}
                onEmojiSelect={(e: { native: string }) => {
                  setSeletorDeReacaoAberto(false);
                  void enviarReacao(e.native).catch(() => undefined);
                }}
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmandoReenvio} onOpenChange={setConfirmandoReenvio}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Enviar de novo?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Esta mensagem pode ter chegado ao cliente. Se chegou, ele vai receber duas vezes.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>{t("Cancelar")}</AlertDialogCancel>
            <Button disabled={ocupado} onClick={() => void reenviar(true)}>
              {t("Enviar de novo")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={apagando} onOpenChange={setApagando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Apagar mensagem para todos?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("O WhatsApp tentará remover esta mensagem também para o cliente.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>{t("Cancelar")}</AlertDialogCancel>
            <Button variant="destructive" disabled={ocupado} onClick={async () => {
              if (!onApagar) return;
              setOcupado(true);
              try { await onApagar(); setApagando(false); }
              catch { /* Mantém a confirmação aberta se o canal recusar. */ }
              finally { setOcupado(false); }
            }}>{t("Apagar para todos")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={ocultando} onOpenChange={setOcultando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Ocultar esta mensagem no CRM?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("A mensagem continua no WhatsApp do cliente e no registro da empresa. Um gestor pode restaurá-la aqui.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>{t("Cancelar")}</AlertDialogCancel>
            <Button variant="destructive" disabled={ocupado} onClick={async () => {
              if (!onOcultar) return;
              setOcupado(true);
              try { await onOcultar(); setOcultando(false); }
              catch { /* O hook já informa a falha; preservar a confirmação. */ }
              finally { setOcupado(false); }
            }}>{t("Ocultar no CRM")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

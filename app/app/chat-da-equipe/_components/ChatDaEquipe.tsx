"use client";
/**
 * A tela do chat interno: à esquerda a sala Geral e as pessoas da equipe (com
 * não lidas), à direita a conversa aberta. Enter envia; Shift+Enter quebra a
 * linha. Abrir a conversa (ou receber mensagem com ela aberta) marca como lida.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  useAoVivoDoChatDaEquipe,
  useConversasDaEquipe,
  useEnviarParaEquipe,
  useMarcarLida,
  useMensagensDaEquipe,
} from "@/hooks/equipe/useChatDaEquipe";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { CORPO_MAX, SALA_GERAL } from "@/lib/equipe/chat";
import { ChatsCircle, PaperPlaneTilt, UsersThree } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

function hora(iso: string, tag: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const relogio = d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  return mesmoDia ? relogio : `${d.toLocaleDateString(tag, { day: "2-digit", month: "2-digit" })} ${relogio}`;
}

export function ChatDaEquipe() {
  const t = useT();
  const tag = useTagDeIdioma();
  const router = useRouter();
  const params = useSearchParams();
  const com = params.get("com") || SALA_GERAL;
  useAoVivoDoChatDaEquipe();
  const { data: lista } = useConversasDaEquipe();
  const { data: thread, isLoading } = useMensagensDaEquipe(com);
  const enviar = useEnviarParaEquipe(com);
  const marcar = useMarcarLida();
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const eu = lista?.eu ?? null;
  const conversas = lista?.conversas ?? [];
  const aberta = conversas.find((c) => c.chave === com);
  const nomes = useMemo(() => Object.fromEntries(conversas.map((c) => [c.chave, c.nome])), [conversas]);
  const mensagens = thread?.mensagens ?? [];
  const ultimaId = mensagens[mensagens.length - 1]?.id ?? null;

  // Abriu a conversa ou chegou mensagem nela: está lida.
  const { mutate: marcarLida } = marcar;
  useEffect(() => {
    if (com) marcarLida(com);
  }, [com, ultimaId, marcarLida]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [ultimaId]);

  function abrir(chave: string) {
    router.replace(chave === SALA_GERAL ? "/app/chat-da-equipe" : `/app/chat-da-equipe?com=${chave}`);
  }

  function mandar() {
    const corpo = texto.trim();
    if (!corpo || enviar.isPending) return;
    enviar.mutate(corpo, { onSuccess: () => setTexto("") });
  }

  const tituloAberto = com === SALA_GERAL ? t("Geral") : (aberta?.nome ?? t("Pessoa da equipe"));

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row" data-testid="chat-da-equipe">
      <aside className="flex max-h-56 shrink-0 flex-col border-b border-border md:max-h-none md:w-72 md:border-r md:border-b-0">
        <div className="px-4 py-3">
          <h1 className="text-lg font-semibold">{t("Chat da equipe")}</h1>
          <p className="text-xs text-muted-foreground">{t("Só a equipe vê. Nada daqui vai ao cliente.")}</p>
        </div>
        <ul className="flex-1 overflow-y-auto" aria-label={t("Conversas da equipe")}>
          {conversas.map((c) => (
            <li key={c.chave}>
              <button
                type="button"
                onClick={() => abrir(c.chave)}
                aria-current={c.chave === com ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60",
                  c.chave === com && "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    c.chave === SALA_GERAL ? "bg-primary/15 text-primary" : "bg-muted-foreground/15",
                  )}
                  aria-hidden
                >
                  {c.chave === SALA_GERAL ? <UsersThree className="h-4 w-4" /> : iniciais(c.nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn("truncate text-sm", c.nao_lidas > 0 && "font-semibold")}>
                      {c.chave === SALA_GERAL ? t("Geral") : c.nome}
                    </span>
                    {c.ultima ? (
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{hora(c.ultima.quando, tag)}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {c.ultima
                        ? `${c.ultima.autor === "eu" ? t("Você") + ": " : c.chave === SALA_GERAL && c.ultima.autor ? c.ultima.autor + ": " : ""}${c.ultima.texto}`
                        : c.chave === SALA_GERAL
                          ? t("A sala de toda a equipe")
                          : t("Nenhuma mensagem ainda")}
                    </span>
                    {c.nao_lidas > 0 ? (
                      <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
                        {c.nao_lidas > 99 ? "99+" : c.nao_lidas}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col" aria-label={tituloAberto}>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ChatsCircle className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 className="truncate font-medium">{tituloAberto}</h2>
          {com !== SALA_GERAL ? (
            <span className="text-xs text-muted-foreground">{t("conversa direta — só vocês dois veem")}</span>
          ) : null}
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" data-testid="chat-da-equipe-mensagens">
          {isLoading ? <p className="text-sm text-muted-foreground">{t("Carregando…")}</p> : null}
          {!isLoading && mensagens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {com === SALA_GERAL
                ? t("Ninguém escreveu ainda. Dê um oi para a equipe.")
                : t("Comece a conversa: só vocês dois vão ver.")}
            </p>
          ) : null}
          {mensagens.map((m) => {
            const minha = m.autor_user_id === eu;
            return (
              <div key={m.id} className={cn("flex", minha ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    minha ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {!minha && com === SALA_GERAL ? (
                    <p className="mb-0.5 text-xs font-semibold">{nomes[m.autor_user_id] ?? t("Pessoa da equipe")}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap wrap-anywhere">{m.corpo}</p>
                  <p className={cn("mt-1 text-[10px]", minha ? "text-primary-foreground" : "text-muted-foreground")}>
                    {hora(m.created_at, tag)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={fim} />
        </div>
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            mandar();
          }}
        >
          <textarea
            aria-label={t("Mensagem para a equipe")}
            placeholder={t("Escreva para a equipe… (Enter envia, Shift+Enter pula linha)")}
            value={texto}
            maxLength={CORPO_MAX}
            rows={2}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                mandar();
              }
            }}
            className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
          />
          <Button type="submit" disabled={!texto.trim() || enviar.isPending} aria-label={t("Enviar")}>
            <PaperPlaneTilt className="h-4 w-4" />
          </Button>
        </form>
      </section>
    </div>
  );
}

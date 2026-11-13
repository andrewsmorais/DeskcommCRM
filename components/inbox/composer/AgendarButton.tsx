"use client";
/**
 * Relógio no campo de mensagem: agenda uma mensagem, uma nota interna ou um
 * chatbot para um dia e hora, e lista as agendadas desta conversa (editar e
 * cancelar) — o "Agendar mensagens" da Umbler Talk (migration 0511).
 *
 * No horário, o worker envia em nome de quem agendou, pelo mesmo caminho da
 * tela. O que já saiu, falhou ou foi cancelado fica na lista como histórico.
 */
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useChatbotsManuais } from "@/hooks/inbox/useChatbotManual";
import {
  useAgendarMensagem,
  useCancelarAgendada,
  useMensagensAgendadas,
} from "@/hooks/inbox/useMensagensAgendadas";
import { problemaDoHorario, type MensagemAgendada, type TipoDeAgendada } from "@/lib/agendadas/regras";
import { CalendarPlus, PencilSimple, Trash } from "@/lib/ui/icons";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** `datetime-local` fala a hora do navegador, sem fuso: daqui para ISO e de volta. */
function paraCampo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function daquiAUmaHora(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return paraCampo(d);
}

const ROTULO_DO_STATUS: Record<MensagemAgendada["status"], string> = {
  agendada: "Agendada",
  processando: "Enviando",
  enviada: "Enviada",
  falhou: "Não saiu",
  cancelada: "Cancelada",
};

interface Props {
  conversationId: string;
  disabled?: boolean;
  /** O que já está escrito no campo: vira o texto inicial do agendamento. */
  textoAtual: string;
}

export function AgendarButton({ conversationId, disabled, textoAtual }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<"agendar" | "agendadas">("agendar");
  const [editando, setEditando] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoDeAgendada>("mensagem");
  const [texto, setTexto] = useState("");
  const [fluxo, setFluxo] = useState("");
  const [quando, setQuando] = useState(daquiAUmaHora());
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = useMensagensAgendadas(conversationId, aberto);
  const { data: chatbots } = useChatbotsManuais();
  const agendar = useAgendarMensagem(conversationId);
  const cancelar = useCancelarAgendada(conversationId);
  const pendentes = useMemo(
    () => (lista.data ?? []).filter((a) => a.status === "agendada").length,
    [lista.data],
  );

  const abrir = () => {
    setEditando(null);
    setTipo("mensagem");
    setTexto(textoAtual.trim());
    setFluxo("");
    setQuando(daquiAUmaHora());
    setAviso(null);
    setAba("agendar");
    setAberto(true);
  };

  const editar = (a: MensagemAgendada) => {
    setEditando(a.id);
    setTipo(a.tipo);
    setTexto(a.texto ?? "");
    setFluxo(a.chatbot_flow_id ?? "");
    setQuando(paraCampo(new Date(a.enviar_em)));
    setAviso(null);
    setAba("agendar");
  };

  const salvar = () => {
    const enviarEm = new Date(quando);
    if (Number.isNaN(enviarEm.getTime())) return setAviso(t("Data ou hora inválida."));
    const problema = problemaDoHorario(enviarEm.toISOString(), new Date());
    if (problema) return setAviso(t(problema));
    if (tipo === "chatbot" && !fluxo) return setAviso(t("Escolha o chatbot."));
    if (tipo !== "chatbot" && !texto.trim()) return setAviso(t("Escreva a mensagem."));
    setAviso(null);
    agendar.mutate(
      {
        agendadaId: editando ?? undefined,
        input: {
          tipo,
          texto: tipo === "chatbot" ? undefined : texto.trim(),
          chatbot_flow_id: tipo === "chatbot" ? fluxo : undefined,
          enviar_em: enviarEm.toISOString(),
        },
      },
      {
        onSuccess: () => {
          setEditando(null);
          setAba("agendadas");
        },
      },
    );
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-9 w-9 shrink-0"
        // "Agendar", e não "Agendar mensagem": o campo de texto se chama
        // "Mensagem", e os testes (e leitores de tela) o acham pelo rótulo.
        aria-label={t("Agendar")}
        title={t("Agendar mensagem")}
        disabled={disabled}
        onClick={abrir}
        data-testid="agendar-mensagem"
      >
        <CalendarPlus size={18} weight="regular" aria-hidden />
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Agendar mensagem")}</DialogTitle>
            <DialogDescription>
              {t("No horário escolhido, sai em seu nome, como se você tivesse enviado agora.")}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={aba} onValueChange={(v) => setAba(v as "agendar" | "agendadas")}>
            <TabsList>
              <TabsTrigger value="agendar">{editando ? t("Editar") : t("Agendar")}</TabsTrigger>
              <TabsTrigger value="agendadas" data-testid="aba-agendadas">
                {t("Agendadas")}
                {pendentes > 0 ? ` (${pendentes})` : ""}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="agendar" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="agendar-tipo">{t("O que agendar")}</Label>
                <select
                  id="agendar-tipo"
                  className={SELECT}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoDeAgendada)}
                >
                  <option value="mensagem">{t("Mensagem para o contato")}</option>
                  <option value="nota">{t("Nota interna (só a equipe vê)")}</option>
                  <option value="chatbot">{t("Chatbot")}</option>
                </select>
              </div>
              {tipo === "chatbot" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="agendar-chatbot">{t("Chatbot")}</Label>
                  <select
                    id="agendar-chatbot"
                    className={SELECT}
                    value={fluxo}
                    onChange={(e) => setFluxo(e.target.value)}
                  >
                    <option value="">{t("Escolha…")}</option>
                    {(chatbots ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {(chatbots ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('Nenhum chatbot ligado com o passo "Iniciar manualmente".')}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="agendar-texto">{tipo === "nota" ? t("Nota") : t("Mensagem")}</Label>
                  <textarea
                    id="agendar-texto"
                    rows={4}
                    maxLength={4096}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="agendar-quando">{t("Quando")}</Label>
                <input
                  id="agendar-quando"
                  type="datetime-local"
                  className={SELECT}
                  value={quando}
                  onChange={(e) => setQuando(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("No horário do seu computador. Pelo menos 1 minuto à frente, até um ano.")}
                </p>
              </div>
              {aviso ? (
                <p className="text-sm text-destructive" role="alert">
                  {aviso}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                {editando ? (
                  <Button type="button" variant="ghost" onClick={() => setEditando(null)}>
                    {t("Cancelar edição")}
                  </Button>
                ) : null}
                <Button type="button" onClick={salvar} disabled={agendar.isPending} data-testid="agendar-salvar">
                  {editando ? t("Salvar") : t("Agendar")}
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="agendadas" className="pt-2">
              <ListaDeAgendadas
                itens={lista.data ?? []}
                nomeDoChatbot={(id) => (chatbots ?? []).find((c) => c.id === id)?.name ?? null}
                carregando={lista.isLoading}
                onEditar={editar}
                onCancelar={(id) => cancelar.mutate(id)}
                cancelando={cancelar.isPending}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ListaDeAgendadas(props: {
  itens: MensagemAgendada[];
  /** Nome do chatbot (só os ligados com início manual estão na lista). */
  nomeDoChatbot: (id: string) => string | null;
  carregando: boolean;
  onEditar: (a: MensagemAgendada) => void;
  onCancelar: (id: string) => void;
  cancelando: boolean;
}) {
  const t = useT();
  const tag = useTagDeIdioma();
  if (props.carregando) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  if (props.itens.length === 0)
    return <p className="text-sm text-muted-foreground">{t("Nada agendado nesta conversa.")}</p>;
  const nomeDoTipo: Record<TipoDeAgendada, string> = {
    mensagem: t("Mensagem"),
    nota: t("Nota"),
    chatbot: t("Chatbot"),
  };
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto" data-testid="lista-agendadas">
      {props.itens.map((a) => (
        <li key={a.id} className="rounded-md border border-border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {nomeDoTipo[a.tipo]} ·{" "}
              {new Date(a.enviar_em).toLocaleString(tag, { dateStyle: "short", timeStyle: "short" })}
            </span>
            <span className="text-xs text-muted-foreground">{t(ROTULO_DO_STATUS[a.status])}</span>
          </div>
          {a.texto ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap wrap-anywhere text-muted-foreground">{a.texto}</p> : null}
          {a.tipo === "chatbot" && a.chatbot_flow_id ? (
            <p className="mt-1 text-muted-foreground">
              {props.nomeDoChatbot(a.chatbot_flow_id) ?? t("Chatbot desligado ou apagado")}
            </p>
          ) : null}
          {a.status === "falhou" && a.erro ? <p className="mt-1 text-xs text-destructive">{a.erro}</p> : null}
          {a.status === "agendada" ? (
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => props.onEditar(a)}>
                <PencilSimple size={14} aria-hidden /> {t("Editar")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.cancelando}
                onClick={() => props.onCancelar(a.id)}
              >
                <Trash size={14} aria-hidden /> {t("Cancelar agendamento")}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

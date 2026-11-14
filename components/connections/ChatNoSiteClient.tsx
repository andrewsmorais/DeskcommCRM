"use client";
/**
 * Conexões › Chat no site — o balão de conversa para colar no site do cliente.
 *
 * A tela faz três coisas, na ordem em que o dono precisa: criar o chat, copiar
 * a linha de código e ajustar a aparência. A conversa cai na Inbox como as
 * outras; a IA nasce pausada e é liberada aqui mesmo.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";

import { ChannelAiAccess } from "./ChannelAiAccess";

interface Chat {
  id: string;
  nome: string;
  chave: string;
  ligado: boolean;
  titulo: string;
  saudacao: string;
  cor: string;
  dominios: string[];
  pedir_nome: boolean;
  codigo: string;
}

function mensagemDoErro(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

export function ChatNoSiteClient() {
  const t = useT();
  const query = useQuery({
    queryKey: ["chat-no-site"],
    queryFn: async () =>
      (await apiClient.get<{ data: { chats: Chat[] } }>("/api/v1/channels/webchat")).data.chats,
  });
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setCriando(true);
    try {
      await apiClient.post("/api/v1/channels/webchat", { nome: nome.trim() });
      setNome("");
      toast.success(t("Chat criado. Copie o código e cole no seu site."));
      await query.refetch();
    } catch (err) {
      toast.error(mensagemDoErro(err, t("Não foi possível criar o chat.")));
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-base font-semibold">{t("Chat no site")}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Um balão de conversa no seu site. O visitante escreve ali e a conversa chega na Inbox; a sua resposta aparece no balão.",
            )}
          </p>
        </div>
        <form onSubmit={criar} className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="chat-site-nome">{t("Nome do chat (só você vê)")}</Label>
            <Input
              id="chat-site-nome"
              value={nome}
              maxLength={60}
              placeholder={t("Ex.: Site da loja")}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={criando || !nome.trim()}>
            {criando ? t("Criando…") : t("Criar chat")}
          </Button>
        </form>
      </Card>

      {query.isLoading && <p role="status" className="text-sm text-muted-foreground">{t("Carregando…")}</p>}
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("Não foi possível carregar os chats do site.")}
        </p>
      )}
      {query.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("Nenhum chat de site ainda. Crie o primeiro acima.")}
        </p>
      )}
      {query.data?.map((chat) => (
        <CartaoDoChat key={chat.id} chat={chat} aoMudar={() => void query.refetch()} />
      ))}
    </div>
  );
}

function CartaoDoChat({ chat, aoMudar }: { chat: Chat; aoMudar: () => void }) {
  const t = useT();
  const [titulo, setTitulo] = useState(chat.titulo);
  const [saudacao, setSaudacao] = useState(chat.saudacao);
  const [cor, setCor] = useState(chat.cor);
  const [dominios, setDominios] = useState(chat.dominios.join(", "));
  const [pedirNome, setPedirNome] = useState(chat.pedir_nome);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function alterar(corpo: Record<string, unknown>, sucesso: string) {
    setOcupado(true);
    try {
      await apiClient.patch(`/api/v1/channels/webchat/${chat.id}`, corpo);
      toast.success(sucesso);
      aoMudar();
    } catch (err) {
      toast.error(mensagemDoErro(err, t("Não foi possível salvar.")));
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(chat.codigo);
      toast.success(t("Código copiado."));
    } catch {
      toast.error(t("Não foi possível copiar. Selecione o código e copie à mão."));
    }
  }

  async function remover() {
    setOcupado(true);
    try {
      await apiClient.delete(`/api/v1/channels/webchat/${chat.id}`);
      toast.success(t("Chat removido. As conversas continuam na Inbox."));
      aoMudar();
    } catch (err) {
      toast.error(mensagemDoErro(err, t("Não foi possível remover.")));
      setOcupado(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{chat.nome}</h3>
          <Badge variant={chat.ligado ? "neutral" : "warning"}>
            {chat.ligado ? t("Ligado") : t("Desligado")}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado}
          onClick={() =>
            void alterar(
              { ligado: !chat.ligado },
              chat.ligado ? t("Chat desligado. O balão some do site.") : t("Chat ligado."),
            )
          }
        >
          {chat.ligado ? t("Desligar") : t("Ligar")}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`codigo-${chat.id}`}>{t("Código para colar no site")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("Cole esta linha no seu site, antes de </body>. Vale para todas as páginas onde ela estiver.")}
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <textarea
            id={`codigo-${chat.id}`}
            readOnly
            rows={2}
            value={chat.codigo}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-64 flex-1 resize-none rounded-md border bg-muted px-3 py-2 font-mono text-xs"
          />
          <Button type="button" variant="outline" onClick={() => void copiar()}>
            {t("Copiar código")}
          </Button>
        </div>
      </div>

      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void alterar(
            {
              titulo,
              saudacao,
              cor,
              pedir_nome: pedirNome,
              dominios: dominios
                .split(/[\s,;]+/)
                .map((d) => d.trim())
                .filter(Boolean),
            },
            t("Aparência salva."),
          );
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`titulo-${chat.id}`}>{t("Título do balão")}</Label>
          <Input id={`titulo-${chat.id}`} value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cor-${chat.id}`}>{t("Cor")}</Label>
          <div className="flex items-center gap-2">
            <input
              id={`cor-${chat.id}`}
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border bg-background p-1"
            />
            <span className="font-mono text-sm text-muted-foreground">{cor}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor={`saudacao-${chat.id}`}>{t("Mensagem de boas-vindas")}</Label>
          <Input id={`saudacao-${chat.id}`} value={saudacao} maxLength={300} onChange={(e) => setSaudacao(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor={`dominios-${chat.id}`}>{t("Sites que podem mostrar o chat (opcional)")}</Label>
          <Input
            id={`dominios-${chat.id}`}
            value={dominios}
            placeholder="minhaloja.com.br"
            onChange={(e) => setDominios(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("Separe por vírgula. Em branco, qualquer site com o código mostra o chat.")}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={pedirNome}
            onChange={(e) => setPedirNome(e.target.checked)}
            className="h-4 w-4"
          />
          {t("Pedir o nome do visitante antes da primeira mensagem")}
        </label>
        <div className="md:col-span-2">
          <Button type="submit" disabled={ocupado}>
            {t("Salvar aparência")}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
        <ChannelAiAccess channelId={chat.id} phoneTesting={false} />
        {confirmando ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">{t("Remover este chat?")}</span>
            <Button variant="destructive" size="sm" disabled={ocupado} onClick={() => void remover()}>
              {t("Sim, remover")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmando(false)}>
              {t("Cancelar")}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
            {t("Remover chat")}
          </Button>
        )}
      </div>
    </Card>
  );
}

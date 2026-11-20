"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { copyToClipboard } from "@/lib/clipboard";
import { Copy, Trash, CaretDown } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import {
  useDeleteWebhookSource,
  useUpdateWebhookSource,
  useChaveDaFonte,
  useWebhookSourceEvents,
  type WebhookSourceRow,
} from "@/hooks/webhooks/useWebhookSources";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  source: WebhookSourceRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function publicUrl(pathToken: string): string {
  // window.location.origin > env: NEXT_PUBLIC_APP_URL é inlined no build e num
  // Docker self-host fica congelada no placeholder do Dockerfile — a origem da
  // página é o único valor confiável em runtime.
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "");
  return `${base}/api/v1/webhooks/in/${pathToken}`;
}

function formSnippet(url: string, t: (texto: string) => string): string {
  return `<form action="${url}" method="POST">
  <input name="nome" placeholder="${t("Seu nome")}" required />
  <input name="telefone" placeholder="${t("Seu WhatsApp")}" required />
  <input name="email" type="email" placeholder="${t("Seu e-mail")}" />
  <button type="submit">${t("Quero receber contato")}</button>
</form>`;
}

function curlSnippet(url: string): string {
  return `curl -X POST ${url} \\\n  -H 'Content-Type: application/json' \\\n  -d '{"nome":"...","telefone":"..."}'`;
}

async function copy(text: string, label: string, t: (texto: string) => string): Promise<void> {
  const ok = await copyToClipboard(text);
  if (ok) toast.success(label);
  else toast.error(t("Não foi possível copiar — selecione e copie manualmente."));
}

function relativeReceivedAt(iso: string, locale: Locale): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: locale });
}

export function SourceDetail({ source, open, onOpenChange }: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const update = useUpdateWebhookSource();
  const salvarChave = useChaveDaFonte();
  const [chave, setChave] = React.useState("");
  const del = useDeleteWebhookSource();
  const { data: eventsRes, refetch: refetchEvents } = useWebhookSourceEvents(
    open ? source.id : null,
  );
  const [testing, setTesting] = React.useState(false);
  const [testOk, setTestOk] = React.useState(false);

  const url = publicUrl(source.path_token);
  const events = eventsRes?.data ?? [];

  const sendTestLead = async () => {
    setTesting(true);
    setTestOk(false);
    try {
      // URL relativa de propósito: o teste bate no host que está servindo a
      // página, mesmo que NEXT_PUBLIC_APP_URL (usada na URL exibida p/ forms
      // externos) esteja desalinhada num self-host atrás de proxy.
      const res = await fetch(`/api/v1/webhooks/in/${source.path_token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: "Lead de Teste", telefone: "11999990000", utm_source: "teste" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(
          t(
            body?.error?.message ??
              "Não funcionou. Confira se a fonte está ativa e se o funil/estágio ainda existem.",
          ),
        );
        return;
      }
      toast.success(t("Funcionou! Um lead de teste entrou no seu funil."));
      setTestOk(true);
      void refetchEvents();
    } catch {
      toast.error(t("Não conseguimos falar com o endereço. Confira sua internet e tente de novo."));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{source.name}</SheetTitle>
            <Badge variant={source.is_active ? "success" : "neutral"}>
              {source.is_active ? t("Ativa") : t("Pausada")}
            </Badge>
          </div>
          <SheetDescription>
            {t("Cada envio para o endereço abaixo vira um lead no seu funil, automaticamente.")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-2">
            <p className="text-sm font-medium text-text">{t("Endereço da fonte")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-sm border border-border bg-muted px-3 py-2 text-xs">
                {url}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => copy(url, t("Endereço copiado."), t)}
              >
                <Copy />
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium text-text">
              {t("Formulário pronto para colar no seu site")}
            </p>
            <Textarea readOnly rows={6} value={formSnippet(url, t)} className="font-mono text-xs" />
            <Button
              type="button"
              variant="secondary"
              onClick={() => copy(formSnippet(url, t), t("Formulário copiado."), t)}
            >
              <Copy /> {t("Copiar formulário")}
            </Button>
          </section>

          <section className="space-y-2 rounded-sm border border-border">
            <details className="group p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-text">
                {t("Como conectar no seu caso")}
                <CaretDown className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-4 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-text">WordPress / Elementor</p>
                  <p>
                    {t(
                      'Cole o endereço acima no campo "Action" (ou "URL de envio") do seu formulário.',
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text">Zapier / n8n</p>
                  <p>{t('Use a ação "Webhooks" → POST, apontando para o endereço acima.')}</p>
                </div>
                <div>
                  <p className="font-medium text-text">{t("Formulário próprio")}</p>
                  <p>{t("Use o HTML pronto logo acima — já aponta para o endereço certo.")}</p>
                </div>
                <div>
                  <p className="font-medium text-text">Shopify</p>
                  <p>
                    {t(
                      "Na Shopify: Configurações › Notificações › Webhooks › Criar webhook, formato JSON, com o endereço acima. Crie um para cada evento: checkout criado, checkout atualizado, pedido criado, pagamento do pedido e pedido cancelado. A chave com que a Shopify assina os webhooks vai no campo “Chave de assinatura da loja”.",
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text">Yampi</p>
                  <p>
                    {t(
                      "Na Yampi: Configurações › Webhooks › Novo webhook. Copie a chave secreta para o campo “Chave de assinatura da loja”, cole o endereço acima e marque: pedido criado, pedido aprovado, pagamento recusado, carrinho abandonado e status do pedido atualizado.",
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text">WooCommerce</p>
                  <p>
                    {t(
                      "No WordPress: WooCommerce › Configurações › Avançado › Webhooks › Adicionar webhook. Crie um para “Pedido criado” e outro para “Pedido atualizado”, com o endereço acima na URL de entrega. O segredo que aparece lá vai no campo “Chave de assinatura da loja”. O WooCommerce não avisa carrinho abandonado.",
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text">CartPanda</p>
                  <p>
                    {t(
                      "Na CartPanda: Configurações › Notificações › Webhooks › Criar webhook. Cole o endereço acima com ?plataforma=cartpanda no fim e marque os eventos de pedido e de carrinho abandonado. A CartPanda não assina o aviso: deixe a chave de assinatura em branco — o endereço secreto é a proteção.",
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text">Wix</p>
                  <p>
                    {t(
                      "No Wix: Automações › Criar automação, escolha o gatilho da loja e a ação “Enviar solicitação HTTP” (POST) para o endereço acima, com estrutura personalizada: evento_da_venda (carrinho_abandonado, aguardando_pagamento ou compra_aprovada), nome, telefone, email, produto, valor e link_checkout.",
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-text">{t("Recuperar a venda pelo WhatsApp")}</p>
                  <p>
                    {t(
                      "Crie no funil as etapas “Carrinho abandonado”, “Aguardando pagamento” e “Pago”: cada aviso da loja leva o negócio à etapa com o nome do evento. Depois, em Follow-up, faça uma sequência que começa pela etapa “Carrinho abandonado” (com uma espera de 30 minutos antes da primeira mensagem) e outra por “Aguardando pagamento”. Ela para sozinha quando a compra entra. A mensagem pode ser um texto pronto com {{produto}}, {{valor}} e {{link_checkout}}, em todos os planos, ou escrita pela IA, a partir do Impulso.",
                    )}
                  </p>
                </div>
              </div>
            </details>
          </section>

          <section className="space-y-2 rounded-sm border border-border p-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text">{t("Chave de assinatura da loja (opcional)")}</p>
              {source.has_secret ? <Badge variant="success">{t("Definida")}</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Shopify, Yampi e WooCommerce assinam cada aviso. Com a chave aqui, aviso sem a assinatura certa é recusado. Com ela definida, o botão “Enviar lead de teste” é recusado também, porque ele não assina.",
              )}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                autoComplete="off"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                placeholder={source.has_secret ? t("Digite para trocar") : t("Cole a chave da loja")}
                aria-label={t("Chave de assinatura da loja (opcional)")}
                className="h-9 flex-1 rounded-sm border border-border bg-background px-3 text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!chave.trim() || salvarChave.isPending}
                onClick={() =>
                  salvarChave.mutate(
                    { id: source.id, secret: chave.trim() },
                    {
                      onSuccess: () => {
                        setChave("");
                        toast.success(t("Chave guardada."));
                      },
                    },
                  )
                }
              >
                {t("Salvar")}
              </Button>
              {source.has_secret ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={salvarChave.isPending}
                  onClick={() =>
                    salvarChave.mutate(
                      { id: source.id, secret: null },
                      { onSuccess: () => toast.success(t("Chave removida.")) },
                    )
                  }
                >
                  {t("Remover")}
                </Button>
              ) : null}
            </div>
          </section>

          <details className="rounded-sm border border-border p-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-text">
              {t("Para desenvolvedores")}
            </summary>
            <pre className="mt-3 overflow-x-auto rounded-sm bg-muted p-3 text-xs">
              <code>{curlSnippet(url)}</code>
            </pre>
          </details>

          <section className="space-y-3">
            <Button type="button" onClick={sendTestLead} disabled={testing}>
              {testing ? t("Enviando…") : t("Enviar lead de teste")}
            </Button>
            {testOk ? (
              <p className="text-sm">
                <Link href="/app/kanban" className="text-accent underline underline-offset-4">
                  {t("Ver no Kanban")}
                </Link>
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium text-text">{t("Últimos recebimentos")}</p>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Ainda não chegou nada por aqui.")}</p>
            ) : (
              <ul className="space-y-1">
                {events.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        ev.valid_signature === false ? "bg-error" : "bg-success",
                      )}
                    />
                    <span className="text-muted-foreground">{relativeReceivedAt(ev.created_at, localeDaData)}</span>
                    {ev.valid_signature === false ? (
                      <span className="text-xs text-error">{t("assinatura inválida")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex items-center justify-between rounded-sm border border-border p-3">
            <div>
              <p className="text-sm font-medium text-text">{t("Fonte ativa")}</p>
              <p className="text-xs text-muted-foreground">
                {t("Pausada, ela para de aceitar novos envios.")}
              </p>
            </div>
            <Switch
              checked={source.is_active}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                update.mutate(
                  { id: source.id, is_active: checked },
                  {
                    onSuccess: () =>
                      toast.success(checked ? t("Fonte ativada.") : t("Fonte pausada.")),
                  },
                )
              }
            />
          </section>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive">
                <Trash /> {t("Excluir fonte")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("Excluir esta fonte?")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    "O endereço para de funcionar imediatamente. Leads já recebidos continuam no seu funil — só a captação futura é interrompida. Essa ação não pode ser desfeita.",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await del.mutateAsync(source.id);
                    toast.success(t("Fonte excluída."));
                    onOpenChange(false);
                  }}
                >
                  {t("Excluir")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SheetContent>
    </Sheet>
  );
}

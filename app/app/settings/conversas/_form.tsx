"use client";
/**
 * O formulário de Configurações › Conversas. Cada opção diz o que ACONTECE na
 * conversa, com as mesmas palavras da Umbler Talk, que é o produto de
 * referência do dono.
 */
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { useChatbotsManuais } from "@/hooks/inbox/useChatbotManual";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import {
  COMPORTAMENTOS_DA_ASSINATURA,
  COMPORTAMENTOS_DO_FINALIZAR,
  MENSAGEM_MAX,
  type ComportamentoDaAssinatura,
  type ComportamentoDoFinalizar,
  type PreferenciasDeConversa,
} from "@/lib/conversas/preferencias";

const ROTULO_DA_ASSINATURA = (t: (s: string) => string): Record<ComportamentoDaAssinatura, string> => ({
  atendente_escolhe: t("O atendente escolhe mostrar ou não a assinatura na conversa"),
  sempre: t("Sempre mostrar assinatura do atendente"),
  nunca: t("Nunca mostrar assinatura do atendente"),
});

const ROTULO_DO_FINALIZAR = (t: (s: string) => string): Record<ComportamentoDoFinalizar, string> => ({
  atendente_escolhe: t("O atendente escolhe o que fazer"),
  so_finalizar: t("Apenas finalizar a conversa"),
  mensagem: t("Enviar mensagem e finalizar a conversa"),
  chatbot: t("Iniciar um chatbot de encerramento"),
});

const CAMPO =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden";

export function ConversasForm({ initial }: { initial: PreferenciasDeConversa }) {
  const t = useT();
  const { data: chatbots } = useChatbotsManuais();
  const [assinatura, setAssinatura] = useState(initial.assinatura);
  const [finalizar, setFinalizar] = useState(initial.finalizar.comportamento);
  const [mensagem, setMensagem] = useState(initial.finalizar.mensagem_padrao ?? "");
  const [chatbot, setChatbot] = useState(initial.finalizar.chatbot_padrao ?? "");
  const [reatribuicao, setReatribuicao] = useState(initial.reatribuicao.acao);
  const [ocultarAdmins, setOcultarAdmins] = useState(initial.ocultar_administradores_vendo);
  const [chatbotDaReatribuicao, setChatbotDaReatribuicao] = useState(initial.reatribuicao.chatbot_id ?? "");
  const [salvando, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      try {
        await apiClient.patch("/api/v1/settings/conversas", {
          assinatura,
          finalizar: {
            comportamento: finalizar,
            mensagem_padrao: mensagem.trim() || null,
            chatbot_padrao: chatbot || null,
          },
          reatribuicao: { acao: reatribuicao, chatbot_id: chatbotDaReatribuicao || null },
          ocultar_administradores_vendo: ocultarAdmins,
        });
        toast.success(t("Configurações de conversas salvas."));
      } catch (err) {
        showApiError(err);
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="space-y-3 p-6">
        <h2 className="font-semibold">{t("Defina o comportamento da assinatura do atendente")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Com a assinatura, o nome do atendente vai em negrito antes do texto que ele envia.")}
        </p>
        {COMPORTAMENTOS_DA_ASSINATURA.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="assinatura"
              checked={assinatura === c}
              onChange={() => setAssinatura(c)}
              data-testid={`assinatura-${c}`}
            />
            {ROTULO_DA_ASSINATURA(t)[c]}
          </label>
        ))}
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="font-semibold">{t("Defina o comportamento da ação de finalizar conversa")}</h2>
        {COMPORTAMENTOS_DO_FINALIZAR.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="finalizar"
              checked={finalizar === c}
              onChange={() => setFinalizar(c)}
              data-testid={`finalizar-${c}`}
            />
            {ROTULO_DO_FINALIZAR(t)[c]}
          </label>
        ))}
        <div className="space-y-1.5 pt-2">
          <Label htmlFor="mensagem-padrao">
            {t("Mensagem padrão sugerida")}
            {finalizar === "mensagem" ? "" : ` (${t("opcional")})`}
          </Label>
          <textarea
            id="mensagem-padrao"
            rows={3}
            maxLength={MENSAGEM_MAX}
            className={CAMPO}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder={t("Ex.: Obrigado pelo contato! Qualquer coisa, é só chamar.")}
          />
          <p className="text-xs text-muted-foreground">
            {t("Já vem escrita na despedida. Quem tiver uma mensagem própria no Perfil usa a sua.")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chatbot-padrao">
            {t("Chatbot padrão sugerido")}
            {finalizar === "chatbot" ? "" : ` (${t("opcional")})`}
          </Label>
          <select
            id="chatbot-padrao"
            className={`${CAMPO} h-9 py-0`}
            value={chatbot}
            onChange={(e) => setChatbot(e.target.value)}
          >
            <option value="">{t("Nenhum")}</option>
            {(chatbots ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t(
              'Precisa estar ligado e ter os passos "Iniciar manualmente" e "Finalizar conversa". A conversa fica aberta até o chatbot chegar ao "Finalizar conversa".',
            )}
          </p>
        </div>
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="font-semibold">{t("Reatribuição automática")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "A regra de cada atendente fica em Equipe › Atendimento: desligada, quando estiver offline ou sempre. Aqui você define o que acontece com a conversa quando o atendente sai dela.",
          )}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="reatribuicao"
            checked={reatribuicao === "liberar"}
            onChange={() => setReatribuicao("liberar")}
          />
          {t("O atendente é removido da conversa e ela fica disponível para outro atendente")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="reatribuicao"
            checked={reatribuicao === "chatbot"}
            onChange={() => setReatribuicao("chatbot")}
          />
          {t("Um chatbot é iniciado na conversa")}
        </label>
        {reatribuicao === "chatbot" ? (
          <select
            aria-label={t("Chatbot da reatribuição")}
            className={`${CAMPO} h-9 py-0`}
            value={chatbotDaReatribuicao}
            onChange={(e) => setChatbotDaReatribuicao(e.target.value)}
          >
            <option value="">{t("Escolha…")}</option>
            {(chatbots ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="font-semibold">{t("Defina o comportamento de administradores ao visualizar conversas")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("No topo da conversa aparece quem mais da equipe está com ela aberta agora.")}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ocultarAdmins} onChange={(e) => setOcultarAdmins(e.target.checked)} />
          {t("Ocultar administradores da lista de quem está visualizando a conversa")}
        </label>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={salvar} disabled={salvando} data-testid="salvar-conversas">
          {salvando ? t("Salvando…") : t("Salvar")}
        </Button>
      </div>
    </div>
  );
}

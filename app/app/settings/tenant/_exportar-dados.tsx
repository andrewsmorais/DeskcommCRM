"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { gerarLinkDeExportacao } from "@/app/actions/settings/gerarLinkDeExportacao";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";

const ERRO_EM_PORTUGUES: Record<string, string> = {
  unauthenticated: "Sua sessão expirou. Entre de novo para continuar.",
  forbidden_tenant: "Não consegui identificar sua empresa. Recarregue a página.",
  forbidden_role: "Só quem administra esta empresa pode exportar os dados.",
  mfa_required: "Confirme o código do seu aplicativo de duas etapas e tente de novo.",
  exportacao_indisponivel: "A exportação não está disponível neste servidor. Fale com quem instalou o sistema.",
};

export function ExportarDados() {
  const t = useT();
  const [pending, start] = useTransition();

  function baixar() {
    start(async () => {
      try {
        const r = await gerarLinkDeExportacao();
        if (!r.ok) {
          toast.error(t(ERRO_EM_PORTUGUES[r.error] ?? "Não consegui gerar o arquivo agora."));
          return;
        }
        // Navegação normal: o servidor responde com `attachment`, então o
        // navegador baixa sem sair da página.
        window.location.assign(r.caminho);
      } catch {
        toast.error(t("Não consegui gerar o arquivo agora."));
      }
    });
  }

  return (
    <Card className="space-y-3 p-6" data-testid="exportar-dados">
      <header>
        <h2 className="text-base font-semibold">{t("Exportar meus dados")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Baixe um arquivo ZIP com planilhas de contatos, conversas, mensagens, leads, tarefas e agendamentos. Fotos, áudios e documentos enviados nas conversas não vão junto.",
          )}
        </p>
      </header>
      <p className="text-xs text-muted-foreground">
        {t(
          "Se a assinatura terminar, você recebe por e-mail um link para baixar seus dados por até 30 dias.",
        )}
      </p>
      <Button type="button" disabled={pending} onClick={baixar}>
        {pending ? t("Preparando…") : t("Baixar meus dados")}
      </Button>
    </Card>
  );
}

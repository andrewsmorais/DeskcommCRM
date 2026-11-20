"use client";
/**
 * "Baixar histórico" da conversa (.txt ou .pdf), como na Umbler Talk. Só o
 * ícone, como a busca: a barra do topo já é apertada. O download é um link
 * comum para a rota (o navegador baixa com o cookie da sessão).
 */
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DownloadSimple } from "@/lib/ui/icons";

export function BaixarHistoricoButton({ conversationId }: { conversationId: string }) {
  const t = useT();
  const href = (formato: "txt" | "pdf") => `/api/v1/conversations/${conversationId}/historico?formato=${formato}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="w-11 px-0 lg:w-8"
          aria-label={t("Baixar histórico")}
          title={t("Baixar histórico")}
          data-testid="baixar-historico"
        >
          <DownloadSimple size={16} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("Baixar histórico da conversa")}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={href("txt")} download>
            {t("Texto (.txt)")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href("pdf")} download>
            {t("PDF (.pdf)")}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

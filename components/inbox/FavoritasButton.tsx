"use client";
/**
 * As mensagens com estrela da conversa (paridade Umbler; migration 0513). Só
 * aparece quando há alguma — a barra do topo não ganha um botão vazio.
 */
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFavoritas } from "@/hooks/inbox/useMensagemFavoritaEncaminhar";
import { Star } from "@/lib/ui/icons";

export function FavoritasButton({ conversationId }: { conversationId: string }) {
  const t = useT();
  const tag = useTagDeIdioma();
  const { data } = useFavoritas(conversationId);
  if (!data || data.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="w-11 px-0 lg:w-8"
          aria-label={t("Mensagens favoritas")}
          title={t("Mensagens favoritas")}
          data-testid="favoritas"
        >
          <Star size={16} weight="fill" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="mb-2 text-sm font-semibold">
          {t("Mensagens favoritas")} ({data.length})
        </p>
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {data.map((f) => (
            <li key={f.id} className="rounded-md border border-border p-2 text-xs">
              <p className="text-muted-foreground">
                {f.direction === "inbound" ? t("Contato") : t("Equipe")} ·{" "}
                {new Date(f.sent_at).toLocaleString(tag, { dateStyle: "short", timeStyle: "short" })}
              </p>
              <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap wrap-anywhere">
                {f.body || `[${f.type}]`}
              </p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

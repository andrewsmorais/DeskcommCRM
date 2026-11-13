"use client";
/**
 * As iniciais de quem mais da equipe está com esta conversa aberta agora (os
 * "observadores" da Umbler). Some quando só você está vendo.
 */
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { usePreferenciasDeConversa } from "@/hooks/inbox/usePreferenciasDeConversa";
import { useQuemEstaVendo } from "@/hooks/inbox/useQuemEstaVendo";
import { Eye } from "@/lib/ui/icons";

function iniciais(nome: string): string {
  return (nome.trim()[0] ?? "?").toUpperCase();
}

export function QuemEstaVendo({ conversationId }: { conversationId: string }) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const prefs = usePreferenciasDeConversa();
  const souAdmin = activeOrg?.role === "admin";
  const ocultarAdmins = prefs.data?.ocultar_administradores_vendo ?? false;
  const outros = useQuemEstaVendo({
    orgId: activeOrg?.orgId ?? null,
    conversationId,
    eu: user ? { id: user.id, nome: user.full_name ?? user.email ?? "" } : null,
    anunciar: !(souAdmin && ocultarAdmins),
  });
  if (outros.length === 0) return null;
  const nomes = outros.map((o) => o.nome || t("Alguém da equipe")).join(", ");
  return (
    <div
      className="flex items-center gap-1 text-xs text-muted-foreground"
      title={`${t("Também vendo esta conversa agora")}: ${nomes}`}
      aria-label={`${t("Também vendo esta conversa agora")}: ${nomes}`}
      data-testid="quem-esta-vendo"
    >
      <Eye size={14} aria-hidden />
      <div className="flex -space-x-1.5">
        {outros.slice(0, 4).map((o) => (
          <span
            key={o.user_id}
            className="flex size-5 items-center justify-center rounded-full border border-background bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {iniciais(o.nome)}
          </span>
        ))}
      </div>
      {outros.length > 4 ? <span>+{outros.length - 4}</span> : null}
    </div>
  );
}

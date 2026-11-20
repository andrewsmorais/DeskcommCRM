"use client";
/**
 * QUEM MAIS ESTÁ VENDO ESTA CONVERSA AGORA — os "observadores" da Umbler Talk
 * ("Quem está vendo esse chat"). Presença do Supabase Realtime: nada é gravado
 * no banco; quem fecha a conversa some da lista na hora.
 *
 * O canal leva só o id e o primeiro nome. Com "Ocultar administradores" ligado
 * (Configurações › Conversas), quem é administrador não se anuncia.
 */
import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient, prepareRealtimeAuthentication } from "@/lib/supabase/browser";

export type QuemVe = { user_id: string; nome: string };

export function useQuemEstaVendo(args: {
  orgId: string | null;
  conversationId: string | null;
  eu: { id: string; nome: string } | null;
  anunciar: boolean;
}): QuemVe[] {
  const [outros, setOutros] = useState<QuemVe[]>([]);
  const { orgId, conversationId, eu, anunciar } = args;
  const euId = eu?.id ?? null;
  const euNome = eu?.nome ?? "";

  useEffect(() => {
    if (!orgId || !conversationId || !euId) return;
    let cancelado = false;
    let canal: RealtimeChannel | null = null;
    const supabase = createClient();
    void (async () => {
      try {
        await prepareRealtimeAuthentication();
      } catch {
        return;
      }
      if (cancelado) return;
      const c: RealtimeChannel = supabase.channel(`vendo:${orgId}:${conversationId}`, { config: { presence: { key: euId } } });
      canal = c;
      c.on("presence", { event: "sync" }, () => {
        const estado = c.presenceState() as Record<string, Array<Partial<QuemVe>>>;
        const lista: QuemVe[] = [];
        for (const [chave, metas] of Object.entries(estado)) {
          if (chave === euId) continue;
          const m = metas[0];
          if (m) lista.push({ user_id: chave, nome: String(m.nome ?? "").slice(0, 40) });
        }
        setOutros(lista);
      });
      c.subscribe((s: string) => {
        if (s === "SUBSCRIBED" && anunciar) void c.track({ user_id: euId, nome: euNome.split(" ")[0] ?? "" });
      });
    })();
    return () => {
      cancelado = true;
      setOutros([]);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [orgId, conversationId, euId, euNome, anunciar]);

  return outros;
}

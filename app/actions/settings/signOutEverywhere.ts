"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { removerPushAoSair } from "@/lib/notifications/web_push";
import { headers } from "next/headers";

export async function signOutEverywhere(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");

  // Sair de TODOS os dispositivos também cala o aviso em todos eles: a sessão
  // morria, e a tela de bloqueio de cada aparelho seguia recebendo mensagem.
  if (user) await removerPushAoSair(user.id, null);

  await supabase.auth.signOut({ scope: "global" });

  if (user) {
    await audit({
      action: "auth.logout",
      actorUserId: user.id,
      requestId,
      metadata: { scope: "global" },
    });
  }
  redirect("/login");
}

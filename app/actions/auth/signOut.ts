"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { removerPushAoSair } from "@/lib/notifications/web_push";

/**
 * `endpoint` é o da inscrição Web Push deste navegador, que o cliente acabou de
 * cancelar (`encerrarPushDesteNavegador`). Sem ele (formulário sem JavaScript),
 * a sessão sai do mesmo jeito e a inscrição fica — o caminho de sempre.
 */
export async function signOut(endpoint?: unknown): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ANTES de apagar a sessão: depois dela o servidor não sabe mais de quem é.
  // Só string com cara de URL: a ação é chamável de fora, e um `FormData` (o
  // `<form action>` de /acesso-revogado) cai aqui como primeiro argumento.
  if (user && typeof endpoint === "string" && /^https:\/\//.test(endpoint) && endpoint.length <= 2048) {
    await removerPushAoSair(user.id, endpoint);
  }

  const hdrs = await headers();
  await supabase.auth.signOut();

  // Clear active_org cookie too.
  const store = await cookies();
  store.delete("active_org");

  if (user) {
    await audit({
      action: "auth.logout",
      actorUserId: user.id,
      requestId: hdrs.get("x-request-id"),
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    });
  }

  redirect("/login");
}

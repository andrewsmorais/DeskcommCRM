import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { ChatDaEquipe } from "./_components/ChatDaEquipe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chat da equipe" };

/**
 * CHAT DA EQUIPE — o "Chat interno" da Umbler Talk (migration 0515): a sala
 * Geral com todo mundo e uma conversa direta com cada pessoa. Nada daqui vai
 * ao cliente. Todo membro da empresa usa, até "Somente leitura": combinar o
 * trabalho é parte do trabalho.
 */
export default async function ChatDaEquipePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  return <ChatDaEquipe />;
}

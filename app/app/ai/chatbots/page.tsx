import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { ChatbotsList } from "./_components/ChatbotsList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chatbots" };

export default async function ChatbotsListPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");

  const db = await createClient();
  const { data: flows } = await db
    .from("chatbot_flows")
    .select("id, name, description, status, is_active, trigger_channel, created_at, updated_at")
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false });

  return <ChatbotsList flows={flows ?? []} orgId={activeOrg.orgId} />;
}

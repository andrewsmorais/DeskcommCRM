import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { ChatbotCanvas } from "./_components/ChatbotCanvas";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Chatbot — ${id.slice(0, 8)}` };
}

export default async function ChatbotEditorPage({ params }: Props) {
  const { id } = await params;

  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");

  const db = await createClient();

  const [flowRes, nodesRes, edgesRes] = await Promise.all([
    db
      .from("chatbot_flows")
      .select("id, name, description, status, is_active, trigger_channel")
      .eq("id", id)
      .eq("organization_id", activeOrg.orgId)
      .maybeSingle(),
    db
      .from("chatbot_nodes")
      .select("id, node_type, label, pos_x, pos_y, data")
      .eq("flow_id", id)
      .eq("organization_id", activeOrg.orgId)
      .order("created_at"),
    db
      .from("chatbot_edges")
      .select("id, source_node_id, target_node_id, source_handle, target_handle, label")
      .eq("flow_id", id)
      .eq("organization_id", activeOrg.orgId)
      .order("created_at"),
  ]);

  if (!flowRes.data) notFound();

  const flow = {
    ...flowRes.data,
    nodes: nodesRes.data ?? [],
    edges: edgesRes.data ?? [],
  };

  return <ChatbotCanvas flow={flow} />;
}

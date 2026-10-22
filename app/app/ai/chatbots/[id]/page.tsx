import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { grafoSchema } from "@/lib/chatbot/passos";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";
import { ChatbotCanvas } from "./_components/ChatbotCanvas";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Chatbot" };

export default async function ChatbotEditorPage({ params }: Props) {
  const { id } = await params;

  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");

  const db = await createClient();
  const [flowRes, canais, pessoasRes] = await Promise.all([
    db
      .from("chatbot_flows")
      .select("id, name, is_active, grafo")
      .eq("id", id)
      .eq("organization_id", activeOrg.orgId)
      .maybeSingle(),
    listSelectableChannels(db, activeOrg.orgId),
    db
      .from("user_organizations")
      .select("user_id, role")
      .eq("organization_id", activeOrg.orgId)
      .is("revoked_at", null),
  ]);

  if (!flowRes.data) notFound();

  // Desenho gravado fora do formato (ou vazio): abre em branco, sem quebrar a tela.
  const grafo = grafoSchema.safeParse(flowRes.data.grafo);

  const pessoas = (pessoasRes.data ?? []).filter((p) => p.role !== "viewer");
  const nomes = await nomesDosAtendentes(pessoas.map((p) => String(p.user_id)));

  return (
    <ChatbotCanvas
      flow={{
        id: flowRes.data.id,
        name: flowRes.data.name,
        is_active: flowRes.data.is_active,
        grafo: grafo.success ? grafo.data : { nodes: [], edges: [] },
      }}
      opcoes={{
        canais: canais.map((c) => ({
          id: c.id,
          nome: c.phone_number ? `${c.display_name} (${c.phone_number})` : c.display_name,
        })),
        atendentes: pessoas.map((p) => ({
          id: String(p.user_id),
          nome: nomes.get(String(p.user_id)) ?? `${String(p.user_id).slice(0, 8)} · ${p.role}`,
        })),
      }}
    />
  );
}

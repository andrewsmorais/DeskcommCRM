import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { verificarRecursoDoPlano } from "@/lib/billing/acesso";
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
  const [flowRes, canais, pessoasRes, followupsRes, fluxosRes, tiposRes, funisRes, etapasRes] =
    await Promise.all([
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
      db
        .from("followup_flow_pointers")
        .select("id, name, surface")
        .eq("organization_id", activeOrg.orgId)
        .eq("status", "active")
        .neq("surface", "atendimento")
        .order("name"),
      db
        .from("chatbot_flows")
        .select("id, name, is_active")
        .eq("organization_id", activeOrg.orgId)
        .order("name"),
      db
        .from("calendar_event_types")
        .select("id, name, is_active")
        .eq("organization_id", activeOrg.orgId)
        .order("name"),
      db
        .from("crm_pipelines")
        .select("id, name")
        .eq("organization_id", activeOrg.orgId)
        .eq("is_archived", false)
        .order("position"),
      db
        .from("crm_stages")
        .select("id, name, pipeline_id")
        .eq("organization_id", activeOrg.orgId)
        .eq("is_archived", false)
        .order("position"),
    ]);

  if (!flowRes.data) notFound();

  // A paleta marca os passos do "Chatbot avançado" quando o plano não os inclui
  // (Essencial). Quem barra de verdade é a rota que grava o desenho.
  const avancadoLiberado = (await verificarRecursoDoPlano(activeOrg.orgId, "chatbot_avancado")).ok;

  // Desenho gravado fora do formato (ou vazio): abre em branco, sem quebrar a tela.
  const grafo = grafoSchema.safeParse(flowRes.data.grafo);

  const pessoas = (pessoasRes.data ?? []).filter((p) => p.role !== "viewer");
  const nomes = await nomesDosAtendentes(pessoas.map((p) => String(p.user_id)));

  return (
    <ChatbotCanvas
      avancadoLiberado={avancadoLiberado}
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
        followups: (followupsRes.data ?? []).map((f) => ({
          id: String(f.id),
          nome: String(f.name),
        })),
        fluxoAtual: flowRes.data.id,
        fluxos: (fluxosRes.data ?? []).map((f) => ({
          id: String(f.id),
          nome: String(f.name),
          ligado: Boolean(f.is_active),
        })),
        tiposDeAtendimento: (tiposRes.data ?? []).map((tipo) => ({
          id: String(tipo.id),
          nome: String(tipo.name),
          ativo: Boolean(tipo.is_active),
        })),
        funis: (funisRes.data ?? []).map((f) => ({
          id: String(f.id),
          nome: String(f.name),
          etapas: (etapasRes.data ?? [])
            .filter((e) => e.pipeline_id === f.id)
            .map((e) => ({ id: String(e.id), nome: String(e.name) })),
        })),
      }}
    />
  );
}

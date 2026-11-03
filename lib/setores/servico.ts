/**
 * Setores de atendimento (migration 0496): a regra que a API, a tela e o
 * chatbot usam. Um lugar só para "o que é um setor válido" e "o que acontece
 * quando a conversa vai para um setor".
 *
 * Transferir para um setor é passar para PESSOAS daquele setor: a IA fica
 * calada, a conversa entra na fila e a Distribuição de atendimento só a entrega
 * a membros do setor (lib/routing/eligibles.ts). A ordem importa:
 *   1. grava o setor e marca a passagem para humanos (`last_handoff_at`,
 *      `bot_silenced_until = infinity`) — sem isso, soltar o dono no passo 2
 *      devolveria a conversa ao automático (fn_conversation_assign, 0173);
 *   2. solta o dono se ele NÃO é membro do setor;
 *   3. pede a distribuição de novo (`fn_request_channel_routing`), que só age
 *      em conversa sem dono e aberta.
 * Tirar o setor (null) só limpa a marca — não muda dono nem quem atende.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const setorInputSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  descricao: z.string().trim().max(300).nullable().optional(),
  membros: z.array(z.string().uuid()).max(200).default([]),
});
export type SetorInput = z.infer<typeof setorInputSchema>;

export type SetorComMembros = {
  id: string;
  nome: string;
  descricao: string | null;
  membros: string[];
};

/** Os setores da organização com os membros, em ordem de nome. */
export async function listarSetores(
  db: SupabaseClient,
  organizationId: string,
): Promise<SetorComMembros[]> {
  const [{ data: setores, error }, { data: membros, error: erroMembros }] = await Promise.all([
    db
      .from("setores")
      .select("id, nome, descricao")
      .eq("organization_id", organizationId)
      .order("nome"),
    db.from("setor_membros").select("setor_id, user_id").eq("organization_id", organizationId),
  ]);
  if (error) throw new Error(error.message);
  if (erroMembros) throw new Error(erroMembros.message);
  const porSetor = new Map<string, string[]>();
  for (const m of (membros ?? []) as { setor_id: string; user_id: string }[]) {
    porSetor.set(m.setor_id, [...(porSetor.get(m.setor_id) ?? []), m.user_id]);
  }
  return ((setores ?? []) as { id: string; nome: string; descricao: string | null }[]).map((s) => ({
    ...s,
    membros: porSetor.get(s.id) ?? [],
  }));
}

/**
 * Só atendente de verdade entra num setor: membro ativo (não revogado) com
 * papel de atendimento. Devolve os ids recusados (vazio = todos servem).
 */
export async function membrosRecusados(
  admin: SupabaseClient,
  organizationId: string,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .is("revoked_at", null)
    .in("user_id", ids);
  if (error) throw new Error(error.message);
  const validos = new Set(
    ((data ?? []) as { user_id: string; role: string }[])
      .filter((r) => r.role !== "viewer")
      .map((r) => r.user_id),
  );
  return ids.filter((id) => !validos.has(id));
}

/** Troca a lista de membros do setor pela nova (client do usuário: a RLS exige gerente). */
export async function gravarMembros(
  db: SupabaseClient,
  organizationId: string,
  setorId: string,
  membros: string[],
): Promise<void> {
  const { error: erroApagar } = await db
    .from("setor_membros")
    .delete()
    .eq("organization_id", organizationId)
    .eq("setor_id", setorId);
  if (erroApagar) throw new Error(erroApagar.message);
  const unicos = [...new Set(membros)];
  if (unicos.length === 0) return;
  const { error } = await db
    .from("setor_membros")
    .insert(
      unicos.map((user_id) => ({ organization_id: organizationId, setor_id: setorId, user_id })),
    );
  if (error) throw new Error(error.message);
}

export type ResultadoDaTransferencia =
  | { ok: true; soltouDono: boolean; setorAnterior: string | null }
  | { ok: false; erro: "conversa_nao_encontrada" | "setor_nao_encontrado" };

/** Põe a conversa num setor (ou tira, com null). `admin` = service role; quem chama já autorizou. */
export async function transferirParaSetor(
  admin: SupabaseClient,
  input: { organizationId: string; conversationId: string; setorId: string | null },
): Promise<ResultadoDaTransferencia> {
  const { organizationId, conversationId, setorId } = input;
  const { data: conv, error } = await admin
    .from("conversations")
    .select("id, status, assigned_to_user_id, setor_id")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const conversa = conv as {
    id: string;
    status: string;
    assigned_to_user_id: string | null;
    setor_id: string | null;
  } | null;
  if (!conversa) return { ok: false, erro: "conversa_nao_encontrada" };

  if (setorId === null) {
    const { error: e } = await admin
      .from("conversations")
      .update({ setor_id: null, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("id", conversationId);
    if (e) throw new Error(e.message);
    return { ok: true, soltouDono: false, setorAnterior: conversa.setor_id };
  }

  const { data: setor, error: erroSetor } = await admin
    .from("setores")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", setorId)
    .maybeSingle();
  if (erroSetor) throw new Error(erroSetor.message);
  if (!setor) return { ok: false, erro: "setor_nao_encontrado" };

  let donoEhDoSetor = false;
  if (conversa.assigned_to_user_id) {
    const { data: m, error: erroMembro } = await admin
      .from("setor_membros")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("setor_id", setorId)
      .eq("user_id", conversa.assigned_to_user_id)
      .maybeSingle();
    if (erroMembro) throw new Error(erroMembro.message);
    donoEhDoSetor = Boolean(m);
  }

  // 1. setor + passagem para humanos (a IA fica calada nesta conversa). O
  // `status` não muda: quem manda é `comando_da_conversa`, e a trava do robô
  // (`bot_silenced_until` no futuro) já a põe como "aguardando" na fila humana
  // (tests/unit/fila-tem-uma-definicao-so.test.ts proíbe decidir por status).
  const agora = new Date().toISOString();
  const { error: erroUpdate } = await admin
    .from("conversations")
    .update({
      setor_id: setorId,
      bot_silenced_until: "infinity",
      last_handoff_at: agora,
      last_handoff_reason: "setor",
      active_ai_agent_id: null,
      active_intent: null,
      active_agent_set_at: null,
      updated_at: agora,
    })
    .eq("organization_id", organizationId)
    .eq("id", conversationId);
  if (erroUpdate) throw new Error(erroUpdate.message);

  // 2. dono de fora do setor solta a conversa.
  let soltouDono = false;
  if (conversa.assigned_to_user_id && !donoEhDoSetor) {
    const { error: erroSoltar } = await admin.rpc("fn_conversation_assign", {
      p_organization_id: organizationId,
      p_conversation_id: conversationId,
      p_to_user_id: null as unknown as string,
      p_reason: "release",
      p_enforce_expected: false,
    });
    if (erroSoltar) throw new Error(erroSoltar.message);
    soltouDono = true;
  }

  // 3. a distribuição escolhe alguém do setor (só age se ficou sem dono).
  const { error: erroFila } = await admin.rpc("fn_request_channel_routing", {
    p_org: organizationId,
    p_conversation: conversationId,
  });
  if (erroFila) throw new Error(erroFila.message);

  return { ok: true, soltouDono, setorAnterior: conversa.setor_id };
}

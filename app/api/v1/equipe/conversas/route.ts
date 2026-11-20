/**
 * GET /api/v1/equipe/conversas — a lista do chat interno da equipe: a sala
 * Geral e uma conversa direta com cada pessoa da equipe, com a última
 * mensagem e quantas não lidas. Todo membro da organização (até "Somente
 * leitura") conversa com a equipe.
 *
 * As mensagens são lidas com o cliente do USUÁRIO: a RLS (migration 0515) é
 * quem garante que a conversa direta dos outros nunca entra na conta.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { chaveDaMensagem, contarNaoLidas, previa, SALA_GERAL, type MensagemDaEquipe } from "@/lib/equipe/chat";
import { createClient } from "@/lib/supabase/server";

import { membrosDaEquipe } from "../_membros";

export const dynamic = "force-dynamic";

/** Quanto do histórico recente entra na conta de não lidas e da última mensagem. */
const JANELA = 1000;

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const eu = authz.user.id;
  const orgId = authz.org.orgId;

  const supabase = await createClient();
  const [membros, { data: msgs, error }, { data: leituras }] = await Promise.all([
    membrosDaEquipe(orgId),
    supabase
      .from("equipe_mensagens")
      .select("id, autor_user_id, destinatario_user_id, corpo, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(JANELA),
    supabase.from("equipe_leituras").select("conversa, lida_ate").eq("organization_id", orgId).eq("user_id", eu),
  ]);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const mensagens = (msgs ?? []) as MensagemDaEquipe[];
  const lidas = Object.fromEntries(
    ((leituras ?? []) as Array<{ conversa: string; lida_ate: string }>).map((l) => [l.conversa, l.lida_ate]),
  );
  const desde = membros.find((m) => m.user_id === eu)?.desde ?? new Date().toISOString();
  const naoLidas = contarNaoLidas(mensagens, eu, lidas, desde);

  const ultima: Record<string, MensagemDaEquipe> = {};
  for (const m of mensagens) {
    const chave = chaveDaMensagem(m, eu);
    if (chave && !ultima[chave]) ultima[chave] = m;
  }
  const nomes = Object.fromEntries(membros.map((m) => [m.user_id, m.nome]));
  const resumo = (chave: string) => {
    const u = ultima[chave];
    return u
      ? { texto: previa(u.corpo), quando: u.created_at, autor: u.autor_user_id === eu ? "eu" : (nomes[u.autor_user_id] ?? "") }
      : null;
  };

  const diretas = membros
    .filter((m) => m.user_id !== eu)
    .map((m) => ({ chave: m.user_id, nome: m.nome, ultima: resumo(m.user_id), nao_lidas: naoLidas[m.user_id] ?? 0 }))
    .sort((a, b) => (b.ultima?.quando ?? "").localeCompare(a.ultima?.quando ?? "") || a.nome.localeCompare(b.nome));

  const geral = { chave: SALA_GERAL, nome: "Geral", ultima: resumo(SALA_GERAL), nao_lidas: naoLidas[SALA_GERAL] ?? 0 };
  const total = geral.nao_lidas + diretas.reduce((s, d) => s + d.nao_lidas, 0);
  return ok({ eu, conversas: [geral, ...diretas], nao_lidas: total }, { requestId });
}

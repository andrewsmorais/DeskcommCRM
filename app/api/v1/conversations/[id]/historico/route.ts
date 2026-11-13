/**
 * GET /api/v1/conversations/[id]/historico?formato=txt|pdf — baixar o
 * histórico da conversa, como na Umbler Talk.
 *
 * Quem baixa é quem ENXERGA a conversa: conversa e mensagens são lidas com o
 * client da sessão (a RLS aplica privacidade e o modo de visibilidade). Só as
 * mensagens — notas internas ficam de fora. Até 5.000 mensagens (as mais
 * recentes). Sai dado pessoal do sistema, então fica na auditoria
 * (`conversation.history_exported`).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  historicoEmTexto,
  linhasDoHistorico,
  quandoNoFuso,
  type MensagemDoHistorico,
} from "@/lib/conversas/historico";
import { historicoEmPdf } from "@/lib/conversas/historico-pdf";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMITE = 5000;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const { id } = await ctx.params;
  const formato = new URL(req.url).searchParams.get("formato") === "pdf" ? "pdf" : "txt";

  const supabase = await createClient();
  const { data: conversa } = await supabase
    .from("conversations")
    .select("id, organization_id, contacts:contact_id(name, display_name, phone_number, is_anonymized)")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const contato = (conversa as unknown as {
    contacts: { name: string | null; display_name: string | null; phone_number: string | null } | null;
  }).contacts;

  const { data: mensagens, error } = await supabase
    .from("messages")
    .select("type, direction, body, sent_via, sent_by_user_id, sent_at, created_at, revoked_at, metadata")
    .eq("organization_id", authz.org.orgId)
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(LIMITE);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const lista = ((mensagens ?? []) as MensagemDoHistorico[]).reverse();

  // Nomes de quem da equipe escreveu (só membros desta organização).
  const ids = [...new Set(lista.map((m) => m.sent_by_user_id).filter((x): x is string => !!x))];
  const nomesDaEquipe: Record<string, string> = {};
  if (ids.length > 0) {
    const admin = createAdminClient();
    const { data: membros } = await admin
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", authz.org.orgId)
      .in("user_id", ids);
    for (const m of (membros ?? []) as { user_id: string }[]) {
      const { data } = await admin.auth.admin.getUserById(m.user_id).catch(() => ({ data: { user: null } }));
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const nome = typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : data.user?.email;
      if (nome) nomesDaEquipe[m.user_id] = nome;
    }
  }

  const { data: org } = await supabase.from("organizations").select("timezone").eq("id", authz.org.orgId).maybeSingle();
  const fuso = (org as { timezone?: string | null } | null)?.timezone || "America/Sao_Paulo";
  const nomeDoContato = rotuloDoContato(contato, t);
  const linhas = linhasDoHistorico(lista, { nomeDoContato, nomesDaEquipe, fuso });
  const geradoEm = quandoNoFuso(new Date().toISOString(), fuso);
  const truncado = lista.length >= LIMITE;

  void audit({
    action: "conversation.history_exported",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "conversation",
    resourceId: id,
    requestId,
    metadata: { formato, mensagens: lista.length },
  });

  const arquivo = `historico-${nomeDoContato.normalize("NFD").replace(/[^\w-]+/g, "_").slice(0, 40)}`;
  if (formato === "txt") {
    const corpo = historicoEmTexto(linhas, { nomeDoContato, telefone: contato?.phone_number ?? null, geradoEm, truncado });
    return new Response(`﻿${corpo}`, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${arquivo}.txt"`,
        "x-request-id": requestId,
        "cache-control": "no-store",
      },
    });
  }
  const pdf = await historicoEmPdf({
    titulo: `Histórico da conversa com ${nomeDoContato}`,
    sub: `${contato?.phone_number ? `${contato.phone_number} · ` : ""}Gerado em ${geradoEm} · ${lista.length} mensagens${truncado ? " (as mais recentes)" : ""}`,
    linhas,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${arquivo}.pdf"`,
      "x-request-id": requestId,
      "cache-control": "no-store",
    },
  });
}

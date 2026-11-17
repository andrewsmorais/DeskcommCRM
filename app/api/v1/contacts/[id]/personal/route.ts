import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";
import { fail, ok } from "@/lib/api/wrappers";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * CONTATO PESSOAL — marcar e desmarcar (vindo do produto original, spec 21).
 *
 * Quem usa o mesmo WhatsApp para o negócio e para a vida marca a ficha da mãe,
 * do amigo, do sócio como PESSOAL: nada automático sai para ela — o agente não
 * responde (`readStopFlags`), a prospecção não aborda (`lib/prospecting/guard.ts`)
 * e a campanha não envia (`lib/campanhas/elegibilidade.ts`). Marcar tira o
 * contato das campanhas que ainda não o alcançaram, com a saída `personal`.
 *
 * Só gerente ou dono marca. A organização vem da sessão ou do token, nunca do
 * corpo. Repetir o gesto não gera nova linha de auditoria.
 *
 * Diferente do original, aqui a marca NÃO esconde a ficha da operação (a lista
 * de contatos e a caixa de entrada continuam mostrando): ela só veta o que é
 * automático.
 */
export async function POST(req: NextRequest, ctx: Context): Promise<Response> {
  // A guarda de efeito fica DENTRO de cada handler de propósito: o gate
  // `suporte-cobertura-de-efeitos` lê o corpo de POST/DELETE e não enxerga
  // através de uma função compartilhada — indireção opaca falharia aberto.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  return trocar(req, ctx, true);
}

export async function DELETE(req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  return trocar(req, ctx, false);
}

async function trocar(req: NextRequest, ctx: Context, ligar: boolean): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  // Sessão OU token de integração (Spec 33, R2): `manager` na sessão; no token,
  // `mcp:write` e papel `manager` na linha dele. A organização sai da sessão ou
  // da LINHA DO TOKEN, nunca do path nem do corpo.
  const authz = await resolveAuthDual(req, {
    requestId,
    resource: "contacts",
    role: "manager",
    scope: "mcp:write",
  });
  if (!authz.ok) return authz.response;
  // A rota está em PUBLIC_PATHS: o teto de escrita do token é o único que conta.
  const teto = await tetoDeEscritaDoToken(authz, "contacts", requestId);
  if (teto) return teto;
  const t = (texto: string) => traduzir(texto, authz.idioma ?? IDIOMA_PADRAO);

  if (!z.uuid().safeParse(id).success) {
    return fail("validation_failed", t("Contato inválido."), 422, { requestId });
  }

  const orgId = authz.organizationId;
  const admin = createAdminClient();
  // Admin client bypassa RLS: o filtro por organização é PROGRAMÁTICO e
  // obrigatório (CLAUDE.md, anti-pattern 10).
  const { data: contato, error: leituraErro } = await admin
    .from("contacts")
    .select("id, display_name, is_personal")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (leituraErro) {
    return fail("internal_error", t("Não foi possível alterar a marca de contato pessoal."), 500, {
      requestId,
    });
  }
  if (!contato) return fail("not_found", t("Contato não encontrado."), 404, { requestId });

  const jaLigado = (contato as { is_personal?: boolean }).is_personal === true;
  // Idempotente na PROVA (mesma regra do contato pessoal): repetir o gesto não
  // gera nova linha de auditoria, mas o UPDATE roda de novo — ele é a garantia
  // de que uma marca pela metade (ai_opt_out ligado sem force_human) se cura.
  const valores = { is_personal: ligar };

  const { data: alterado, error: updateErro } = await admin
    .from("contacts")
    .update(valores)
    .eq("organization_id", orgId)
    .eq("id", id)
    .select("id, display_name, is_personal")
    .maybeSingle();
  if (updateErro || !alterado) {
    return fail("internal_error", t("Não foi possível alterar a marca de contato pessoal."), 500, {
      requestId,
    });
  }

  if (jaLigado === ligar) {
    return ok({ data: alterado }, { requestId });
  }

  // Quem vira pessoal sai das campanhas que ainda não o alcançaram — com a saída
  // própria (`personal`, 0540), nunca `opted_out`. Best-effort: a marca já vale
  // no envio (a elegibilidade da campanha e a guarda do agente leem a coluna).
  if (ligar) {
    const { error: saidaErro } = await admin
      .from("campaign_recipients")
      .update({ status: "personal", updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("contact_id", id)
      .in("status", ["pending", "queued"]);
    if (saidaErro) {
      // A coluna é a garantia; esta saída só limpa a fila. Não derruba o gesto.
      logger.warn("[contacts.personal] saída das campanhas falhou", {
        contact_id: id,
        error: saidaErro.message,
      });
    }
  }

  await audit({
    action: ligar ? "contacts.personal_marked" : "contacts.personal_unmarked",
    // O id de um token não é pessoa: só a sessão assina como usuário.
    actorUserId: authz.actor.type === "user" ? authz.actor.id : null,
    actorApiTokenId: authz.apiTokenId ?? null,
    organizationId: orgId,
    resourceType: "contact",
    resourceId: id,
    requestId,
    // Sem nome: auditoria é append-only e a anonimização (LGPD) não a alcança —
    // o `contact_id` já identifica (mesma regra do contato pessoal).
    metadata: { contact_id: id, origem: "tela_do_contato" },
  });

  return ok({ data: alterado }, { requestId });
}

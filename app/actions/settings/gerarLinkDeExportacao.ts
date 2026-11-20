"use server";

import { headers } from "next/headers";

import { supportWriteError } from "@/lib/impersonate/support";
import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { caminhoDeExportacao } from "@/lib/exportacao/link";

export type GerarLinkDeExportacaoResult =
  | { ok: true; caminho: string }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "exportacao_indisponivel";
    };

/** O link do botão vale 1 hora: serve para baixar agora, não para guardar. */
const VALIDADE_DO_BOTAO_MS = 60 * 60 * 1000;

/**
 * Gera o link de download da exportação da organização ATIVA.
 *
 * A organização sai de `resolveActiveOrg` (cookie validado no servidor), nunca
 * do input — esta função nem recebe argumentos. Quem pode: admin da empresa (ou
 * admin da plataforma fora de sessão de suporte), e com a verificação em duas
 * etapas em dia: o arquivo leva a base inteira de contatos.
 */
export async function gerarLinkDeExportacao(): Promise<GerarLinkDeExportacaoResult> {
  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden_role" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const caminho = caminhoDeExportacao(activeOrg.orgId, new Date(Date.now() + VALIDADE_DO_BOTAO_MS));
  if (!caminho) return { ok: false, error: "exportacao_indisponivel" };

  const hdrs = await headers();
  await audit({
    action: "org.exportacao_gerada",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
    bypassedRls: false,
    actingAsPlatformAdmin: authUser.is_platform_admin,
  });

  return { ok: true, caminho };
}

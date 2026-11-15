"use server";

import { supportWriteError } from "@/lib/impersonate/support";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  interfaceSettingsSchema,
  interfaceTemDestino,
  type InterfaceSettings,
} from "@/lib/navigation/interface";

export type InterfaceDaEmpresaResult = { ok: true } | { ok: false; error: string };

/**
 * Grava as portas da EMPRESA (issue #1341) — o universo de itens do menu lateral
 * da instalação inteira. Cada vínculo continua escolhendo MENOS dentro dele
 * (`PATCH /api/v1/team/:user_id/interface`); ninguém abre além daqui, porque a
 * leitura resolve a INTERSEÇÃO (`combinarInterfaces`).
 *
 * Isto é configuração de APRESENTAÇÃO, como a escolha por vínculo: não concede
 * nem tira acesso. Papel, RLS e permissões seguem decidindo o que cada pessoa
 * alcança, e desmarcar uma área aqui apenas a esconde — link contextual, aviso e
 * busca continuam abrindo o que o papel autoriza.
 */
export async function atualizarInterfaceDaEmpresa(input: InterfaceSettings): Promise<InterfaceDaEmpresaResult> {
  const parsed = interfaceSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed" };

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  // Sessão de suporte é somente-leitura: quem está do outro lado não muda o menu
  // da instalação (mesma trava de `updateTenant` e da rota por vínculo).
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }

  // Mesma guarda da escolha por vínculo: recusa a seleção que deixaria a empresa
  // sem NENHUMA área além das essenciais. As essenciais continuariam aparecendo
  // de qualquer forma, então essa seleção não é escolha — é menu vazio.
  if (!interfaceTemDestino(parsed.data, activeOrg.role)) {
    return { ok: false, error: "sem_area" };
  }

  /**
   * A ESCRITA EM `organizations` VAI PELO ADMIN CLIENT — pelo mesmo motivo medido
   * em `updateTenant` (issue #144): a única policy de escrita da tabela é
   * `orgs_write_platform_admin`, então o UPDATE de um admin de organização pelo
   * client de sessão casa ZERO linhas e o PostgREST devolve sucesso. O gate
   * continua sendo o de cima (papel resolvido de fonte confiável) e o filtro por
   * organização é explícito — a organização vem da SESSÃO, nunca do corpo.
   */
  const supabase = createAdminClient();
  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  // O MENU NUNCA GRAVA A TRAVA DO INBOX: as duas moram no mesmo campo, e o
  // editor do menu monta o objeto do zero. O valor gravado da trava fica.
  const { data: atual } = await supabase
    .from("organizations")
    .select("interface_settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const travaGravada =
    (atual as { interface_settings?: Record<string, unknown> | null } | null)?.interface_settings
      ?.bloquearAteAssumir === true;
  const { bloquearAteAssumir: _doInput, ...menu } = parsed.data;
  const { error } = await supabase
    .from("organizations")
    .update({ interface_settings: { ...menu, ...(travaGravada ? { bloquearAteAssumir: true } : {}) } })
    .eq("id", activeOrg.orgId);
  if (error) return { ok: false, error: "internal_error" };

  await audit({
    action: "org.interface_changed",
    organizationId: activeOrg.orgId,
    actorUserId: authUser.id,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    requestId,
    ip,
    userAgent,
    metadata: { fields_changed: ["interface_settings"], interface_settings: parsed.data },
  });

  // Mesmo evento que `updateTenant` publica: quem escuta "a empresa mudou" não
  // deveria descobrir por recarregar a tela. É LITERALMENTE o mesmo TIPO — um
  // tipo novo (`org.interface_changed`) não teria assinante, não entraria no
  // vocabulário de `fn_event_log_e_registro` (migration 0239) e o fato nasceria
  // pendente para sempre; o detalhe fino de QUAL campo mudou fica no `audit_log`
  // (`action: "org.interface_changed"`), que é onde a pergunta é feita.
  await supabase
    .rpc("emit_event", {
      p_event_type: "org.updated",
      p_entity_kind: "organization",
      p_entity_id: activeOrg.orgId,
      p_payload: { organization_id: activeOrg.orgId },
      p_metadata: { request_id: requestId },
      p_organization_id: activeOrg.orgId,
    })
    .then(({ error: e }) => {
      if (e) console.error("[atualizarInterfaceDaEmpresa] emit_event failed", e.message);
    });

  revalidatePath("/app/settings/tenant");
  // O menu vive no layout do /app: sem isto quem acabou de escolher continuaria
  // vendo o menu antigo até o próximo carregamento completo.
  revalidatePath("/app", "layout");
  return { ok: true };
}

/**
 * Liga e desliga o bloqueio da caixa de mensagem até assumir (vindo do produto
 * original), e SÓ ele: lê o que está gravado e troca a chave, para não desfazer
 * a escolha de menu. Desligar REMOVE a chave. Mesmos portões do menu.
 */
export async function atualizarBloqueioAteAssumir(ligado: boolean): Promise<InterfaceDaEmpresaResult> {
  // Server Action é endpoint público: o tipo do parâmetro não chega ao servidor.
  if (typeof ligado !== "boolean") return { ok: false, error: "validation_failed" };
  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }
  const supabase = createAdminClient();
  const { data: atual, error: erroDeLeitura } = await supabase
    .from("organizations")
    .select("interface_settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  if (erroDeLeitura) return { ok: false, error: "internal_error" };
  const gravada =
    ((atual as { interface_settings?: Record<string, unknown> | null } | null)?.interface_settings ?? {}) as Record<
      string,
      unknown
    >;
  const { bloquearAteAssumir: _anterior, ...resto } = gravada;
  const proxima = ligado ? { ...resto, bloquearAteAssumir: true } : resto;
  const { error } = await supabase
    .from("organizations")
    .update({ interface_settings: Object.keys(proxima).length > 0 ? proxima : null })
    .eq("id", activeOrg.orgId);
  if (error) return { ok: false, error: "internal_error" };
  const hdrs = await headers();
  await audit({
    action: "org.interface_changed",
    organizationId: activeOrg.orgId,
    actorUserId: authUser.id,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
    metadata: { fields_changed: ["interface_settings.bloquearAteAssumir"], bloquear_ate_assumir: ligado },
  });
  revalidatePath("/app/settings/tenant");
  revalidatePath("/app", "layout");
  return { ok: true };
}

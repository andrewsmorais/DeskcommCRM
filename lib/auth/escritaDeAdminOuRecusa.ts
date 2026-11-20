/**
 * A escrita do admin da plataforma, como RESULTADO e não como exceção (vindo do
 * produto original, adaptado). Quem não é admin da plataforma é redirecionado
 * por `requirePlatformAdmin` (que também cobra o segundo fator na sessão de
 * quem o tem); o admin de suporte, só leitura (`scope='support_readonly'`),
 * recebe `forbidden_scope` para a tela dizer por quê.
 */
import { requirePlatformAdmin, type PlatformAdminContext } from "@/lib/auth/requirePlatformAdmin";
import type { RecusaDeEscritaDeAdmin } from "@/lib/auth/recusa-de-escrita-de-admin";

export async function escritaDeAdminOuRecusa(): Promise<
  { ok: true; ctx: PlatformAdminContext } | RecusaDeEscritaDeAdmin
> {
  const ctx = await requirePlatformAdmin();
  if (ctx.platformAdmin.scope !== "full") return { ok: false, error: "forbidden_scope" };
  return { ok: true, ctx };
}

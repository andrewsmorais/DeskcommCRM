"use server";

/**
 * Server Action: start the Nuvemshop OAuth flow for the active org.
 *
 * Resolves auth + active org, validates env config, mints an HMAC-signed state
 * token, sets the bind cookie (signed over the state's nonce), then redirects to
 * Nuvemshop's authorize URL.
 *
 * ⚠️ O COOKIE DE VÍNCULO É O QUE PRENDE A VOLTA A ESTE NAVEGADOR. Sem ele, o
 * admin de uma organização X guardava a URL de consentimento com o `state` de X
 * e fazia o dono de outra loja aprová-la: a loja da vítima entrava na
 * organização X, com os webhooks de pedido dela. O callback recusa sem o
 * cookie, antes de trocar o código (ver `lib/auth/vinculo-oauth.ts`). If credentials aren't
 * configured (dev / fresh deploy), returns `{ ok: false, error: "not_configured" }`
 * so the UI can render the "configure env" card without crashing.
 */

import { randomBytes } from "node:crypto";

import { supportWriteError, authenticatedSessionId } from "@/lib/impersonate/support";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { opcoesDoVinculo } from "@/lib/auth/cookie-de-vinculo";
import { assinarVinculo } from "@/lib/auth/vinculo-oauth";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { buildAuthorizeUrl } from "@/lib/nuvemshop/oauth";
import { getConfig } from "@/lib/nuvemshop/config";
import {
  CAMINHO_DO_CALLBACK_DA_LOJA,
  issueState,
  NOME_DO_VINCULO_DA_LOJA,
} from "@/lib/nuvemshop/state";

export type ConnectResult = {
  ok: false;
  error: "auth_required" | "no_active_org" | "forbidden" | "not_configured";
};

export async function connectNuvemshop(): Promise<ConnectResult> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "auth_required" };

  if (supportWriteError(user.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return { ok: false, error: "no_active_org" };

  // Only `admin` can wire up integrations (RBAC). `manager`/`agent`/`viewer`
  // see the UI read-only.
  if (activeOrg.role !== "admin" && !user.is_platform_admin) {
    return { ok: false, error: "forbidden" };
  }

  const cfg = getConfig();
  if (!cfg) return { ok: false, error: "not_configured" };

  // Sem chave de assinatura não há vínculo verificável — e a volta recusaria
  // sempre, depois de a pessoa já ter aprovado na loja. Melhor parar aqui.
  const chaveDoVinculo = chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDaLoja);
  if (!chaveDoVinculo) return { ok: false, error: "not_configured" };

  // O nonce é gerado AQUI porque precisa ser conhecido duas vezes: vai dentro do
  // `state`, que viaja pela URL da loja, e assina o cookie, que fica no navegador.
  const nonce = randomBytes(16).toString("hex");
  const state = issueState(
    activeOrg.orgId,
    { userId: user.id, authSessionId: await authenticatedSessionId() },
    nonce,
  );
  (await cookies()).set(
    NOME_DO_VINCULO_DA_LOJA,
    assinarVinculo(nonce, chaveDoVinculo),
    opcoesDoVinculo(CAMINHO_DO_CALLBACK_DA_LOJA),
  );
  const url = buildAuthorizeUrl({ appId: cfg.appId, state });
  redirect(url);
}

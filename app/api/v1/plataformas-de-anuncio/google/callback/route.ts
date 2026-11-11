/**
 * GET /api/v1/plataformas-de-anuncio/google/callback — a volta do
 * consentimento do Google Ads.
 *
 * Confere o `state`, troca o código por tokens, cifra e grava só o refresh
 * token. Irmã de `app/api/v1/agenda/google/callback/route.ts`, mais enxuta:
 * não há escopo opcional para conferir (um só, obrigatório) e não há
 * descoberta de conta primária — a conta e a ação de conversão são digitadas
 * à mão na tela, depois deste passo.
 *
 * ⚠️ O VÍNCULO E A QUEIMA DO NONCE SÃO DA IRMÃ, e esta rota não os tinha. A
 * volta é pública e o `state` não diz QUEM o apresenta: o admin de uma
 * organização X fazia outra pessoa aprovar a URL com o `state` de X, e o
 * refresh token do Google Ads dela era gravado em X — quantas vezes quisesse.
 *
 * É retorno de NAVEGADOR: todo desfecho volta para
 * `/app/settings/conversoes` com `?erro=<código>` ou `?ok=1`, nunca JSON.
 *
 * ─── A ORDEM DOS PASSOS É CONTRATO — mesma disciplina do irmão ────────────
 * 1. `error` na query ANTES de tudo: "Cancelar" não é falha.
 * 2. `state` ANTES do `code`: sem organização não há o que auditar.
 * 3. VÍNCULO antes da queima: queimar primeiro daria a quem tem um `state`
 *    vazado um botão de negação de serviço contra o dono legítimo.
 * 4. QUEIMA do nonce (`calendar_oauth_nonces`, prefixo `google_ads:`) ANTES
 *    da troca: nunca gasta o `code` (uso único) num retorno recusado.
 * 5. cifra ANTES do upsert: gravar o refresh token em claro por um instante
 *    é gravá-lo em claro.
 *
 * Sem cookie, cookie de outro navegador e `state` repetido voltam com o MESMO
 * `estado_invalido`: distinguir contaria a quem ataca de quem é o `state`.
 */
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { opcoesDoVinculo } from "@/lib/auth/cookie-de-vinculo";
import { vinculoConfere } from "@/lib/auth/vinculo-oauth";
import {
  CAMINHO_DO_CALLBACK,
  configuracaoDoGoogleAds,
} from "@/lib/plataformas-de-anuncio/google/config";
import {
  NOME_DO_VINCULO_DE_ANUNCIOS,
  verificarEstado,
} from "@/lib/plataformas-de-anuncio/google/estado";
import { trocarCodigoPorToken } from "@/lib/plataformas-de-anuncio/google/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

function voltar(base: string, params: Record<string, string>): NextResponse {
  const url = new URL("/app/settings/conversoes", base || "http://localhost:3000");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resposta = NextResponse.redirect(url);
  // Toda volta passa por aqui — o cookie de vínculo morre com o fluxo.
  resposta.cookies.set(NOME_DO_VINCULO_DE_ANUNCIOS, "", opcoesDoVinculo(CAMINHO_DO_CALLBACK, 0));
  return resposta;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const base = env.NEXT_PUBLIC_APP_URL;
  const url = new URL(req.url);

  // 1. Cancelamento não é erro.
  if (url.searchParams.get("error")) {
    return voltar(base, { erro: "cancelado" });
  }

  // 2. `state` antes do `code`. A chave NÃO é `INTERNAL_SECRET` — ele é o
  // Bearer do agendador externo (ver `lib/auth/chave-de-assinatura.ts`). Sob
  // `try` porque `verificarEstado` lança com chave curta, e a rota é pública:
  // um throw seria 500 arrancável por qualquer anônimo.
  let estado: ReturnType<typeof verificarEstado> = null;
  try {
    estado = verificarEstado(url.searchParams.get("state"), {
      segredo: chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDeAnuncios),
      agora: new Date(),
    });
  } catch {
    return voltar(base, { erro: "estado_invalido" });
  }
  if (!estado) return voltar(base, { erro: "estado_invalido" });

  // 3. Quem voltou é quem saiu — antes da queima.
  const vinculo = req.cookies.get(NOME_DO_VINCULO_DE_ANUNCIOS)?.value;
  const chaveDoVinculo = chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDeAnuncios);
  if (!vinculoConfere(vinculo, estado.nonce, chaveDoVinculo)) {
    logger.warn("[plataformas-de-anuncio.google.callback] vínculo ausente ou não confere", {
      organizationId: estado.organizationId,
    });
    return voltar(base, { erro: "estado_invalido" });
  }

  const code = url.searchParams.get("code");
  if (!code) return voltar(base, { erro: "sem_codigo" });

  const app = configuracaoDoGoogleAds(estado.api);
  if (!app) return voltar(base, { erro: "google_ads_nao_configurado" });

  const admin = createAdminClient();

  // 4. Queima do nonce — a tabela nasceu para a Agenda e serve aos três
  // retornos; o prefixo separa os espaços de nome. Qualquer erro recusa: sem
  // conseguir gravar não há como garantir uso único.
  const { error: erroDoNonce } = await admin.from("calendar_oauth_nonces").insert({
    nonce: `google_ads:${estado.nonce}`,
    organization_id: estado.organizationId,
    user_id: estado.userId,
    expira_em: new Date(estado.expiraEmMs).toISOString(),
  });
  if (erroDoNonce) {
    logger.warn("[plataformas-de-anuncio.google.callback] state recusado na queima do nonce", {
      organizationId: estado.organizationId,
      motivo: erroDoNonce.code === "23505" ? "state_reutilizado" : "nonce_indisponivel",
    });
    return voltar(base, { erro: "estado_invalido" });
  }

  // Troca — só depois do state confirmado, do vínculo e da queima.
  const leitura = await trocarCodigoPorToken(app, code, { agora: new Date() });
  if (!leitura.ok) {
    logger.error("[plataformas-de-anuncio.google.callback] troca de código falhou", {
      organizationId: estado.organizationId,
      motivo: leitura.motivo,
      detalhe: leitura.detalhe.slice(0, 300),
    });
    return voltar(base, { erro: "troca_falhou" });
  }
  if (!leitura.token.refresh_token) {
    // Reconexão sem `prompt=consent` ter funcionado (extremamente raro, já que
    // sempre pedimos): sem refresh token não há o que gravar — a conexão
    // funcionaria por uma hora e morreria calada.
    return voltar(base, { erro: "sem_refresh_token" });
  }

  // 5. Cifra antes do upsert.
  const cifrado = await encryptWebhookSecret(admin, leitura.token.refresh_token);
  if (!cifrado) return voltar(base, { erro: "cifra_indisponivel" });

  const { error } = await admin.from("ad_platform_connections").upsert(
    {
      organization_id: estado.organizationId,
      platform: "google_ads",
      google_refresh_token_encrypted: cifrado,
      google_api: estado.api,
      updated_by: estado.userId,
    },
    { onConflict: "organization_id,platform" },
  );
  if (error) {
    logger.error("[plataformas-de-anuncio.google.callback] upsert falhou", {
      organizationId: estado.organizationId,
      detalhe: error.message,
    });
    return voltar(base, { erro: "erro_ao_gravar" });
  }

  await audit({
    action: "ad_platform_connection.updated",
    actorUserId: estado.userId,
    organizationId: estado.organizationId,
    resourceType: "ad_platform_connections",
    resourceId: null,
    metadata: { platform: "google_ads" },
  });

  return voltar(base, { ok: "1" });
}

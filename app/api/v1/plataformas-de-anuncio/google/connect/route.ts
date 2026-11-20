/**
 * GET /api/v1/plataformas-de-anuncio/google/connect — começa a conexão da
 * organização com o Google Ads.
 *
 * Manda o admin ao consentimento do Google com um `state` assinado que carrega
 * de qual ORGANIZAÇÃO é a conexão. Irmã de `app/api/v1/agenda/google/connect/route.ts`,
 * mais simples: a conexão é da organização, não da pessoa (a linha em
 * `ad_platform_connections` é `unique (organization_id, platform)`).
 *
 * ⚠️ O `state` NÃO basta, e esta rota dizia que bastava. Ele prova que o
 * servidor o emitiu, não QUEM volta com ele: o admin de uma organização X
 * guardava a URL de consentimento com o `state` de X e fazia outra pessoa
 * aprová-la — o refresh token do Google Ads DELA ia para X. Por isso a ida grava
 * o cookie de vínculo, assinado sobre o nonce do `state`
 * (`lib/auth/vinculo-oauth.ts`), e a volta recusa sem ele.
 *
 * Piso de papel: `admin`, mesmo piso de `updateAdPlatformConnection.ts` (a
 * conexão da Meta) — é a conta de anúncios do negócio, não uma preferência de
 * atendente individual.
 *
 * Todo desfecho volta pra tela de Configurações › Conversões com
 * `?erro=<código>`, nunca JSON — este endereço é aberto pelo navegador, num
 * clique de botão.
 */
import { randomBytes } from "node:crypto";

import { z } from "zod";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { NextResponse, type NextRequest } from "next/server";

import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { opcoesDoVinculo } from "@/lib/auth/cookie-de-vinculo";
import { assinarVinculo } from "@/lib/auth/vinculo-oauth";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import {
  CAMINHO_DO_CALLBACK,
  configuracaoDoGoogleAds,
} from "@/lib/plataformas-de-anuncio/google/config";
import {
  emitirEstado,
  NOME_DO_VINCULO_DE_ANUNCIOS,
} from "@/lib/plataformas-de-anuncio/google/estado";
import { montarUrlDeConsentimento } from "@/lib/plataformas-de-anuncio/google/oauth";

export const dynamic = "force-dynamic";

function voltarComErro(codigo: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(`/app/settings/conversoes?erro=${codigo}`, base));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = req.headers.get("x-request-id") ?? undefined;

  const autorizado = await requireRole("admin", { requestId, resource: "ad_platform_connections" });
  if (!autorizado.ok) return autorizado.response;
  const { user, org } = autorizado;

  const escolha = z
    .enum(["google_ads", "data_manager"])
    .safeParse(new URL(req.url).searchParams.get("api") ?? "data_manager");
  if (!escolha.success) return voltarComErro("estado_invalido");
  const api = escolha.data;
  const app = configuracaoDoGoogleAds(api);
  if (!app) {
    // Não audita: não houve tentativa de conectar nada, e a instalação sem
    // chave não é um evento da organização — mesma régua do irmão da Agenda.
    return voltarComErro("google_ads_nao_configurado");
  }

  // O nonce é gerado AQUI porque precisa ser conhecido duas vezes: dentro do
  // `state`, que viaja pela URL do Google, e no cookie de vínculo.
  const nonce = randomBytes(16).toString("base64url");
  const chaveDoVinculo = chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDeAnuncios);
  let state: string;
  try {
    state = emitirEstado(
      { organizationId: org.orgId, userId: user.id, api },
      {
        segredo: chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDeAnuncios),
        agora: new Date(),
        nonce,
      },
    );
  } catch {
    return voltarComErro("estado_invalido");
  }
  // Sem chave não há vínculo verificável, e a volta recusaria sempre — depois
  // de a pessoa já ter aprovado no Google. Melhor parar aqui.
  if (!chaveDoVinculo) return voltarComErro("estado_invalido");

  // Com developer token, a mesma autorização libera criar ações de conversão e
  // ler campanhas pela API do Google Ads (0436).
  const incluirGoogleAds = Boolean(env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
  const resposta = NextResponse.redirect(
    montarUrlDeConsentimento(app, { state, api, incluirGoogleAds }),
  );
  resposta.cookies.set(
    NOME_DO_VINCULO_DE_ANUNCIOS,
    assinarVinculo(nonce, chaveDoVinculo),
    opcoesDoVinculo(CAMINHO_DO_CALLBACK),
  );
  return resposta;
}

import { requireSupportWrite, authenticatedSessionId } from "@/lib/impersonate/support";
/**
 * GET /api/v1/agenda/google/connect — começa a conexão da agenda do Google.
 *
 * Manda a pessoa ao consentimento do Google com um `state` assinado que carrega
 * QUEM está conectando. É a metade de ida; a volta é o `callback` ao lado.
 *
 * ─── Por que a conexão é por PESSOA, e o piso de papel é `agent` ──────────
 *
 * Não é decisão minha: sai do schema. `calendar_connections` tem
 * `unique (organization_id, user_id, provider, account_email)` e a policy de
 * leitura da 0177 é `user_id = auth.uid() or fn_role_at_least(..., 'manager')`
 * — ou seja cada atendente conecta a agenda DELE. E `agent` é o piso porque é
 * exatamente o piso que a mesma migration exige para escrever em
 * `calendar_appointments`: conectar uma agenda existe para alimentar
 * compromissos, e dar a conexão a quem não pode ter compromisso seria oferecer
 * um botão que não leva a lugar nenhum.
 *
 * ─── Desfechos, e por que nenhum deles é JSON ─────────────────────────────
 *
 * Este endereço é aberto pelo NAVEGADOR, num clique de botão. Devolver JSON de
 * erro deixaria a pessoa olhando para um objeto. Todo desfecho — inclusive os
 * de falha — volta para a Agenda com `?erro=<código>`, que é o mesmo contrato
 * do callback da Nuvemshop, e a tela traduz o código para uma frase.
 *
 * A exceção é a falta de sessão e a falta de papel: aí o gate canônico
 * (`requireRole`) responde, porque a resposta dele já é a certa e trocá-la por
 * um redirect esconderia um 401/403 do audit.
 */

import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { requireRole } from "@/lib/auth/require-role";
import {
  CAMINHO_DO_CALLBACK,
  configuracaoDoGoogle,
  origemLocalDosCabecalhos,
} from "@/lib/agenda/google/config";
import { emitirEstado } from "@/lib/agenda/google/estado";
import { assinarVinculo, NOME_DO_VINCULO } from "@/lib/agenda/google/vinculo";
import { opcoesDoVinculo } from "@/lib/auth/cookie-de-vinculo";
import { montarUrlDeConsentimento } from "@/lib/agenda/google/oauth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Volta para a Agenda com um código que a tela sabe traduzir. */
function voltarComErro(codigo: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(`/app/agenda?erro=${codigo}`, base));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = req.headers.get("x-request-id") ?? undefined;

  const autorizado = await requireRole("agent", { requestId, resource: "calendar_connections" });
  if (!autorizado.ok) return autorizado.response;
  const { user, org } = autorizado;

  const app = await configuracaoDoGoogle(origemLocalDosCabecalhos(req.headers) ?? undefined);
  if (!app) {
    // Não audita: não houve tentativa de conectar nada, e encher o audit log de
    // "a instalação não tem chave" é ruído numa tabela que se paga por linha.
    return voltarComErro("google_nao_configurado");
  }

  // O nonce é gerado AQUI (em vez de deixar `emitirEstado` sortear) porque ele
  // precisa ser conhecido duas vezes: vai dentro do `state`, que viaja pela URL
  // do Google, e assina o cookie de vínculo, que fica no navegador. É o par que
  // prova, na volta, que quem voltou é quem saiu.
  const nonce = randomBytes(16).toString("base64url");

  let state: string;
  try {
    state = emitirEstado(
      { organizationId: org.orgId, userId: user.id, authSessionId: await authenticatedSessionId() },
      {
        segredo: chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDaAgenda),
        agora: new Date(),
        nonce,
      },
    );
  } catch {
    // `emitirEstado` recusa segredo curto de propósito: com chave fraca o
    // retorno do Google não seria verificável, e numa instalação com mais de uma
    // réplica o state emitido por um processo não validaria no outro. Falhar
    // aqui é a escolha certa — degradar seria aceitar um retorno que ninguém
    // consegue conferir.
    await audit({
      action: "agenda.google.conexao_falhou",
      organizationId: org.orgId,
      metadata: { reason: "segredo_de_state_indisponivel" },
    });
    return voltarComErro("segredo_indisponivel");
  }

  // `contaSugerida` evita o erro mais comum do fluxo: autorizar com a conta
  // pessoal que já estava logada no navegador e ver a agenda errada aparecer.
  const url = montarUrlDeConsentimento(app, { state, contaSugerida: user.email });

  await audit({
    action: "agenda.google.conexao_iniciada",
    organizationId: org.orgId,
    metadata: { user_id: user.id },
  });

  const resposta = NextResponse.redirect(url);

  // ⚠️ `sameSite: "lax"` É O PONTO DESTE COOKIE, e `secure` nunca é `true`
  // literal — os dois motivos estão em `opcoesDoVinculo`, que os três retornos
  // de OAuth (Agenda, Google Ads, loja) usam na ida e na volta.
  resposta.cookies.set(
    NOME_DO_VINCULO,
    assinarVinculo(nonce, chaveDeAssinatura(ROTULOS_DE_ASSINATURA.vinculoDaAgenda)),
    opcoesDoVinculo(CAMINHO_DO_CALLBACK),
  );

  return resposta;
}

/**
 * A ponte entre a Nuvemshop e a Captação.
 *
 * As outras lojas chegam à Captação por conta própria: o lojista cola o
 * endereço no painel da loja. A Nuvemshop não deixa colar endereço — os
 * webhooks dela são do APP, e o pedido nem vem no aviso. Então o CRM faz o
 * caminho por ela:
 *
 *   1. acha (ou cria, na primeira venda) uma fonte de captação "Nuvemshop" da
 *      organização, que aparece em Webhooks › Receber dados como qualquer outra
 *      — o dono troca o funil e a etapa ali;
 *   2. entrega o aviso montado em `venda.ts` à MESMA rota de captação que
 *      recebe Shopify, Yampi e Wix, chamada dentro do processo (sem ida à rede).
 *
 * Passar pela rota, e não por um atalho, é a decisão: dedupe, negócio do
 * carrinho, etapa pelo evento, plano, assinatura, registro em Leads recebidos e
 * auditoria são todos dela. Um segundo caminho seria um segundo lugar para
 * cada um desses consertos.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

import { NuvemshopApiClient } from "./api-client";
import type { AvisoDaNuvemshop } from "./venda";

export interface LojaConectada {
  integracaoId: string;
  organizationId: string;
  storeId: string;
  storeMetadata: Record<string, unknown>;
  tokenCifrado: string;
}

/** Estados em que a loja ainda responde à API. */
const ESTADOS_ATIVOS = ["healthy", "rate_limited"];

const COLUNAS = "id, organization_id, status, store_metadata, oauth_access_token_encrypted";

type LinhaDaLoja = {
  id: string;
  organization_id: string;
  status: string;
  store_metadata: Record<string, unknown> | null;
  oauth_access_token_encrypted: string;
};

function paraLoja(l: LinhaDaLoja): LojaConectada | null {
  const meta = l.store_metadata ?? {};
  const storeId = typeof meta.store_id === "string" || typeof meta.store_id === "number"
    ? String(meta.store_id)
    : "";
  if (!storeId) return null;
  return {
    integracaoId: l.id,
    organizationId: l.organization_id,
    storeId,
    storeMetadata: meta,
    tokenCifrado: l.oauth_access_token_encrypted,
  };
}

/** A loja conectada desta organização, ou `null` se não há (ou foi desconectada). */
export async function lojaDaOrganizacao(
  admin: SupabaseClient,
  organizationId: string,
): Promise<LojaConectada | null> {
  const { data, error } = await admin
    .from("tenant_integrations")
    .select(COLUNAS)
    .eq("provider", "nuvemshop")
    .eq("organization_id", organizationId)
    .in("status", ESTADOS_ATIVOS)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`tenant_integrations: ${error.message}`);
  return data ? paraLoja(data as unknown as LinhaDaLoja) : null;
}

/** Todas as lojas conectadas da instalação — para a leitura dos carrinhos. */
export async function lojasConectadas(admin: SupabaseClient): Promise<LojaConectada[]> {
  const { data, error } = await admin
    .from("tenant_integrations")
    .select(COLUNAS)
    .eq("provider", "nuvemshop")
    .in("status", ESTADOS_ATIVOS)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`tenant_integrations: ${error.message}`);
  return ((data ?? []) as unknown as LinhaDaLoja[])
    .map(paraLoja)
    .filter((l): l is LojaConectada => l !== null);
}

/** O cliente da API com o token decifrado; `null` se a chave de cifra falhou. */
export async function clienteDaLoja(
  admin: SupabaseClient,
  loja: LojaConectada,
): Promise<NuvemshopApiClient | null> {
  const token = await decryptWebhookSecret(admin, loja.tokenCifrado);
  if (!token) return null;
  return new NuvemshopApiClient({ storeId: loja.storeId, accessToken: token });
}

/**
 * A loja recusou o token (o lojista desinstalou o app ou trocou a permissão).
 * Marca na integração, que a tela da Nuvemshop mostra — senão os pedidos
 * param de entrar sem ninguém saber por quê.
 */
export async function marcarTokenRecusado(
  admin: SupabaseClient,
  loja: LojaConectada,
  motivo: string,
): Promise<void> {
  await admin
    .from("tenant_integrations")
    .update({ status: "token_expired", status_reason: motivo.slice(0, 200) })
    .eq("id", loja.integracaoId)
    .eq("organization_id", loja.organizationId);
}

/** Grava chaves em `store_metadata` sem apagar as outras (o `store_id` mora lá). */
export async function gravarNaLoja(
  admin: SupabaseClient,
  loja: LojaConectada,
  valores: Record<string, unknown>,
): Promise<void> {
  const meta = { ...loja.storeMetadata, ...valores };
  const { error } = await admin
    .from("tenant_integrations")
    .update({ store_metadata: meta })
    .eq("id", loja.integracaoId)
    .eq("organization_id", loja.organizationId);
  if (error) throw new Error(`tenant_integrations: ${error.message}`);
  loja.storeMetadata = meta;
}

type Fonte = { id: string; path_token: string; secret_encrypted: string | null };

/** O funil padrão da organização e a primeira etapa dele (a etapa do evento vem depois). */
async function destinoPadrao(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ pipelineId: string; stageId: string } | null> {
  const { data: funis } = await admin
    .from("crm_pipelines")
    .select("id, is_default, position")
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .limit(1);
  const funil = (funis ?? [])[0] as { id: string } | undefined;
  if (!funil) return null;
  const { data: etapas } = await admin
    .from("crm_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", funil.id)
    .eq("is_archived", false)
    .order("position", { ascending: true })
    .limit(1);
  const etapa = (etapas ?? [])[0] as { id: string } | undefined;
  return etapa ? { pipelineId: funil.id, stageId: etapa.id } : null;
}

/**
 * A fonte "Nuvemshop" desta loja. Na primeira venda ela nasce no funil padrão;
 * depois disso o dono a ajusta em Webhooks › Receber dados. Se ele a apagar,
 * a próxima venda cria outra — apagar a fonte não pode fazer pedido sumir.
 */
export async function fonteDaLoja(admin: SupabaseClient, loja: LojaConectada): Promise<Fonte | null> {
  const guardada = typeof loja.storeMetadata.fonte_id === "string" ? loja.storeMetadata.fonte_id : null;
  if (guardada) {
    const { data } = await admin
      .from("webhook_sources")
      .select("id, path_token, secret_encrypted")
      .eq("organization_id", loja.organizationId)
      .eq("id", guardada)
      .maybeSingle();
    if (data) return data as unknown as Fonte;
  }

  const destino = await destinoPadrao(admin, loja.organizationId);
  if (!destino) {
    logger.warn("[nuvemshop.captacao] organização sem funil para receber a venda", {
      organization_id: loja.organizationId,
    });
    return null;
  }
  const { data: criada, error } = await admin
    .from("webhook_sources")
    .insert({
      organization_id: loja.organizationId,
      name: "Nuvemshop",
      path_token: randomBytes(24).toString("base64url"),
      default_pipeline_id: destino.pipelineId,
      default_stage_id: destino.stageId,
      field_map: {},
      last_change_actor_kind: "system",
      last_change_at: new Date().toISOString(),
    })
    .select("id, path_token, secret_encrypted")
    .single();
  if (error || !criada) throw new Error(`webhook_sources: ${error?.message ?? "insert_failed"}`);
  const fonte = criada as unknown as Fonte;
  await gravarNaLoja(admin, loja, { fonte_id: fonte.id });
  await audit({
    action: "webhook.source_created",
    organizationId: loja.organizationId,
    resourceType: "webhook_source",
    resourceId: fonte.id,
    bypassedRls: true,
    metadata: { name: "Nuvemshop", actor_type: "system", motivo: "primeira_venda_da_nuvemshop" },
  });
  return fonte;
}

export type Entrega =
  | { tipo: "entregue"; status: number }
  | { tipo: "tentar_depois"; status: number; motivo: string }
  | { tipo: "recusada"; status: number; motivo: string };

/**
 * Entrega o aviso à rota de captação, no mesmo processo. Se a fonte tem
 * segredo, o corpo vai assinado como qualquer sistema assinaria
 * (`x-chatai-signature`, HMAC-SHA256 em hex).
 */
export async function entregarNaCaptacao(
  admin: SupabaseClient,
  fonte: Fonte,
  aviso: AvisoDaNuvemshop,
): Promise<Entrega> {
  const corpo = JSON.stringify(aviso);
  const cabecalhos: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "nuvemshop-ponte",
    "x-request-id": randomUUID(),
  };
  if (fonte.secret_encrypted) {
    const segredo = await decryptWebhookSecret(admin, fonte.secret_encrypted);
    if (segredo) cabecalhos["x-chatai-signature"] = createHmac("sha256", segredo).update(corpo).digest("hex");
  }
  // Import tardio: a rota puxa a cadeia inteira da captação, e o registro de
  // handlers do worker não pode pagá-la no boot.
  const [{ NextRequest }, rota] = await Promise.all([
    import("next/server"),
    import("@/app/api/v1/webhooks/in/[token]/route"),
  ]);
  const req = new NextRequest(`http://interno/api/v1/webhooks/in/${fonte.path_token}`, {
    method: "POST",
    headers: cabecalhos,
    body: corpo,
  });
  const res = await rota.POST(req, { params: Promise.resolve({ token: fonte.path_token }) });
  if (res.status < 300) return { tipo: "entregue", status: res.status };
  let motivo = `http_${res.status}`;
  try {
    const j = (await res.json()) as { error?: { code?: string } };
    if (j.error?.code) motivo = j.error.code;
  } catch {
    // corpo sem JSON: fica o status
  }
  // 429 (ritmo) e 5xx (banco) passam; 4xx é decisão (plano, fonte desligada).
  if (res.status === 429 || res.status >= 500) return { tipo: "tentar_depois", status: res.status, motivo };
  return { tipo: "recusada", status: res.status, motivo };
}

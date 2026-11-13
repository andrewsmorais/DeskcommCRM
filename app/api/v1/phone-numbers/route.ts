/**
 * GET/POST /api/v1/phone-numbers — números/DID de voz da org ativa.
 *
 * `manager`+, leitura pela RLS (createClient), audit no create.
 * `trunk_endpoint` nunca vem do body — é decidido aqui, abaixo.
 *
 * Cadastrar um número é reivindicar as ligações que chegam nele. O tronco do
 * cadastro é o PRÓPRIO da organização, quando ativo; senão o da INSTALAÇÃO,
 * que com mais de uma organização só vale se o operador o liberou
 * (lib/voip/tronco-da-instalacao.ts) — senão a primeira empresa a cadastrar o
 * número do servidor passaria a atender as ligações dele. A gravação é pela
 * service role depois dessas conferências (pelo login o insert é recusado).
 */
import { requireSupportWrite } from "@/lib/impersonate/support";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createPhoneNumberSchema } from "@/lib/schemas/phone-numbers";
import { validateRequest } from "@/lib/schemas/_validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { troncoDaInstalacaoLiberado } from "@/lib/voip/tronco-da-instalacao";

export const dynamic = "force-dynamic";

// COLUMNS carrega o embed (join) pra LISTAGEM. Numa insert().select() o
// supabase-js não infere bem o tipo do embed junto da mutação -- MUTATION_COLUMNS
// devolve só as colunas próprias; o front reconsulta a lista via
// invalidateQueries de qualquer forma, então o `agent` populado chega no
// próximo GET, não precisa vir na resposta da mutação.
const COLUMNS =
  "id, number, label, routing_mode, default_ai_agent_id, is_active, created_at, " +
  "agent:ai_agents(id, name)";
const MUTATION_COLUMNS =
  "id, number, label, routing_mode, default_ai_agent_id, is_active, created_at";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "phone_numbers" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("phone_numbers")
    .select(COLUMNS)
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: true });

  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  // Guarda de EFEITO do acompanhamento administrativo, ANTES do RBAC e do
  // client de service role: quem está só ACOMPANHANDO a organização de outra
  // pessoa não escreve por ela. Sem esta linha, um acompanhamento somente
  // leitura originava ligação, cadastrava número e trocava a credencial do
  // tronco — em nome do cliente, com a trilha apontando para ele.
  const acompanhamentoNegado = await requireSupportWrite();
  if (acompanhamentoNegado) return acompanhamentoNegado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "phone_numbers" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(createPhoneNumberSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();

  // O tronco do cadastro decide por onde as ligações deste número podem chegar
  // (lib/voip/tronco-de-chegada.ts): o tronco PRÓPRIO da organização, quando
  // ativo; senão o da instalação, só quando liberado para ela.
  const { data: troncoProprio, error: troncoErr } = await supabase
    .from("voip_trunk_settings")
    .select("endpoint_name, is_active")
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (troncoErr) return fail("internal_error", troncoErr.message, 500, { requestId });

  let trunkEndpoint: string;
  if (troncoProprio?.is_active) {
    trunkEndpoint = troncoProprio.endpoint_name.includes("/")
      ? troncoProprio.endpoint_name
      : `PJSIP/${troncoProprio.endpoint_name}`;
  } else if (!process.env.VOIP_TRUNK_ENDPOINT) {
    return fail("voip_nao_configurado", "Troncal de voz não configurado no servidor.", 500, { requestId });
  } else if (!(await troncoDaInstalacaoLiberado())) {
    return fail(
      "tronco_nao_compartilhado",
      "O troncal de voz do servidor não está liberado para esta organização. Peça a um administrador para configurar o trunk SIP próprio (Configurações › Trunk SIP).",
      422,
      { requestId },
    );
  } else {
    trunkEndpoint = process.env.VOIP_TRUNK_ENDPOINT;
  }

  // O agente padrão tem de ser da organização: a gravação abaixo é pela
  // service role, e a chave estrangeira não olha organização.
  if (input.default_ai_agent_id) {
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("id", input.default_ai_agent_id)
      .eq("organization_id", activeOrg.orgId)
      .maybeSingle();
    if (!agente) {
      return fail("validation_failed", "Agente de IA não encontrado nesta organização.", 422, { requestId });
    }
  }

  // Cadastro só pela rota (0509): pelo login a policy recusa o insert, para que
  // nenhum número entre sem a conferência do tronco acima. A organização vem da
  // sessão, nunca do corpo.
  const { data: row, error } = await createAdminClient()
    .from("phone_numbers")
    .insert({
      organization_id: activeOrg.orgId,
      number: input.number,
      label: input.label ?? null,
      trunk_endpoint: trunkEndpoint,
      routing_mode: input.routing_mode,
      default_ai_agent_id: input.default_ai_agent_id ?? null,
      is_active: input.is_active,
    })
    .select(MUTATION_COLUMNS)
    .single();

  if (error) {
    // uniq em `number` é GLOBAL (uma linha do trunk único, não por org) — 23505
    // aqui quase sempre é "esse DID já pertence a outra organização".
    if (error.code === "23505") {
      return fail("numero_ja_cadastrado", "Esse número já está cadastrado.", 409, { requestId });
    }
    return fail("internal_error", error.message, 500, { requestId });
  }

  await audit({
    action: "phone_number.created",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "phone_numbers",
    resourceId: row.id,
    requestId,
    metadata: { number: input.number },
  });

  return ok(row, { status: 201, requestId });
}

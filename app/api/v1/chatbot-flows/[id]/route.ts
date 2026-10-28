/**
 * GET    /api/v1/chatbot-flows/[id]  — o fluxo com o desenho (grafo)
 * PATCH  /api/v1/chatbot-flows/[id]  — nome, ligar/desligar e/ou o desenho inteiro
 * DELETE /api/v1/chatbot-flows/[id]  — remove o fluxo
 *
 * O desenho vai num campo só (`chatbot_flows.grafo`, migration 0489), num
 * UPDATE só: não existe mais fluxo meio salvo. Ligar um fluxo que responde
 * mensagens desliga os outros que atendem O MESMO número — cada número tem o
 * seu chatbot de entrada (lib/chatbot/plano.ts). Ligar respeita o limite de
 * chatbots do plano, e passo avançado só grava a partir do Impulso.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { grafoSchema, lerConfig } from "@/lib/chatbot/passos";
import { caminhoDoChatbotDaOrg } from "@/lib/chatbot/midia";
import { respondeMensagens } from "@/lib/chatbot/motor";
import { problemasDoGrafo } from "@/lib/chatbot/validar";
import { cifrarSegredosDoGrafo } from "@/lib/chatbot/segredos";
import { conferirCotaDeChatbots, conferirPassosDoPlano, disputamNumero } from "@/lib/chatbot/plano";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
  grafo: grafoSchema.optional(),
});

const COLUNAS = "id, name, description, status, is_active, grafo, revisao, updated_at";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: Ctx) {
  const requestId = randomUUID();
  const auth = await requireRole("agent");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const db = await createClient();
  const { data, error } = await db
    .from("chatbot_flows")
    .select(COLUNAS)
    .eq("id", id)
    .eq("organization_id", auth.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", "Não foi possível ler o fluxo.", 500, { requestId });
  if (!data) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const auth = await requireRole("manager");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Campos inválidos.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const db = await createClient();
  const { data: atual } = await db
    .from("chatbot_flows")
    .select("id, grafo, revisao, is_active")
    .eq("id", id)
    .eq("organization_id", auth.org.orgId)
    .maybeSingle();
  if (!atual) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });

  const { grafo: grafoRecebido, is_active, ...meta } = parsed.data;

  // O arquivo do "Enviar mídia" é copiado com service role na hora do envio: só
  // aceita arquivo que esta organização subiu para o chatbot.
  const midiaDeFora = (grafoRecebido?.nodes ?? []).some((n) => {
    if (n.type !== "enviar_midia") return false;
    const caminho = lerConfig("enviar_midia", n.data).storage_path;
    return caminho !== null && !caminhoDoChatbotDaOrg(caminho, auth.org.orgId);
  });
  if (midiaDeFora) {
    return fail(
      "validation_failed",
      'O arquivo de um passo "Enviar mídia" não foi subido por esta empresa. Escolha o arquivo de novo.',
      422,
      { requestId },
    );
  }

  // Segredo do passo "WebHook" nunca é gravado em texto: o desenho é lido por
  // todo membro da organização (lib/chatbot/segredos.ts).
  let grafo = grafoRecebido;
  if (grafo !== undefined) {
    const cifrado = await cifrarSegredosDoGrafo(createAdminClient(), grafo);
    if (cifrado === null) {
      return fail(
        "encryption_unavailable",
        "A instalação não tem a chave de cifra configurada, então o segredo do WebHook não pode ser guardado. Tire o segredo do passo ou peça a quem administra a VPS.",
        422,
        { requestId },
      );
    }
    grafo = cifrado;
  }

  // Ligar exige um desenho que o motor consiga rodar: o que vai ser gravado
  // agora, ou o que já está gravado.
  if (is_active === true) {
    const problemas = problemasDoGrafo(grafoSchema.parse(grafo ?? atual.grafo));
    if (problemas.length > 0) {
      return fail("validation_failed", `Antes de ligar: ${problemas[0]}`, 422, {
        requestId,
        details: { problemas },
      });
    }
  }

  const update: Record<string, unknown> = { ...meta, updated_at: new Date().toISOString() };
  if (grafo !== undefined) {
    update.grafo = grafo;
    update.revisao = (atual.revisao ?? 0) + 1;
  }
  if (is_active !== undefined) {
    update.is_active = is_active;
    update.status = is_active ? "active" : "draft";
  }

  // Passo avançado (webhook, condições, aguardar, outro fluxo...) só a partir
  // do Impulso. Barrado ao gravar; o que já estava gravado continua rodando.
  if (grafoRecebido !== undefined) {
    const passos = await conferirPassosDoPlano(auth.org.orgId, grafoRecebido);
    if (!passos.ok) return fail(passos.code, passos.message, passos.status, { requestId });
  }

  // Um chatbot de entrada POR NÚMERO. Ligar (ou passar a responder mensagens)
  // desliga só os outros ligados que atendem algum número em comum. Fluxos
  // que só começam por automação ou à mão não disputam número nenhum.
  const ficaLigado = is_active ?? Boolean(atual.is_active);
  const desenhoFinal = grafoSchema.safeParse(grafo ?? atual.grafo);
  let concorrentes: string[] = [];
  if (ficaLigado && desenhoFinal.success && respondeMensagens(desenhoFinal.data)) {
    const { data: outros, error: erroAoLer } = await db
      .from("chatbot_flows")
      .select("id, grafo")
      .eq("organization_id", auth.org.orgId)
      .eq("is_active", true)
      .neq("id", id);
    if (erroAoLer)
      return fail("internal_error", "Não foi possível ler os outros fluxos.", 500, { requestId });
    concorrentes = (outros ?? [])
      .filter((f) => {
        const g = grafoSchema.safeParse(f.grafo);
        return g.success && respondeMensagens(g.data) && disputamNumero(desenhoFinal.data, g.data);
      })
      .map((f) => String(f.id));
  }

  // Ligar um chatbot que estava desligado conta no limite do plano. Os que esta
  // operação vai desligar (mesmo número) liberam a vaga.
  if (ficaLigado && !atual.is_active) {
    const cota = await conferirCotaDeChatbots(db, auth.org.orgId, {
      fluxoId: id,
      desligando: concorrentes,
      isento: auth.user.is_platform_admin || Boolean(auth.user.support),
    });
    if (!cota.ok) return fail(cota.code, cota.message, cota.status, { requestId });
  }

  if (concorrentes.length > 0) {
    const { error: erroDosOutros } = await db
      .from("chatbot_flows")
      .update({ is_active: false, status: "draft", updated_at: new Date().toISOString() })
      .eq("organization_id", auth.org.orgId)
      .in("id", concorrentes);
    if (erroDosOutros)
      return fail("internal_error", "Não foi possível desligar os outros fluxos.", 500, {
        requestId,
      });
  }

  const { data, error } = await db
    .from("chatbot_flows")
    .update(update)
    .eq("id", id)
    .eq("organization_id", auth.org.orgId)
    .select(COLUNAS)
    .maybeSingle();
  if (error || !data)
    return fail("internal_error", "Não foi possível salvar o fluxo.", 500, { requestId });

  await audit({
    action: "chatbot_flow.updated",
    organizationId: auth.org.orgId,
    actorUserId: auth.user.id,
    resourceType: "chatbot_flow",
    resourceId: id,
    requestId,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent"),
    metadata: {
      campos: Object.keys(parsed.data),
      ...(is_active !== undefined ? { ligado: is_active } : {}),
      ...(grafo !== undefined ? { passos: grafo.nodes.length, revisao: update.revisao } : {}),
    },
  });

  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const auth = await requireRole("manager");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const db = await createClient();

  const { error } = await db
    .from("chatbot_flows")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.org.orgId);

  if (error) return fail("internal_error", "Não foi possível apagar o fluxo.", 500, { requestId });

  await audit({
    action: "chatbot_flow.deleted",
    organizationId: auth.org.orgId,
    actorUserId: auth.user.id,
    resourceType: "chatbot_flow",
    resourceId: id,
    requestId,
  });

  return ok({ id }, { requestId });
}

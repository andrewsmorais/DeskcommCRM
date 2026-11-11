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
import { assinaturaExigida } from "@/lib/billing/exigencia";
import { comReservaDeCota, ErroDaReservaDeCota } from "@/lib/billing/reserva";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
  grafo: grafoSchema.optional(),
  /** Copia o rascunho (ou o `grafo` enviado junto) para o que roda, e guarda a versão. */
  publicar: z.boolean().optional(),
  /**
   * A revisão que o editor tinha ao abrir/salvar. Diferente da gravada = outra
   * aba ou outra pessoa salvou no meio: 409 em vez de passar por cima.
   */
  revisao: z.number().int().min(0).optional(),
});

const COLUNAS = "id, name, description, status, is_active, grafo, rascunho, revisao, updated_at";

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
    .select("id, grafo, rascunho, revisao, is_active")
    .eq("id", id)
    .eq("organization_id", auth.org.orgId)
    .maybeSingle();
  if (!atual) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });

  const { grafo: grafoRecebido, is_active, publicar, revisao: revisaoVista, ...meta } = parsed.data;

  // Duas abas (ou duas pessoas) no mesmo fluxo: quem salva por último não
  // apaga em silêncio o que o outro fez.
  if (revisaoVista !== undefined && revisaoVista !== (atual.revisao ?? 0)) {
    return fail(
      "conflict",
      "Este fluxo foi salvo em outra aba ou por outra pessoa enquanto você editava. Recarregue a página para ver a versão mais nova.",
      409,
      { requestId, details: { revisao_atual: atual.revisao ?? 0 } },
    );
  }

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
  // todo membro da organização (lib/chatbot/segredos.ts). O cifrado que volta
  // do editor só fica se for o que este passo já tinha no desenho gravado.
  let grafo = grafoRecebido;
  if (grafo !== undefined) {
    // Os cifrados aceitos são os do publicado E os do rascunho: o editor abre
    // o rascunho quando há um.
    const gravados = [atual.grafo, atual.rascunho].flatMap(
      (g) => ((g as { nodes?: unknown[] } | null)?.nodes ?? []) as unknown[],
    );
    const cifrado = await cifrarSegredosDoGrafo(createAdminClient(), grafo, { nodes: gravados }, {
      organizationId: auth.org.orgId,
      flowId: id,
    });
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

  // RASCUNHO × PUBLICADO (pendência V1, como na Umbler/Blip/Typebot). O motor
  // lê só `grafo` — o publicado. Num fluxo LIGADO, salvar grava o RASCUNHO e
  // não muda nada para os clientes (desenho pela metade pode ficar salvo);
  // só "Publicar" valida e copia para `grafo`, guardando a versão. Num fluxo
  // DESLIGADO não há o que proteger: salvar grava `grafo` direto, e LIGAR é
  // a publicação.
  const ativoAgora = Boolean(atual.is_active);
  const ligadoDepois = is_active ?? ativoAgora;
  const rascunhoGravado = grafoSchema.safeParse(atual.rascunho);
  const vaiParaORascunho =
    grafo !== undefined && ativoAgora && ligadoDepois && publicar !== true;
  const publicadoNovo: typeof grafo | undefined = vaiParaORascunho
    ? undefined
    : (grafo ??
      (publicar === true && rascunhoGravado.success ? rascunhoGravado.data : undefined));

  // Ligar, ou publicar num fluxo que fica ligado, exige um desenho que o motor
  // consiga rodar.
  if (is_active === true || (ligadoDepois && publicadoNovo !== undefined)) {
    const problemas = problemasDoGrafo(grafoSchema.parse(publicadoNovo ?? atual.grafo));
    if (problemas.length > 0) {
      const prefixo = is_active === true && !ativoAgora ? "Antes de ligar" : "Antes de publicar";
      return fail("validation_failed", `${prefixo}: ${problemas[0]}`, 422, {
        requestId,
        details: { problemas },
      });
    }
  }

  const update: Record<string, unknown> = { ...meta, updated_at: new Date().toISOString() };
  if (vaiParaORascunho) {
    update.rascunho = grafo;
    update.revisao = (atual.revisao ?? 0) + 1;
  } else if (publicadoNovo !== undefined) {
    update.grafo = publicadoNovo;
    update.rascunho = null;
    update.revisao = (atual.revisao ?? 0) + 1;
  }
  // O que passa a rodar com esta operação vira versão: publicar, ou ligar.
  const versaoNova =
    ligadoDepois && (publicadoNovo !== undefined || (is_active === true && !ativoAgora))
      ? (publicadoNovo ?? grafoSchema.safeParse(atual.grafo).data ?? null)
      : null;
  if (is_active !== undefined) {
    update.is_active = is_active;
    update.status = is_active ? "active" : "draft";
  }

  // Passo avançado (webhook, condições, aguardar, outro fluxo...) só a partir
  // do Impulso. Barrado ao gravar E ao ligar: um rascunho montado no Impulso
  // ligava no Essencial com `{is_active: true}` sozinho, que não conferia nada
  // (auditoria funcional f01). O que já estava ligado continua rodando.
  if (grafoRecebido !== undefined) {
    const passos = await conferirPassosDoPlano(auth.org.orgId, grafoRecebido);
    if (!passos.ok) return fail(passos.code, passos.message, passos.status, { requestId });
  } else if (publicar === true && publicadoNovo !== undefined) {
    // O rascunho pode ter sido salvo num plano maior: a publicação confere de novo.
    const passos = await conferirPassosDoPlano(auth.org.orgId, publicadoNovo);
    if (!passos.ok) return fail(passos.code, passos.message, passos.status, { requestId });
  } else if (is_active === true && !atual.is_active) {
    const gravado = grafoSchema.safeParse(atual.grafo);
    if (gravado.success) {
      const passos = await conferirPassosDoPlano(auth.org.orgId, gravado.data);
      if (!passos.ok) return fail(passos.code, passos.message, passos.status, { requestId });
    }
  }

  // Um chatbot de entrada POR NÚMERO. Ligar (ou passar a responder mensagens)
  // desliga só os outros ligados que atendem algum número em comum. Fluxos
  // que só começam por automação ou à mão não disputam número nenhum.
  const ficaLigado = is_active ?? Boolean(atual.is_active);
  const desenhoFinal = grafoSchema.safeParse(publicadoNovo ?? atual.grafo);
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
  // operação vai desligar (mesmo número) liberam a vaga. A contagem e a escrita
  // vão dentro da MESMA reserva de cota da organização: dois "ligar" simultâneos
  // no limite viam a mesma contagem e ligavam os dois.
  // As funções abaixo são declaradas (içadas), e o TypeScript não carrega para
  // dentro delas o estreitamento de `auth`; por isso a sessão vai em constantes.
  const sessao = auth;
  const camposRecebidos = Object.keys(parsed.data);
  const isento = sessao.user.is_platform_admin || Boolean(sessao.user.support);
  const ligando = ficaLigado && !atual.is_active;
  async function gravar(): Promise<Response> {
    if (ligando) {
      const cota = await conferirCotaDeChatbots(db, sessao.org.orgId, {
        fluxoId: id,
        desligando: concorrentes,
        isento,
      });
      if (!cota.ok) return fail(cota.code, cota.message, cota.status, { requestId });
    }
    return gravarFluxo();
  }
  if (ligando && !isento && assinaturaExigida()) {
    try {
      return await comReservaDeCota(sessao.org.orgId, "chatbots", gravar);
    } catch (error) {
      if (error instanceof ErroDaReservaDeCota) {
        return fail(
          error.status === 409 ? "conflict" : "billing_unavailable",
          error.message,
          error.status,
          { requestId },
        );
      }
      throw error;
    }
  }
  return gravar();

  async function gravarFluxo(): Promise<Response> {
    if (concorrentes.length > 0) {
      const { error: erroDosOutros } = await db
        .from("chatbot_flows")
        .update({ is_active: false, status: "draft", updated_at: new Date().toISOString() })
        .eq("organization_id", sessao.org.orgId)
        .in("id", concorrentes);
      if (erroDosOutros)
        return fail("internal_error", "Não foi possível desligar os outros fluxos.", 500, {
          requestId,
        });
    }

    // A revisão no filtro faz a conferência de duas abas valer também na
    // corrida: quem chegar segundo atualiza zero linhas.
    const { data, error } = await db
      .from("chatbot_flows")
      .update(update)
      .eq("id", id)
      .eq("organization_id", sessao.org.orgId)
      .eq("revisao", atual.revisao ?? 0)
      .select(COLUNAS)
      .maybeSingle();
    if (error)
      return fail("internal_error", "Não foi possível salvar o fluxo.", 500, { requestId });
    if (!data)
      return fail(
        "conflict",
        "Este fluxo foi salvo em outra aba ou por outra pessoa enquanto você editava. Recarregue a página para ver a versão mais nova.",
        409,
        { requestId },
      );

    if (versaoNova) {
      const numero = await guardarVersao(sessao.org.orgId, id, versaoNova, sessao.user.id);
      if (numero === null)
        logger.warn("[chatbot] fluxo publicado sem versão no histórico", { flow_id: id });
    }

    await audit({
      action: "chatbot_flow.updated",
      organizationId: sessao.org.orgId,
      actorUserId: sessao.user.id,
      resourceType: "chatbot_flow",
      resourceId: id,
      requestId,
      ip: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent"),
      metadata: {
        campos: camposRecebidos,
        ...(is_active !== undefined ? { ligado: is_active } : {}),
        ...(grafo !== undefined ? { passos: grafo.nodes.length, revisao: update.revisao } : {}),
        ...(vaiParaORascunho ? { rascunho: true } : {}),
        ...(versaoNova ? { publicado: true } : {}),
      },
    });

    return ok(data, { requestId });
  }
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

/**
 * Guarda a versão publicada (imutável; só o servidor escreve na tabela). O
 * número é o seguinte ao maior do fluxo; numa corrida rara, o `unique` recusa
 * e tenta de novo uma vez. Falhar aqui não desfaz a publicação — o histórico
 * é para voltar atrás, não para decidir o que roda.
 */
async function guardarVersao(
  orgId: string,
  flowId: string,
  grafo: unknown,
  publicadaPor: string,
): Promise<number | null> {
  const admin = createAdminClient();
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { data: ultima } = await admin
      .from("chatbot_flow_versions")
      .select("numero")
      .eq("organization_id", orgId)
      .eq("flow_id", flowId)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();
    const numero = (Number(ultima?.numero) || 0) + 1;
    const { error } = await admin.from("chatbot_flow_versions").insert({
      organization_id: orgId,
      flow_id: flowId,
      numero,
      grafo,
      publicada_por: publicadaPor,
    });
    if (!error) return numero;
    if (error.code !== "23505") return null;
  }
  return null;
}

/**
 * GET /api/v1/prospecting/:id/exportar — a LISTA DA CAMPANHA em CSV, só com as
 * empresas que AINDA PODEM ser abordadas (vindo do produto original, #4360).
 *
 * É LEITURA: dois `select` e nada mais — nenhum contato, campanha ou candidato é
 * criado. O registro de que a lista saiu fica na auditoria
 * (`prospecting.exported`), com a CONTAGEM, nunca com o conteúdo.
 *
 * A porta é a mesma do resto da prospecção: sessão de admin, e só quando o
 * módulo de disparo em massa está ligado. A organização vem da sessão, nunca da
 * URL — campanha de outra conta é "não encontrada".
 */
import { randomUUID } from "node:crypto";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { seDisparoEmMassaDesligado } from "@/lib/instalacao/disparo-em-massa";
import {
  csvDaLista,
  naoAbordada,
  nomeDoArquivoDaLista,
  resumoDaLista,
  type CandidatoDaLista,
} from "@/lib/prospecting/exportar";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mesmo teto da tela (o GET da prospecção lê 5.000 candidatos). */
const TETO_DA_LEITURA = 5_000;
const headers = { "Cache-Control": "no-store" };

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const desligado = await seDisparoEmMassaDesligado(requestId);
  if (desligado) return desligado;
  const auth = await requireRole("admin", { requestId, resource: "prospecting" });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "Campanha inválida.", 400, { requestId, headers });

  const org = auth.org.orgId;
  const db = getRequestPool();
  const campanha = (
    await db.query<{ id: string; name: string }>(
      "select id,name from prospecting_campaigns where organization_id=$1 and id=$2",
      [org, id],
    )
  ).rows[0];
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId, headers });

  const candidatos = (
    await db.query<CandidatoDaLista>(
      "select status,attempted_at,phone,data from prospecting_candidates where organization_id=$1 and campaign_id=$2 order by created_at,id limit $3",
      [org, campanha.id, TETO_DA_LEITURA],
    )
  ).rows;

  const pendentes = candidatos.filter(naoAbordada);
  const { total, nao_abordadas } = resumoDaLista(candidatos);
  if (pendentes.length === 0)
    return fail(
      "validation_failed",
      "Nenhuma empresa desta campanha ainda pode ser abordada — não há lista para baixar. Quem já recebeu mensagem fica de fora do arquivo.",
      422,
      { requestId, headers },
    );

  await audit({
    action: "prospecting.exported",
    organizationId: org,
    actorUserId: auth.user.id,
    resourceType: "prospecting",
    resourceId: campanha.id,
    requestId,
    metadata: { campaign_id: campanha.id, total, nao_abordadas },
  });

  return new Response(csvDaLista(pendentes), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeDoArquivoDaLista(campanha.name, new Date())}"`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      ...(total >= TETO_DA_LEITURA ? { "X-Lista-Truncada": "true" } : {}),
    },
  });
}

/**
 * GET/POST /api/v1/cron/exportacao-avisos
 *
 * Diário. Avisa por e-mail os administradores de contas cujo acesso terminou, em
 * três momentos: logo depois do encerramento, 7 dias antes do fim do prazo de 30
 * dias para baixar os dados, e no último dia (`lib/exportacao/ciclo-de-vida.ts`).
 *
 * Rodada que não enviou nada NÃO audita; a que enviou, audita — uma linha por
 * conta avisada (`dependenciasReais().auditar`). O mesmo critério do resto dos
 * crons, medido em `tests/unit/cron-audita-so-quando-ha-efeito.test.ts`.
 *
 * `?simular=1` devolve o que SERIA enviado, sem enviar nem gravar nada: é como
 * se confere uma instalação antes de confiar no cron.
 *
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>` (fail-closed sem segredo).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { dependenciasReais, executarAvisos } from "@/lib/exportacao/avisos";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function tratar(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }
  const simular = new URL(req.url).searchParams.get("simular") === "1";
  const resultado = await executarAvisos(dependenciasReais(), { simular });
  return ok(resultado, { requestId });
}

export const GET = tratar;
export const POST = tratar;

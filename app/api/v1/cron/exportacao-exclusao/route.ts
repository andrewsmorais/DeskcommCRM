/**
 * GET/POST /api/v1/cron/exportacao-exclusao
 *
 * Diário. Exclui (anonimiza) os dados das contas cujo prazo de 30 dias para
 * exportar terminou — e só depois que o link de download dos e-mails expirou, e
 * só se algum aviso deste ciclo chegou a alguém (`lib/exportacao/exclusao.ts`).
 * Desconecta o WhatsApp por QR e abre um pedido LGPD de escopo `tenant`; quem
 * anonimiza de fato é o `lgpd-redact-worker`.
 *
 * Rodada que não agendou nada NÃO audita; a que agendou, audita — uma linha
 * `lgpd.redact_received` por conta (`dependenciasReaisDaExclusao().auditar`). O
 * mesmo critério do resto dos crons, medido em
 * `tests/unit/cron-audita-so-quando-ha-efeito.test.ts`.
 *
 * `?simular=1` devolve quais contas SERIAM excluídas, sem desconectar nem abrir
 * pedido: confira sempre antes de confiar no cron numa instalação nova.
 *
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>` (fail-closed sem segredo).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { dependenciasReaisDaExclusao, executarExclusao } from "@/lib/exportacao/exclusao";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function tratar(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }
  const simular = new URL(req.url).searchParams.get("simular") === "1";
  const resultado = await executarExclusao(dependenciasReaisDaExclusao(), { simular });
  return ok(resultado, { requestId });
}

export const GET = tratar;
export const POST = tratar;

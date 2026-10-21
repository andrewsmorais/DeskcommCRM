/**
 * Pool do Postgres do agent-engine, sob demanda no processo Next.js (rotas
 * `/api/v1`). Sem pool global no import — mesma disciplina de
 * `workers/media-derive-worker.ts` (derivePool). SUPABASE_DB_URL ausente
 * lança na hora do request (rota converte pra 503), não na importação do
 * módulo.
 */
import type pg from "pg";

import { createPool } from "./pool";

let _pool: pg.Pool | null = null;

/** Configuração da instalação, distinta de uma falha na credencial do provedor. */
export class RequestPoolNotConfiguredError extends Error {
  override readonly name = "RequestPoolNotConfiguredError";

  constructor() {
    super("SUPABASE_DB_URL ausente — motor de IA indisponível");
  }
}

export function getRequestPool(): pg.Pool {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new RequestPoolNotConfiguredError();
  if (!_pool) _pool = createPool(url);
  return _pool;
}

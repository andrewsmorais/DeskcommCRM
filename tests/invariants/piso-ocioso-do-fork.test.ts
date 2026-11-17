/**
 * O RETRATO DO PISO OCIOSO roda contra o `baseline.sql` que o self-host aplica.
 *
 * A regra de falha do portão é "na dúvida, roda": uma tabela ou coluna que não
 * exista no fork faria a leitura falhar e TODAS as rotas voltariam a consultar o
 * banco a cada batida — sem erro visível, só a economia sumindo. Este caso
 * consulta o banco de verdade e exige a resposta de cada recurso, não o
 * "tudo em uso" da falha.
 */
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";
import { esquecerRetrato, recursoTemTrabalho, RECURSOS_DO_CRON } from "@/lib/cron/piso-ocioso";

const pool = new Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
  max: 2,
});

afterAll(() => pool.end());
beforeEach(() => esquecerRetrato());

describe("piso ocioso do fork — a consulta do retrato existe no banco do cliente", () => {
  it("lê todos os recursos sem cair na falha (que diria 'tudo em uso')", async () => {
    const aviso = vi.spyOn(logger, "warn");
    for (const recurso of RECURSOS_DO_CRON) {
      await recursoTemTrabalho(recurso, Date.now(), pool);
    }
    expect(aviso, "a leitura do retrato falhou no baseline").not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("uma conversa com soneca vencida acorda a rota da soneca", async () => {
    const { rows } = await pool.query<{ ha: boolean }>(
      "select exists (select 1 from conversations where snooze_until is not null and snooze_until <= now()) as ha",
    );
    esquecerRetrato();
    expect(await recursoTemTrabalho("fila_de_soneca", Date.now(), pool)).toBe(rows[0]!.ha);
  });
});

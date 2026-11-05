/**
 * Migration 0503 — `ai-policy` e `lgpd-exports` são buckets só do servidor.
 *
 * As policies de `storage.objects` desses buckets pediam só pertencimento: um
 * leitor baixava pela API do Storage o dossiê de LGPD de qualquer titular da
 * organização e apagava ou trocava os arquivos da base de conhecimento. Nenhum
 * código do produto usa a sessão nesses buckets, então nenhuma policy deve
 * nomeá-los — mesmo contrato que `marca-logo.test.ts` mede para `brand-logos`.
 *
 * A verificação é sobre o catálogo porque o stub de `storage.objects` do
 * `scripts/test-db.sh` não reproduz a RLS do Storage do Supabase; o que este
 * arquivo prova é que nenhuma porta de sessão sobra para esses dois buckets.
 */
import { describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

function policiesQueNomeiam(bucket: string): string {
  return lastLine(
    sql(`select coalesce(string_agg(policyname || ':' || cmd, ',' order by policyname), 'NENHUMA')
           from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and (coalesce(qual, '') || coalesce(with_check, '')) like '%${bucket}%';`),
  );
}

describe("0503 — buckets só do servidor", () => {
  it("nenhuma policy de storage.objects nomeia o bucket da base de conhecimento", () => {
    expect(policiesQueNomeiam("ai-policy")).toBe("NENHUMA");
  });

  it("nenhuma policy de storage.objects nomeia o bucket do export de LGPD", () => {
    expect(policiesQueNomeiam("lgpd-exports")).toBe("NENHUMA");
  });

  it("controle: o instrumento enxerga policy de bucket quando ela existe (propostas)", () => {
    expect(policiesQueNomeiam("propostas")).not.toBe("NENHUMA");
  });

  it("os dois buckets seguem existindo e privados", () => {
    expect(
      lastLine(
        sql(`select string_agg(id || '=' || public::text, ',' order by id) from storage.buckets
              where id in ('ai-policy', 'lgpd-exports');`),
      ),
    ).toBe("ai-policy=false,lgpd-exports=false");
  });
});

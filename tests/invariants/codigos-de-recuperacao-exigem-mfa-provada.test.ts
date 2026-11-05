/**
 * Migration 0502 — os códigos de recuperação da MFA só são lidos ou gravados
 * pelo login com a MFA provada na sessão.
 *
 * O resgate (`app/actions/auth/useRecoveryCode.ts`, sem login) apaga todos os
 * fatores TOTP de quem apresentar um código válido. Antes desta migration, a
 * sessão `aal1` — só a senha — gravava um código escolhido por ela e o
 * resgatava, ou lia os hashes para quebrá-los fora do ar.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

const COM_FATOR = "0502aaaa-1111-4000-8000-000000000001";
const SEM_FATOR = "0502aaaa-1111-4000-8000-000000000002";

function como(userId: string, aal: "aal1" | "aal2", stmt: string) {
  try {
    const out = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}","aal":"${aal}"}', false);
      ${stmt}
    `);
    return { ok: true as const, out: lastLine(out) };
  } catch (err) {
    return { ok: false as const, erro: String((err as { stderr?: string }).stderr ?? err) };
  }
}

const gravar = (quem: string, codigo: string) =>
  `insert into public.user_recovery_codes (user_id, code_hash)
   values ('${quem}', decode(md5('${codigo}'), 'hex'));`;

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${COM_FATOR}', 'p0502-com@invariant.test'),
      ('${SEM_FATOR}', 'p0502-sem@invariant.test')
      on conflict do nothing;
    insert into auth.mfa_factors (id, user_id, status, factor_type)
      values ('0502aaaa-2222-4000-8000-000000000001', '${COM_FATOR}', 'verified', 'totp')
      on conflict do nothing;
    insert into public.user_recovery_codes (user_id, code_hash)
      values ('${COM_FATOR}', decode(md5('CODIGO-LEGITIMO'), 'hex'));
  `);
});

describe("0502 — códigos de recuperação exigem a MFA provada", () => {
  it("aal1 de quem tem fator não grava código escolhido", () => {
    expect(como(COM_FATOR, "aal1", gravar(COM_FATOR, "CODIGO-DO-ATACANTE")).ok).toBe(false);
  });

  it("aal1 de quem tem fator não lê os hashes", () => {
    const r = como(
      COM_FATOR,
      "aal1",
      `select count(*) from public.user_recovery_codes where user_id = '${COM_FATOR}';`,
    );
    expect(r).toMatchObject({ ok: true, out: "0" });
  });

  it("controle: a mesma pessoa em aal2 lê e grava", () => {
    expect(como(COM_FATOR, "aal2", gravar(COM_FATOR, "CODIGO-NOVO")).ok).toBe(true);
    const r = como(
      COM_FATOR,
      "aal2",
      `select count(*) from public.user_recovery_codes where user_id = '${COM_FATOR}';`,
    );
    expect(r).toMatchObject({ ok: true, out: "2" });
  });

  it("controle: quem não tem fator segue igual em aal1", () => {
    expect(como(SEM_FATOR, "aal1", gravar(SEM_FATOR, "QUALQUER")).ok).toBe(true);
  });

  it("anon não tem privilégio nenhum na tabela", () => {
    expect(
      lastLine(
        sql(
          `select has_table_privilege('anon', 'public.user_recovery_codes', 'select,insert,update,delete')::text;`,
        ),
      ),
    ).toBe("false");
  });
});

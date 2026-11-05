/**
 * Migration 0500 — a MFA provada vale para a escrita DIRETA pelo PostgREST.
 *
 * Achado da auditoria de segurança de 04/11/2026: `requireRole` devolvia 403
 * `mfa_required` à sessão `aal1` de quem tem segundo fator, mas a RLS das
 * tabelas de organização só olhava papel e vínculo. Com a senha roubada e sem o
 * celular, a mesma sessão escrevia pela REST (anon key + o JWT que o navegador
 * já tem) o que a tela recusava.
 *
 * Os três lados são medidos, porque recusar TUDO também passaria num teste que
 * só olhasse a recusa:
 *   - quem TEM fator verificado, em `aal1`: recusado;
 *   - o mesmo usuário em `aal2`: escreve;
 *   - quem NÃO cadastrou fator, em `aal1`: escreve (a política de cadastro é
 *     opcional por decisão do produto — ver CLAUDE.md, Auth & RBAC).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

const ORG = "0500aaaa-0000-4000-8000-000000000001";
const COM_FATOR = "0500aaaa-1111-4000-8000-000000000001";
const SEM_FATOR = "0500aaaa-1111-4000-8000-000000000002";
const FATOR = "0500aaaa-2222-4000-8000-000000000001";
const CONTATO = "0500aaaa-3333-4000-8000-000000000001";

function como(
  userId: string,
  aal: "aal1" | "aal2",
  stmt: string,
): { ok: true; out: string } | { ok: false; erro: string } {
  try {
    const out = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}","aal":"${aal}"}', false);
      ${stmt}
    `);
    return { ok: true, out: lastLine(out) };
  } catch (err) {
    return { ok: false, erro: String((err as { stderr?: string }).stderr ?? err) };
  }
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${COM_FATOR}', 'p0500-com@invariant.test'),
      ('${SEM_FATOR}', 'p0500-sem@invariant.test')
      on conflict do nothing;
    insert into auth.mfa_factors (id, user_id, status, factor_type)
      values ('${FATOR}', '${COM_FATOR}', 'verified', 'totp') on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'p0500-org', 'Org 0500', 'Org 0500') on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${COM_FATOR}', '${ORG}', 'admin', now()),
      ('${SEM_FATOR}', '${ORG}', 'admin', now())
      on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Original 0500') on conflict do nothing;
  `);
});

const inserir = (nome: string) =>
  `insert into public.contacts (organization_id, display_name) values ('${ORG}', '${nome}');`;

describe("0500 — sessão aal1 de quem tem fator não escreve pela REST", () => {
  it("insert recusado", () => {
    expect(como(COM_FATOR, "aal1", inserir("forjado-aal1")).ok).toBe(false);
  });

  it("update não altera linha", () => {
    como(
      COM_FATOR,
      "aal1",
      `update public.contacts set display_name = 'adulterado' where id = '${CONTATO}';`,
    );
    expect(lastLine(sql(`select display_name from public.contacts where id = '${CONTATO}';`))).toBe(
      "Original 0500",
    );
  });

  it("controle: a mesma pessoa em aal2 escreve", () => {
    expect(como(COM_FATOR, "aal2", inserir("legitimo-aal2")).ok).toBe(true);
  });

  it("controle: quem não cadastrou fator segue escrevendo em aal1", () => {
    expect(como(SEM_FATOR, "aal1", inserir("sem-fator-aal1")).ok).toBe(true);
  });

  it("controle: a leitura em aal1 continua (a tela do desafio precisa ler)", () => {
    const r = como(
      COM_FATOR,
      "aal1",
      `select count(*) from public.contacts where organization_id = '${ORG}';`,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number(r.out)).toBeGreaterThan(0);
  });
});

describe("0500 — a trava cobre toda tabela que o login pode escrever", () => {
  it("toda tabela com support_write_insert tem também mfa_write_insert", () => {
    const faltando = lastLine(
      sql(`
        select count(*) from pg_policies s
         where s.schemaname = 'public' and s.policyname = 'support_write_insert'
           and not exists (
             select 1 from pg_policies m
              where m.schemaname = 'public' and m.tablename = s.tablename
                and m.policyname = 'mfa_write_insert' and m.permissive = 'RESTRICTIVE');
      `),
    );
    expect(faltando).toBe("0");
  });
});

/**
 * Tabelas que só o servidor lê e grava (RLS ligada e sem policy, ou sem GRANT):
 *   - `ajuda_mensagens` (migration 0494): perguntas ao assistente de ajuda;
 *   - `transactional_email_log` (migration 0493): livro dos e-mails de relacionamento.
 *
 * Prova pelo comportamento, com dois tenants reais por JWT: membro de cada
 * organização — admin inclusive — não lê nenhuma linha (nem da própria, nem da
 * vizinha) e não consegue inserir. É a prova que `rls-completude-varredura`
 * cobra de toda tabela com organization_id.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ORG_A = "5e5e5e5e-0000-4000-8000-000000000001";
const ORG_B = "5e5e5e5e-0000-4000-8000-000000000002";
const ADMIN_A = "5e5e5e5e-1111-4000-8000-000000000001";
const ADMIN_B = "5e5e5e5e-1111-4000-8000-000000000002";

/** Resultado como o usuário logado: número de linhas, ou "negado" se o banco recusou. */
function como(userId: string, comando: string): number | "negado" {
  try {
    const out = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
      ${comando}
    `);
    const ultima = out.split("\n").at(-1) ?? "";
    return /^\d+$/.test(ultima) ? Number(ultima) : "negado";
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    if (/permission denied|row-level security/.test(stderr)) return "negado";
    throw err;
  }
}
const nadaOuNegado = (r: number | "negado") => r === 0 || r === "negado";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ADMIN_A}', 'servidor-a@invariant.test'), ('${ADMIN_B}', 'servidor-b@invariant.test');
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'so-servidor-a', 'Só servidor A', 'Só servidor A'),
      ('${ORG_B}', 'so-servidor-b', 'Só servidor B', 'Só servidor B');
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}', '${ORG_A}', 'admin', now()), ('${ADMIN_B}', '${ORG_B}', 'admin', now());
    insert into public.ajuda_mensagens (organization_id, user_id, pergunta) values
      ('${ORG_A}', '${ADMIN_A}', 'pergunta A'), ('${ORG_B}', '${ADMIN_B}', 'pergunta B');
    insert into public.transactional_email_log (organization_id, dedupe_key, tipo) values
      ('${ORG_A}', 'boas_vindas:a', 'boas_vindas'), ('${ORG_B}', 'boas_vindas:b', 'boas_vindas');
  `);
});

describe.each(["ajuda_mensagens", "transactional_email_log"])("%s é só do servidor", (tabela) => {
  it("o servidor tem as linhas das duas organizações", () => {
    expect(
      sql(
        `select count(*) from public.${tabela} where organization_id in ('${ORG_A}','${ORG_B}');`,
      ),
    ).toBe("2");
  });

  it("membro (admin) de cada organização não lê nada — nem a própria, nem a vizinha", () => {
    for (const u of [ADMIN_A, ADMIN_B]) {
      expect(nadaOuNegado(como(u, `select count(*) from public.${tabela};`))).toBe(true);
    }
  });

  it("membro não consegue gravar direto", () => {
    const valores =
      tabela === "ajuda_mensagens"
        ? `(organization_id, pergunta) values ('${ORG_A}', 'injetada')`
        : `(organization_id, dedupe_key, tipo) values ('${ORG_A}', 'injetada', 'boas_vindas')`;
    const r = como(
      ADMIN_A,
      `with w as (insert into public.${tabela} ${valores} returning 1) select count(*) from w;`,
    );
    expect(nadaOuNegado(r)).toBe(true);
    expect(sql(`select count(*) from public.${tabela} where organization_id = '${ORG_A}';`)).toBe(
      "1",
    );
  });
});

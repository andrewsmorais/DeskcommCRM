/**
 * Setores de atendimento (migration 0496), contra o Postgres real:
 *   - o atendente lê os setores da organização, mas só gerente/admin cria,
 *     muda ou apaga (setores e setor_membros) — pela RLS, como `authenticated`;
 *   - o nome é único na organização, sem diferença de maiúscula;
 *   - apagar o setor zera só o `setor_id` da conversa (a conversa e a
 *     organização dela ficam);
 *   - tirar a pessoa da organização tira ela dos setores.
 * O isolamento entre organizações é medido em rls-isolation.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

const ORG = "5e5e5e5e-0000-4000-8000-000000000001";
const GERENTE = "5e5e5e5e-1111-4000-8000-000000000001";
const ATENDENTE = "5e5e5e5e-1111-4000-8000-000000000002";
const SESSAO = "5e5e5e5e-2222-4000-8000-000000000001";
const CONTATO = "5e5e5e5e-3333-4000-8000-000000000001";
const CONVERSA = "5e5e5e5e-4444-4000-8000-000000000001";
const SETOR = "5e5e5e5e-5555-4000-8000-000000000001";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${GERENTE}', 'setores-gerente@invariant.test'),
      ('${ATENDENTE}', 'setores-atendente@invariant.test');
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'setores-inv', 'Setores', 'Setores');
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${GERENTE}', '${ORG}', 'manager', now()),
      ('${ATENDENTE}', '${ORG}', 'agent', now());
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values ('${SESSAO}', '${ORG}', 'setores-inv', '\\x00'::bytea);
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Cliente dos setores');
    insert into public.setores (id, organization_id, nome) values ('${SETOR}', '${ORG}', 'Vendas');
    insert into public.setor_membros (organization_id, setor_id, user_id)
      values ('${ORG}', '${SETOR}', '${ATENDENTE}');
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, setor_id)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'open', '${SETOR}');
  `);
});

describe("setores", () => {
  it("o atendente lê os setores e os membros da organização", () => {
    expect(
      countAs(ATENDENTE, `select count(*) from public.setores where organization_id = '${ORG}';`),
    ).toBe(1);
    expect(
      countAs(
        ATENDENTE,
        `select count(*) from public.setor_membros where organization_id = '${ORG}';`,
      ),
    ).toBe(1);
  });

  it("o atendente não cria, não renomeia e não apaga setor; não mexe em membros", () => {
    expect(
      writeCountAs(
        ATENDENTE,
        `insert into public.setores (organization_id, nome) values ('${ORG}', 'Suporte')`,
      ),
    ).toBe(0);
    expect(
      writeCountAs(ATENDENTE, `update public.setores set nome = 'Outro' where id = '${SETOR}'`),
    ).toBe(0);
    expect(writeCountAs(ATENDENTE, `delete from public.setores where id = '${SETOR}'`)).toBe(0);
    expect(
      writeCountAs(ATENDENTE, `delete from public.setor_membros where setor_id = '${SETOR}'`),
    ).toBe(0);
  });

  it("o gerente cria e renomeia", () => {
    expect(
      writeCountAs(
        GERENTE,
        `insert into public.setores (organization_id, nome) values ('${ORG}', 'Suporte')`,
      ),
    ).toBe(1);
    expect(
      writeCountAs(
        GERENTE,
        `update public.setores set descricao = 'Pós-venda' where organization_id = '${ORG}' and nome = 'Suporte'`,
      ),
    ).toBe(1);
  });

  it("o nome é único na organização, sem diferença de maiúscula", () => {
    expect(() =>
      sql(`insert into public.setores (organization_id, nome) values ('${ORG}', '  vendas ');`),
    ).toThrow(/setores_nome_unico/);
  });

  it("apagar o setor zera só o setor da conversa", () => {
    sql(`delete from public.setores where id = '${SETOR}';`);
    const linha = sql(
      `select organization_id || '|' || coalesce(setor_id::text, 'nulo') from public.conversations where id = '${CONVERSA}';`,
    );
    expect(linha.split("\n").at(-1)).toBe(`${ORG}|nulo`);
    expect(
      Number(sql(`select count(*) from public.setor_membros where setor_id = '${SETOR}';`)),
    ).toBe(0);
  });

  it("quem sai da organização sai dos setores", () => {
    sql(`
      insert into public.setores (organization_id, nome) values ('${ORG}', 'Financeiro');
      insert into public.setor_membros (organization_id, setor_id, user_id)
        select '${ORG}', id, '${ATENDENTE}' from public.setores where organization_id = '${ORG}' and nome = 'Financeiro';
      delete from public.user_organizations where organization_id = '${ORG}' and user_id = '${ATENDENTE}';
    `);
    expect(
      Number(sql(`select count(*) from public.setor_membros where user_id = '${ATENDENTE}';`)),
    ).toBe(0);
  });
});

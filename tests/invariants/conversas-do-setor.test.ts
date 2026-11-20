/**
 * O atendente vê as conversas do próprio setor (migration 0543, fatia 1 do O7).
 *
 * Com `visibility_mode = 'own_and_sector'`, o atendente vê a própria carteira e
 * as conversas do setor em que está — inclusive as que estão com um colega — e
 * não vê as dos outros setores. Medido pela RLS de verdade, como cada papel:
 *   - o colega do setor vê a conversa do colega (e as mensagens, que herdam);
 *   - quem é de outro setor não vê;
 *   - quem não está em setor nenhum vê só as suas;
 *   - conversa privada continua só de quem já podia;
 *   - em outro modo (`own_and_unassigned`) o setor não abre nada;
 *   - a organização vizinha nunca vê.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";

const ORG = "cdcdcdcd-0000-4000-8000-000000000001";
const VIZINHA = "cdcdcdcd-0000-4000-8000-000000000002";
const ANA = "cdcdcdcd-1111-4000-8000-000000000001"; // vendas, dona da conversa
const BIA = "cdcdcdcd-1111-4000-8000-000000000002"; // vendas
const CAIO = "cdcdcdcd-1111-4000-8000-000000000003"; // suporte
const DANI = "cdcdcdcd-1111-4000-8000-000000000004"; // sem setor
const ESTRANHO = "cdcdcdcd-1111-4000-8000-000000000005"; // outra organização
const VENDAS = "cdcdcdcd-2222-4000-8000-000000000001";
const SUPORTE = "cdcdcdcd-2222-4000-8000-000000000002";
const SESSAO = "cdcdcdcd-3333-4000-8000-000000000001";
const CONTATO = "cdcdcdcd-4444-4000-8000-000000000001";
const CONVERSA = "cdcdcdcd-5555-4000-8000-000000000001";

const vê = (u: string) =>
  countAs(u, `select count(*) from public.conversations where id = '${CONVERSA}';`);
const vêMensagens = (u: string) =>
  countAs(u, `select count(*) from public.messages where conversation_id = '${CONVERSA}';`);
const modo = (m: string) =>
  sql(
    `update public.organizations set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('visibility_mode', '${m}') where id = '${ORG}';`,
  );
const privar = (v: boolean) =>
  sql(`update public.conversations set is_private = ${v} where id = '${CONVERSA}';`);

beforeAll(() => {
  const usuarios = [ANA, BIA, CAIO, DANI, ESTRANHO];
  sql(`
    ${usuarios.map((id, i) => `insert into auth.users (id, email) values ('${id}', 'setor-${i}@invariant.test') on conflict do nothing;`).join("\n")}
    insert into public.organizations (id, slug, legal_name, display_name, settings) values
      ('${ORG}', 'conversas-do-setor', 'Setor', 'Setor', jsonb_build_object('visibility_mode', 'own_and_sector')),
      ('${VIZINHA}', 'conversas-do-setor-vizinha', 'Vizinha', 'Vizinha', jsonb_build_object('visibility_mode', 'own_and_sector'))
      on conflict do nothing;
    ${[ANA, BIA, CAIO, DANI].map((id) => `insert into public.user_organizations (user_id, organization_id, role, accepted_at) values ('${id}', '${ORG}', 'agent', now()) on conflict do nothing;`).join("\n")}
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${ESTRANHO}', '${VIZINHA}', 'agent', now()) on conflict do nothing;
    insert into public.setores (id, organization_id, nome) values
      ('${VENDAS}', '${ORG}', 'Vendas'), ('${SUPORTE}', '${ORG}', 'Suporte') on conflict do nothing;
    insert into public.setor_membros (organization_id, setor_id, user_id) values
      ('${ORG}', '${VENDAS}', '${ANA}'), ('${ORG}', '${VENDAS}', '${BIA}'), ('${ORG}', '${SUPORTE}', '${CAIO}')
      on conflict do nothing;
    do $p$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO}', '${ORG}', 'conversas-do-setor', '\\x00'::bytea);
    exception when unique_violation then null; end $p$;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Cliente do setor') on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id, assigned_at, setor_id)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'claimed', '${ANA}', now(), '${VENDAS}')
      on conflict do nothing;
    insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
      values ('${ORG}', '${CONVERSA}', '${SESSAO}', '${CONTATO}', 'text', 'inbound', 'oi');
  `);
});

describe("conversas do setor (own_and_sector)", () => {
  it("o colega do mesmo setor vê a conversa do colega, e as mensagens dela", () => {
    modo("own_and_sector");
    privar(false);
    expect(vê(ANA)).toBe(1);
    expect(vê(BIA)).toBe(1);
    expect(vêMensagens(BIA)).toBe(1);
  });

  it("quem é de outro setor, ou de setor nenhum, não vê", () => {
    modo("own_and_sector");
    privar(false);
    expect(vê(CAIO)).toBe(0);
    expect(vêMensagens(CAIO)).toBe(0);
    expect(vê(DANI)).toBe(0);
  });

  it("a organização vizinha nunca vê", () => {
    modo("own_and_sector");
    expect(vê(ESTRANHO)).toBe(0);
  });

  it("conversa privada continua só de quem já podia", () => {
    modo("own_and_sector");
    privar(true);
    expect(vê(ANA)).toBe(1);
    expect(vê(BIA)).toBe(0);
    privar(false);
  });

  it("em outro modo, estar no setor não abre a conversa do colega", () => {
    modo("own_and_unassigned");
    expect(vê(BIA)).toBe(0);
    modo("own_and_sector");
    expect(vê(BIA)).toBe(1);
  });

  it("a função do escopo não é alcançável por anon", () => {
    const pode = sql(
      `select has_function_privilege('anon', 'public.fn_escopo_de_setor_da_conversa()', 'execute');`,
    );
    expect(pode.trim().split("\n").at(-1)?.trim()).toBe("f");
  });
});

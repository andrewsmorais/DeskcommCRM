import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Relatório por etiqueta (migration 0558) contra o Postgres REAL do baseline.
 *
 * `fn_tag_metrics` é SECURITY INVOKER: quem separa organização e atendente é a RLS
 * de `conversations`/`messages`, não o `p_org`. Prova aqui: a régua da irmã por canal
 * (bot fora, vazamento fora da média), a MEDIANA, conversa com várias etiquetas
 * contando em cada uma, e o que um `p_org` forjado NÃO alcança.
 *
 * Namespace c5580… (exclusivo deste arquivo). Timestamps LITERAIS fixos.
 */

const ORG = "c5580000-0000-4000-8000-000000000001";
const ORG_2 = "c5580000-0000-4000-8000-000000000002";
const AGENT_A = "c5580000-1111-4000-8000-000000000001";
const AGENT_B = "c5580000-1111-4000-8000-000000000002";
const MANAGER = "c5580000-1111-4000-8000-000000000003";
const MANAGER_2 = "c5580000-1111-4000-8000-000000000004";
const S1 = "c5580000-2222-4000-8000-000000000001";
const S_ORG2 = "c5580000-2222-4000-8000-000000000002";
const CT = (n: number) => `c5580000-3333-4000-8000-00000000000${n}`;
const CV = (n: number) => `c5580000-4444-4000-8000-00000000000${n}`;

const FROM = "2026-07-01T00:00:00+00";
const TO = "2026-07-31T00:00:00+00";
const IN = "2026-07-10T12:00:00+00";
const OLD = "2026-05-01T12:00:00+00";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}', 'r5580-agent-a@invariant.test'),
      ('${AGENT_B}', 'r5580-agent-b@invariant.test'),
      ('${MANAGER}', 'r5580-manager@invariant.test'),
      ('${MANAGER_2}', 'r5580-manager-2@invariant.test')
    on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}',   'r5580-etq',   'R5580 Etq Org',   'R5580 Etq'),
      ('${ORG_2}', 'r5580-etq-2', 'R5580 Etq Org 2', 'R5580 Etq 2')
    on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENT_A}',   '${ORG}',   'agent',   now()),
      ('${AGENT_B}',   '${ORG}',   'agent',   now()),
      ('${MANAGER}',   '${ORG}',   'manager', now()),
      ('${MANAGER_2}', '${ORG_2}', 'manager', now())
    on conflict do nothing;

    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted, display_name) values
      ('${S1}',     '${ORG}',   'r5580-s1',     '\\x00'::bytea, 'Numero Um'),
      ('${S_ORG2}', '${ORG_2}', 'r5580-s-org2', '\\x00'::bytea, 'Outra Org');

    insert into public.contacts (id, organization_id, display_name) values
      ('${CT(1)}', '${ORG}', 'R5580 C1'), ('${CT(2)}', '${ORG}', 'R5580 C2'),
      ('${CT(3)}', '${ORG}', 'R5580 C3'), ('${CT(4)}', '${ORG}', 'R5580 C4'),
      ('${CT(5)}', '${ORG}', 'R5580 C5'), ('${CT(6)}', '${ORG}', 'R5580 C6'),
      ('${CT(7)}', '${ORG_2}', 'R5580 C7');

    -- CV1: {vip, recompra} (A, humano em 60s)   CV2: {vip} (B, 120s)
    -- CV3: {vip} (A, 600s)                      CV4: {recompra} (A, SEM resposta humana)
    -- CV5: {vip}, atribuída FORA da janela      CV6: sem etiqueta
    -- CV7: outra organização, {vip}
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id, assigned_at, assignee_kind, tags) values
      ('${CV(1)}', '${ORG}',   '${CT(1)}', '${S1}',     'claimed', '${AGENT_A}',   '${IN}',  'user', array['vip','recompra']),
      ('${CV(2)}', '${ORG}',   '${CT(2)}', '${S1}',     'claimed', '${AGENT_B}',   '${IN}',  'user', array['vip']),
      ('${CV(3)}', '${ORG}',   '${CT(3)}', '${S1}',     'claimed', '${AGENT_A}',   '${IN}',  'user', array['vip']),
      ('${CV(4)}', '${ORG}',   '${CT(4)}', '${S1}',     'claimed', '${AGENT_A}',   '${IN}',  'user', array['recompra']),
      ('${CV(5)}', '${ORG}',   '${CT(5)}', '${S1}',     'claimed', '${AGENT_A}',   '${OLD}', 'user', array['vip']),
      ('${CV(6)}', '${ORG}',   '${CT(6)}', '${S1}',     'claimed', '${AGENT_A}',   '${IN}',  'user', array[]::text[]),
      ('${CV(7)}', '${ORG_2}', '${CT(7)}', '${S_ORG2}', 'claimed', '${MANAGER_2}', '${IN}',  'user', array['vip']);

    insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, sent_via, sent_by_user_id, sent_at) values
      ('${ORG}', '${CV(1)}', '${S1}', '${CT(1)}', 'text', 'inbound',  'crm',  null,         '${IN}'),
      ('${ORG}', '${CV(1)}', '${S1}', '${CT(1)}', 'text', 'outbound', 'ai',   null,         '2026-07-10T12:00:10+00'),
      ('${ORG}', '${CV(1)}', '${S1}', '${CT(1)}', 'text', 'outbound', 'user', '${AGENT_A}', '2026-07-10T12:01:00+00'),
      ('${ORG}', '${CV(2)}', '${S1}', '${CT(2)}', 'text', 'inbound',  'crm',  null,         '${IN}'),
      ('${ORG}', '${CV(2)}', '${S1}', '${CT(2)}', 'text', 'outbound', 'user', '${AGENT_B}', '2026-07-10T12:02:00+00'),
      ('${ORG}', '${CV(3)}', '${S1}', '${CT(3)}', 'text', 'inbound',  'crm',  null,         '${IN}'),
      ('${ORG}', '${CV(3)}', '${S1}', '${CT(3)}', 'text', 'outbound', 'user', '${AGENT_A}', '2026-07-10T12:10:00+00'),
      ('${ORG}', '${CV(4)}', '${S1}', '${CT(4)}', 'text', 'inbound',  'crm',  null,         '${IN}'),
      ('${ORG}', '${CV(4)}', '${S1}', '${CT(4)}', 'text', 'outbound', 'ai',   null,         '2026-07-10T12:00:05+00'),
      ('${ORG_2}', '${CV(7)}', '${S_ORG2}', '${CT(7)}', 'text', 'inbound',  'crm',  null,           '${IN}'),
      ('${ORG_2}', '${CV(7)}', '${S_ORG2}', '${CT(7)}', 'text', 'outbound', 'user', '${MANAGER_2}', '2026-07-10T12:00:20+00');
  `);
});

function asRole(actorId: string): string {
  return `set role authenticated;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${actorId}"}', false); end $c$;`;
}

type Linha = {
  tag: string;
  conversations_handled: number;
  avg_first_response_seconds: number | null;
  median_first_response_seconds: number | null;
  sem_resposta: number;
};

function etiquetas(actorId: string, org: string, owner?: string): Linha[] {
  const p_owner = owner ? `'${owner}'::uuid` : "null";
  const out = sql(`
    ${asRole(actorId)}
    select 'ROW:' || (public.fn_tag_metrics('${org}', '${FROM}', '${TO}', ${p_owner}) -> 'tags')::text;
  `);
  return JSON.parse(out.split("\n").pop()!.replace(/^ROW:/, "")) as Linha[];
}

function resumo(linhas: Linha[]) {
  const r = (n: number | null) => (n == null ? null : Math.round(n));
  return linhas.map((l) => ({
    tag: l.tag,
    conversas: l.conversations_handled,
    media: r(l.avg_first_response_seconds),
    mediana: r(l.median_first_response_seconds),
    sem: l.sem_resposta,
  }));
}

describe("fn_tag_metrics — no banco real", () => {
  it("manager: vip = 3 conversas, média 260s, MEDIANA 120s; recompra = 2, uma sem resposta", () => {
    expect(resumo(etiquetas(MANAGER, ORG))).toEqual([
      { tag: "vip", conversas: 3, media: 260, mediana: 120, sem: 0 },
      { tag: "recompra", conversas: 2, media: 60, mediana: 60, sem: 1 },
    ]);
  });

  it("conversa com duas etiquetas conta em cada uma (por isso a soma passa do total de conversas)", () => {
    const soma = etiquetas(MANAGER, ORG).reduce((s, l) => s + l.conversations_handled, 0);
    expect(soma).toBe(5); // 4 conversas com etiqueta na janela, uma delas com duas
  });

  it("fora da janela, sem etiqueta e IA respondendo não entram", () => {
    const vip = etiquetas(MANAGER, ORG).find((l) => l.tag === "vip")!;
    expect(vip.conversations_handled).toBe(3); // CV5 (fora da janela) não conta
    expect(etiquetas(MANAGER, ORG).map((l) => l.tag)).not.toContain(""); // CV6 sem etiqueta
  });

  it("agent vê só as PRÓPRIAS conversas (a RLS escopa)", () => {
    expect(resumo(etiquetas(AGENT_B, ORG))).toEqual([
      { tag: "vip", conversas: 1, media: 120, mediana: 120, sem: 0 },
    ]);
  });

  it("p_owner recorta pelo atendente", () => {
    expect(resumo(etiquetas(MANAGER, ORG, AGENT_B))).toEqual([
      { tag: "vip", conversas: 1, media: 120, mediana: 120, sem: 0 },
    ]);
  });

  it("p_org de OUTRA organização devolve [] — nos dois sentidos", () => {
    expect(etiquetas(MANAGER_2, ORG)).toEqual([]);
    expect(etiquetas(MANAGER, ORG_2)).toEqual([]);
    expect(resumo(etiquetas(MANAGER_2, ORG_2))).toEqual([
      { tag: "vip", conversas: 1, media: 20, mediana: 20, sem: 0 },
    ]);
  });

  it("anon NÃO executa a função; authenticated executa", () => {
    const out = sql(`
      select has_function_privilege('anon', 'public.fn_tag_metrics(uuid,timestamptz,timestamptz,uuid)', 'execute')
        || '|' ||
        has_function_privilege('authenticated', 'public.fn_tag_metrics(uuid,timestamptz,timestamptz,uuid)', 'execute');
    `);
    expect(out.split("\n").pop()).toBe("false|true");
  });
});

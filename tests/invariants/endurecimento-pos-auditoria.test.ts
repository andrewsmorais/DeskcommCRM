/**
 * Migration 0499 — as portas que o PostgREST abria a membros, fechadas no BANCO.
 *
 * A auditoria de segurança de 04/11/2026 reproduziu cada caso abaixo num banco
 * fresco com o baseline, usando só o JWT do próprio membro (o mesmo que o
 * browser já tem) contra a REST. Este arquivo mede o depois, sempre com o
 * controle positivo ao lado: recusar TUDO também passaria num teste que só
 * olhasse a recusa.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { countAs, lastLine, sql } from "./gov-helpers";

const ORG = "0499aaaa-0000-4000-8000-000000000001";
const OUTRA = "0499aaaa-0000-4000-8000-000000000002";
const ADMIN = "0499aaaa-1111-4000-8000-000000000001";
const GERENTE = "0499aaaa-1111-4000-8000-000000000002";
const ATENDENTE_A = "0499aaaa-1111-4000-8000-000000000003";
const ATENDENTE_B = "0499aaaa-1111-4000-8000-000000000004";
const LEITOR = "0499aaaa-1111-4000-8000-000000000005";
const PLATAFORMA = "0499aaaa-1111-4000-8000-000000000006";
const SESSAO = "0499aaaa-2222-4000-8000-000000000001";
const CONTATO = "0499aaaa-3333-4000-8000-000000000001";
const CONVERSA = "0499aaaa-4444-4000-8000-000000000001";
const MENSAGEM = "0499aaaa-5555-4000-8000-000000000001";
const COMANDA_OUTRA = "0499aaaa-6666-4000-8000-000000000001";

const PAPEIS: [string, string][] = [
  [ADMIN, "admin"],
  [GERENTE, "manager"],
  [ATENDENTE_A, "agent"],
  [ATENDENTE_B, "agent"],
  [LEITOR, "viewer"],
];

/** Roda `stmt` como `authenticated` com o JWT de `userId`; devolve a saída ou o erro. */
function como(
  userId: string,
  stmt: string,
): { ok: true; out: string } | { ok: false; erro: string } {
  try {
    const out = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
      ${stmt}
    `);
    return { ok: true, out: lastLine(out) };
  } catch (err) {
    return { ok: false, erro: String((err as { stderr?: string }).stderr ?? err) };
  }
}

beforeAll(() => {
  sql(`
    ${[...PAPEIS.map(([id]) => id), PLATAFORMA]
      .map(
        (id, i) =>
          `insert into auth.users (id, email) values ('${id}', 'p0499-${i}@invariant.test') on conflict do nothing;`,
      )
      .join("\n")}
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'p0499-org', 'Org 0499', 'Org 0499'),
             ('${OUTRA}', 'p0499-outra', 'Outra 0499', 'Outra 0499');
    ${PAPEIS.map(([id, papel]) => `insert into public.user_organizations (user_id, organization_id, role, accepted_at) values ('${id}', '${ORG}', '${papel}', now()) on conflict do nothing;`).join("\n")}
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${ATENDENTE_A}', '${OUTRA}', 'viewer', now()) on conflict do nothing;
    insert into public.platform_admins (user_id, granted_by, reason)
      values ('${PLATAFORMA}', '${PLATAFORMA}', 'invariante 0499') on conflict do nothing;
    do $p$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO}', '${ORG}', 'p0499', '\\x00'::bytea);
    exception when unique_violation then null; end $p$;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Cliente 0499');
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id, assigned_at)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'claimed', '${ATENDENTE_B}', now());
    insert into public.messages (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, body, media_url)
      values ('${MENSAGEM}', '${ORG}', '${CONVERSA}', '${SESSAO}', '${CONTATO}', 'image', 'inbound', 'foto', 'https://provedor.exemplo/m.jpg');
    insert into public.sales (id, organization_id, number) values ('${COMANDA_OUTRA}', '${OUTRA}', 1);
    insert into public.webhook_events_log (organization_id, raw_body, headers)
      values ('${ORG}', '{}', '{"content-type":"application/json"}'::jsonb);
  `);
});

describe("0499 — a trilha de auditoria não aceita linha do PostgREST", () => {
  it("leitor (e até admin) não insere em api_audit_log", () => {
    for (const quem of [LEITOR, ADMIN]) {
      const r = como(
        quem,
        `insert into public.api_audit_log (organization_id, actor_user_id, action) values ('${ORG}', '${ADMIN}', 'forjada');`,
      );
      expect(r.ok).toBe(false);
    }
  });

  it("controle: a service role (dona do schema aqui) segue gravando", () => {
    expect(() =>
      sql(
        `insert into public.api_audit_log (organization_id, action) values ('${ORG}', 'controle.0499');`,
      ),
    ).not.toThrow();
  });
});

describe("0499 — memória da organização: membro lê, só o servidor escreve", () => {
  it("leitor e atendente não gravam entrada nem movem o ponteiro", () => {
    for (const quem of [LEITOR, ATENDENTE_A, ADMIN]) {
      const r = como(
        quem,
        `insert into public.org_memory_entries (organization_id, title, body, source, status) values ('${ORG}', 't', 'b', 'manual', 'active');`,
      );
      expect(r.ok).toBe(false);
    }
  });

  it("controle: o membro continua LENDO a memória", () => {
    sql(
      `insert into public.org_memory_entries (organization_id, title, body, source, status) values ('${ORG}', 'regra', 'corpo', 'manual', 'active');`,
    );
    expect(
      countAs(
        LEITOR,
        `select count(*) from public.org_memory_entries where organization_id = '${ORG}';`,
      ),
    ).toBeGreaterThan(0);
  });
});

describe("0499 — emit_event: comando é do servidor", () => {
  it.each([
    "user.mentioned",
    "media.persist_requested",
    "ai_agent.dispatch_requested",
    "chatbot.inicio_requested",
  ])("leitor não emite %s", (tipo) => {
    const r = como(
      LEITOR,
      `select public.emit_event('${tipo}', 'message', '${MENSAGEM}', '{}'::jsonb, '{}'::jsonb, '${ORG}');`,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("reserved_command_event");
  });

  it("controle: evento de fato comum segue aceito", () => {
    const r = como(
      LEITOR,
      `select public.emit_event('contact.viewed', 'contact', '${CONTATO}', '{}'::jsonb, '{}'::jsonb, '${ORG}') is not null;`,
    );
    expect(r).toMatchObject({ ok: true, out: "t" });
  });
});

describe("0499 — atribuir conversa exige poder vê-la", () => {
  it("atendente A não toma para si a conversa de B (escopo padrão: as suas e as sem dono)", () => {
    const r = como(
      ATENDENTE_A,
      `select count(*) from public.fn_conversation_assign('${ORG}', '${CONVERSA}', '${ATENDENTE_A}', 'claim');`,
    );
    expect(r).toMatchObject({ ok: true, out: "0" });
    expect(
      lastLine(
        sql(`select assigned_to_user_id from public.conversations where id = '${CONVERSA}';`),
      ),
    ).toBe(ATENDENTE_B);
  });

  it("controle: o gerente, que vê, transfere", () => {
    const r = como(
      GERENTE,
      `select count(*) from public.fn_conversation_assign('${ORG}', '${CONVERSA}', '${ATENDENTE_A}', 'transfer');`,
    );
    expect(r).toMatchObject({ ok: true, out: "1" });
  });
});

describe("0499 — item de comanda é da mesma organização da comanda", () => {
  it("item da org A numa comanda da org B é recusado", () => {
    expect(() =>
      sql(
        `insert into public.sale_items (organization_id, sale_id, description, unit_price_cents, total_cents) values ('${ORG}', '${COMANDA_OUTRA}', 'x', 100, 100);`,
      ),
    ).toThrow(/sale_item_org_mismatch/);
  });

  it("controle: item da mesma organização entra", () => {
    expect(() =>
      sql(
        `insert into public.sale_items (organization_id, sale_id, description, unit_price_cents, total_cents) values ('${OUTRA}', '${COMANDA_OUTRA}', 'ok', 100, 100);`,
      ),
    ).not.toThrow();
  });
});

describe("0499 — webhook_events_log a partir de gerente", () => {
  it("leitor não vê o log; gerente vê", () => {
    expect(
      countAs(
        LEITOR,
        `select count(*) from public.webhook_events_log where organization_id = '${ORG}';`,
      ),
    ).toBe(0);
    expect(
      countAs(
        GERENTE,
        `select count(*) from public.webhook_events_log where organization_id = '${ORG}';`,
      ),
    ).toBeGreaterThan(0);
  });
});

describe("0499 — vínculo de IA na chave da instalação é da plataforma", () => {
  it("admin do tenant não grava vínculo sem credencial", () => {
    const r = como(
      ADMIN,
      `insert into public.ai_purpose_bindings (organization_id, purpose, provider, model_id) values ('${ORG}', 'chat', 'anthropic', 'modelo-caro');`,
    );
    expect(r.ok).toBe(false);
  });
});

describe("0499 — api_tokens", () => {
  const emitir = (quem: string, prefixo: string) =>
    como(
      quem,
      `insert into public.api_tokens (organization_id, created_by, name, prefix, token_hash) values ('${ORG}', '${quem}', 'i', '${prefixo}', decode(md5('${prefixo}'), 'hex'));`,
    );

  it("admin da plataforma sem vínculo não emite token numa org alheia", () => {
    expect(emitir(PLATAFORMA, "dsk_plat0499").ok).toBe(false);
  });

  it("controle: o admin do tenant emite", () => {
    expect(emitir(ADMIN, "dsk_admn0499").ok).toBe(true);
  });
});

describe("0499 — tenant_integrations e ponteiro de mídia só pelo servidor", () => {
  it("membro não lê tenant_integrations", () => {
    expect(como(ADMIN, `select count(*) from public.tenant_integrations;`).ok).toBe(false);
  });

  it("membro não reescreve media_url", () => {
    const r = como(
      ADMIN,
      `update public.messages set media_url = 'https://atacante.exemplo/k' where id = '${MENSAGEM}';`,
    );
    expect(r.ok).toBe(false);
    expect(lastLine(sql(`select media_url from public.messages where id = '${MENSAGEM}';`))).toBe(
      "https://provedor.exemplo/m.jpg",
    );
  });
});

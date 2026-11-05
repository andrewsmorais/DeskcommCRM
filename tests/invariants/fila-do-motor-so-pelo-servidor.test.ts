/**
 * Migration 0501 — a fila do motor e a fila de exclusão de mídia são do
 * servidor, e o ramo de plataforma das políticas respeita escopo e MFA.
 *
 * A auditoria de segurança de 04/11/2026 reproduziu, num banco fresco com o
 * baseline e o JWT de quem explora:
 *   - um LEITOR gravando em `cron_jobs`/`job_queue` (o worker mandou pelo
 *     WhatsApp da empresa o texto que ele escolheu), apagando `llm_calls` e
 *     `pacing_ledger`, e plantando em `storage_redaction_queue` o caminho que o
 *     dreno apagou com a service role;
 *   - um admin de plataforma 'support_readonly', sem sessão de suporte, se
 *     fazendo admin de uma organização alheia pela REST.
 * Cada recusa tem o controle positivo ao lado.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { countAs, lastLine, sql } from "./gov-helpers";

const ORG = "0501aaaa-0000-4000-8000-000000000001";
const ALHEIA = "0501aaaa-0000-4000-8000-000000000002";
const PROPRIA_DO_SUPORTE = "0501aaaa-0000-4000-8000-000000000003";
const LEITOR = "0501aaaa-1111-4000-8000-000000000001";
const SUPORTE_LEITURA = "0501aaaa-1111-4000-8000-000000000002";
const PLATAFORMA_FULL = "0501aaaa-1111-4000-8000-000000000003";
const PLATAFORMA_MFA = "0501aaaa-1111-4000-8000-000000000004";
const CONTATO = "0501aaaa-2222-4000-8000-000000000001";
const SUSPENSA = "0501aaaa-0000-4000-8000-000000000004";
const ADMIN_DA_SUSPENSA = "0501aaaa-1111-4000-8000-000000000005";
const CONTATO_DA_SUSPENSA = "0501aaaa-2222-4000-8000-000000000002";

function como(
  userId: string,
  stmt: string,
  aal: "aal1" | "aal2" = "aal1",
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
      ('${LEITOR}', 'p0501-leitor@invariant.test'),
      ('${SUPORTE_LEITURA}', 'p0501-suporte@invariant.test'),
      ('${PLATAFORMA_FULL}', 'p0501-full@invariant.test'),
      ('${PLATAFORMA_MFA}', 'p0501-mfa@invariant.test'),
      ('${ADMIN_DA_SUSPENSA}', 'p0501-susp@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'p0501-org', 'Org 0501', 'Org 0501'),
      ('${ALHEIA}', 'p0501-alheia', 'Alheia 0501', 'Alheia 0501'),
      ('${PROPRIA_DO_SUPORTE}', 'p0501-propria', 'Propria 0501', 'Propria 0501'),
      ('${SUSPENSA}', 'p0501-suspensa', 'Suspensa 0501', 'Suspensa 0501')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${LEITOR}', '${ORG}', 'viewer', now()),
      ('${SUPORTE_LEITURA}', '${PROPRIA_DO_SUPORTE}', 'admin', now()),
      ('${ADMIN_DA_SUSPENSA}', '${SUSPENSA}', 'admin', now())
      on conflict do nothing;
    insert into public.platform_admins (user_id, granted_by, reason, scope, mfa_required) values
      ('${SUPORTE_LEITURA}', '${SUPORTE_LEITURA}', 'invariante 0501', 'support_readonly', false),
      ('${PLATAFORMA_FULL}', '${PLATAFORMA_FULL}', 'invariante 0501', 'full', false),
      ('${PLATAFORMA_MFA}', '${PLATAFORMA_MFA}', 'invariante 0501', 'full', true)
      on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTATO}', '${ORG}', 'Cliente 0501'),
      ('${CONTATO_DA_SUSPENSA}', '${SUSPENSA}', 'Cliente da suspensa')
      on conflict do nothing;
    update public.organizations set status = 'suspended' where id = '${SUSPENSA}';
    insert into public.job_queue (organization_id, kind, payload)
      values ('${ORG}', 'watchdog', '{"controle":true}');
    insert into public.llm_calls (organization_id, provider, model, cost_cents)
      values ('${ORG}', 'anthropic', 'modelo', 9999);
  `);
});

describe("0501 — leitor não escreve nas filas do motor", () => {
  it("cron_jobs: recusado", () => {
    const r = como(
      LEITOR,
      `insert into public.cron_jobs (organization_id, contact_id, kind, interval_ms, job_kind, payload, next_run_at)
       values ('${ORG}', '${CONTATO}', 'every', 60000, 'followup_turn', '{"mode":"template"}', now());`,
    );
    expect(r.ok).toBe(false);
  });

  it("job_queue: recusado (nem com prioridade forjada)", () => {
    const r = como(
      LEITOR,
      `insert into public.job_queue (organization_id, kind, payload, priority, max_attempts)
       values ('${ORG}', 'watchdog', '{}', -32768, 32767);`,
    );
    expect(r.ok).toBe(false);
  });

  it("llm_calls: o gasto de IA não é apagado", () => {
    como(LEITOR, `delete from public.llm_calls where organization_id = '${ORG}';`);
    expect(
      lastLine(sql(`select count(*) from public.llm_calls where organization_id = '${ORG}';`)),
    ).toBe("1");
  });

  it("storage_redaction_queue: não planta caminho para o dreno apagar", () => {
    const r = como(
      LEITOR,
      `insert into public.storage_redaction_queue (organization_id, bucket, object_path)
       values ('${ORG}', 'brand-logos', 'platform/logo.png');`,
    );
    expect(r.ok).toBe(false);
  });

  it("reentry_template_*: o texto que a retomada envia não é trocado pelo login", () => {
    const r = como(
      LEITOR,
      `insert into public.reentry_template_versions (organization_id, variants)
       values ('${ORG}', array['texto do leitor']);`,
    );
    expect(r.ok).toBe(false);
  });

  it("controle: o membro continua LENDO a fila da própria organização", () => {
    expect(
      countAs(LEITOR, `select count(*) from public.job_queue where organization_id = '${ORG}';`),
    ).toBeGreaterThan(0);
  });

  it("controle: o servidor (dono do schema aqui) segue gravando", () => {
    expect(() =>
      sql(
        `insert into public.storage_redaction_queue (organization_id, bucket, object_path)
         values ('${ORG}', 'whatsapp-media', '${ORG}/c/m.jpg');`,
      ),
    ).not.toThrow();
  });
});

describe("0501 — o ramo de plataforma respeita escopo e MFA", () => {
  const virarAdminDe = (quem: string, org: string, aal: "aal1" | "aal2" = "aal1") =>
    como(
      quem,
      `insert into public.user_organizations (user_id, organization_id, role, accepted_at)
       values ('${quem}', '${org}', 'admin', now());`,
      aal,
    );

  it("'support_readonly' sem sessão de suporte não se faz admin de organização alheia", () => {
    expect(virarAdminDe(SUPORTE_LEITURA, ALHEIA).ok).toBe(false);
  });

  it("'support_readonly' não renomeia organização alheia", () => {
    como(
      SUPORTE_LEITURA,
      `update public.organizations set display_name = 'renomeada' where id = '${ALHEIA}';`,
    );
    expect(
      lastLine(sql(`select display_name from public.organizations where id = '${ALHEIA}';`)),
    ).toBe("Alheia 0501");
  });

  it("controle: o mesmo 'support_readonly' escreve na organização de que é membro", () => {
    const r = como(
      SUPORTE_LEITURA,
      `update public.organizations set display_name = 'Propria renomeada' where id = '${PROPRIA_DO_SUPORTE}';`,
    );
    // `UPDATE 1`: a linha passou pela RLS (recusada, a RLS faria `UPDATE 0`).
    expect(r).toMatchObject({ ok: true, out: "UPDATE 1" });
  });

  it("'full' com mfa_required em aal1 não escreve em organização alheia", () => {
    expect(virarAdminDe(PLATAFORMA_MFA, ALHEIA, "aal1").ok).toBe(false);
  });

  it("controle: o mesmo 'full' com mfa_required em aal2 escreve", () => {
    expect(virarAdminDe(PLATAFORMA_MFA, ALHEIA, "aal2").ok).toBe(true);
  });

  it("controle: 'full' sem mfa_required segue com o poder de plataforma de antes", () => {
    expect(
      como(
        PLATAFORMA_FULL,
        `update public.organizations set display_name = 'Alheia por plataforma' where id = '${ALHEIA}';`,
      ),
    ).toMatchObject({ ok: true, out: "UPDATE 1" });
  });
});

describe("0501 — organização suspensa fica só-leitura para o login", () => {
  it("o admin da suspensa não escreve pela REST", () => {
    como(
      ADMIN_DA_SUSPENSA,
      `update public.contacts set display_name = 'alterado' where id = '${CONTATO_DA_SUSPENSA}';`,
    );
    expect(
      lastLine(
        sql(`select display_name from public.contacts where id = '${CONTATO_DA_SUSPENSA}';`),
      ),
    ).toBe("Cliente da suspensa");
  });

  it("controle: o admin da suspensa segue LENDO os próprios dados", () => {
    expect(
      countAs(
        ADMIN_DA_SUSPENSA,
        `select count(*) from public.contacts where organization_id = '${SUSPENSA}';`,
      ),
    ).toBe(1);
  });

  it("controle: o servidor segue gravando na suspensa (a ingestão não perde mensagem)", () => {
    expect(() =>
      sql(
        `select public.emit_event('contact.viewed', 'contact', '${CONTATO_DA_SUSPENSA}', '{}'::jsonb, '{}'::jsonb, '${SUSPENSA}');`,
      ),
    ).not.toThrow();
  });
});

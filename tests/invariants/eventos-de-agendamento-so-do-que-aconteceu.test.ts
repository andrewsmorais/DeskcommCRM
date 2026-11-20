import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * 0554 — o `emit_event` só deixa um chamador LOGADO emitir
 * `appointment.created/.rescheduled/.cancelled` quando a linha descreve uma
 * mudança que aconteceu, feita por quem pode fazê-la.
 *
 * O DEFEITO QUE ISTO GUARDA (auditoria de 18/11, achado 4): desde a 0551 cada
 * uma dessas linhas vira uma mensagem do WhatsApp da empresa para o dono, e o
 * `emit_event` as aceitava de qualquer membro — até um leitor. Um "cancelado"
 * falso de horário de pé ia para o dono, o aviso verdadeiro represado sumia, e
 * vinte linhas gastavam o teto diário do número.
 *
 * Cada chamada roda numa sessão própria (transação própria), como na produção:
 * a rota grava o agendamento numa requisição e emite na mesma, mas em outra
 * transação — e é isso que dá ao `created_at` do evento um instante depois do
 * `revision_started_at` da mudança.
 */

const ORG = randomUUID();
const LEITOR = randomUUID();
const ATENDENTE = randomUUID();
const AG_DE_PE = randomUUID();
const AG_CANCELADO = randomUUID();

function emitirComo(
  usuario: string | null,
  tipo: string,
  entidade: string,
  payload: Record<string, unknown> = {},
): string {
  const quem = usuario
    ? `set role authenticated;
       select set_config('request.jwt.claims', '{"sub":"${usuario}","role":"authenticated"}', false);`
    : `set role service_role;
       select set_config('request.jwt.claims', '{"role":"service_role"}', false);`;
  return sql(`
    ${quem}
    create or replace function pg_temp.tenta() returns text language plpgsql as $$
    begin
      perform public.emit_event('${tipo}', 'calendar_appointment', '${entidade}',
        '${JSON.stringify(payload)}'::jsonb, '{}'::jsonb, '${ORG}');
      return 'ok';
    exception when others then
      return sqlerrm;
    end $$;
    select pg_temp.tenta();
  `)
    .split("\n")
    .filter(Boolean)
    .pop() as string;
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${LEITOR}', 'leitor-0554@invariant.test'),
      ('${ATENDENTE}', 'atendente-0554@invariant.test');
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'eventos-0554-${ORG.slice(0, 8)}', 'Eventos 0554', 'Eventos 0554');
    insert into public.user_organizations (organization_id, user_id, role, accepted_at) values
      ('${ORG}', '${LEITOR}', 'viewer', now()),
      ('${ORG}', '${ATENDENTE}', 'agent', now());
    insert into public.calendar_appointments (id, organization_id, title, starts_at, ends_at, status)
      values ('${AG_DE_PE}', '${ORG}', 'Consulta', now() + interval '2 days',
              now() + interval '2 days 1 hour', 'confirmed');
    insert into public.calendar_appointments
      (id, organization_id, title, starts_at, ends_at, status, cancelled_at)
      values ('${AG_CANCELADO}', '${ORG}', 'Consulta', now() + interval '3 days',
              now() + interval '3 days 1 hour', 'cancelled', now());
  `);
});

afterAll(() => {
  sql(`
    delete from public.event_log where organization_id = '${ORG}';
    delete from public.calendar_appointments where organization_id = '${ORG}';
    delete from public.user_organizations where organization_id = '${ORG}';
    delete from public.organizations where id = '${ORG}';
    delete from auth.users where id in ('${LEITOR}', '${ATENDENTE}');
  `);
});

describe("0554 · eventos de agendamento só do que aconteceu", () => {
  it("leitor não emite evento de agendamento", () => {
    expect(emitirComo(LEITOR, "appointment.created", AG_DE_PE, { appointment_id: AG_DE_PE, autor: "user" })).toBe(
      "appointment_event_forbidden",
    );
  });

  it("'cancelado' de um horário que continua de pé é recusado", () => {
    expect(
      emitirComo(ATENDENTE, "appointment.cancelled", AG_DE_PE, { appointment_id: AG_DE_PE, autor: "user" }),
    ).toBe("appointment_event_mismatch");
  });

  it("origem trocada para 'cliente' é recusada para quem chama logado", () => {
    expect(
      emitirComo(ATENDENTE, "appointment.created", AG_DE_PE, { appointment_id: AG_DE_PE, autor: "contact" }),
    ).toBe("appointment_event_mismatch");
  });

  it("agendamento do payload diferente do da entidade é recusado", () => {
    expect(
      emitirComo(ATENDENTE, "appointment.created", AG_DE_PE, { appointment_id: AG_CANCELADO, autor: "user" }),
    ).toBe("appointment_event_mismatch");
  });

  it("a mudança que aconteceu sai UMA vez; a mesma linha de novo é recusada", () => {
    expect(
      emitirComo(ATENDENTE, "appointment.cancelled", AG_CANCELADO, { appointment_id: AG_CANCELADO, autor: "user" }),
    ).toBe("ok");
    expect(
      emitirComo(ATENDENTE, "appointment.cancelled", AG_CANCELADO, { appointment_id: AG_CANCELADO, autor: "user" }),
    ).toBe("appointment_event_replayed");
  });

  it("o servidor (service role) segue emitindo como antes", () => {
    expect(emitirComo(null, "appointment.created", AG_DE_PE, { appointment_id: AG_DE_PE, autor: "ai" })).toBe("ok");
  });

  it("a definição instalada é a nova e anon não executa", () => {
    const def = sql(`
      select pg_get_functiondef(p.oid) like '%appointment_event_replayed%'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'emit_event';
    `);
    expect(def).toBe("t");
    expect(
      sql(`select has_function_privilege('anon',
             'public.emit_event(text,text,uuid,jsonb,jsonb,uuid)'::regprocedure, 'EXECUTE');`),
    ).toBe("f");
  });
});

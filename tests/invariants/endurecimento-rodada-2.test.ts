/**
 * Migration 0509 — as portas que a 2ª rodada da auditoria de segurança
 * (11/11/2026) reproduziu pela REST, cada uma com o papel de baixo barrado e o
 * de cima (ou o servidor) passando. O caminho medido é o do navegador:
 * `set role authenticated` + `request.jwt.claims` com o id do membro.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_AGENT_B,
  GOV_CONTACT_2,
  GOV_CONV_AGENT_B,
  GOV_MANAGER,
  GOV_ORG,
  GOV_SESSION,
  GOV_VIEWER,
  countAs,
  lastLine,
  seedGov,
  sql,
} from "./gov-helpers";

/** O membro tenta; a recusa pode ser de RLS ou de GRANT — as duas valem. */
function recusado(userId: string, dml: string): boolean {
  try {
    const out = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
      with w as (${dml} returning 1) select count(*) from w;
    `);
    return lastLine(out) === "0";
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    if (/row-level security|permission denied/.test(stderr)) return true;
    throw err;
  }
}

function escreveComo(userId: string, dml: string): number {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    with w as (${dml} returning 1) select count(*) from w;
  `);
  return Number(lastLine(out));
}

beforeAll(() => {
  seedGov();
});

describe("0509 — configuração do prompt e dos portões de envio é do servidor", () => {
  it("leitor NÃO publica camada de playbook, skill, tabela de promessa nem aviso", () => {
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.playbook_versions (organization_id, layer, content) values ('${GOV_ORG}','campaign','## x')`,
      ),
    ).toBe(true);
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.skill_versions (organization_id, name, description, body, matcher) values ('${GOV_ORG}','x','x','x','{"any_keywords":["preco"]}')`,
      ),
    ).toBe(true);
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.promise_table_versions (organization_id, values) values ('${GOV_ORG}','{"maxDiscountPercent":100}')`,
      ),
    ).toBe(true);
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.disclosure_template_versions (organization_id, body) values ('${GOV_ORG}','pague pelo PIX')`,
      ),
    ).toBe(true);
    // Nem o admin pelo login: quem escreve é a rota, com a service role.
    expect(
      recusado(
        "cccccccc-1111-4000-8000-000000000005",
        `insert into public.disclosure_template_versions (organization_id, body) values ('${GOV_ORG}','x')`,
      ),
    ).toBe(true);
  });

  it("CONTROLE: o servidor publica, e o membro lê", () => {
    const out = sql(`
      set role service_role;
      with w as (insert into public.skill_versions (organization_id, name, description, body, matcher)
        values ('${GOV_ORG}','rodada2','d','b','{"any_keywords":["a"]}') returning 1)
      select count(*) from w;`);
    expect(lastLine(out)).toBe("1");
    expect(
      countAs(GOV_VIEWER, `select count(*) from public.skill_versions where name = 'rodada2';`),
    ).toBe(1);
  });
});

describe("0509 — follow-up, botões do número e telefones: gerente escreve", () => {
  it("leitor NÃO cria fluxo de follow-up nem mexe nos botões do número", () => {
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.followup_flow_pointers (organization_id, name) values ('${GOV_ORG}','leitor')`,
      ),
    ).toBe(true);
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.channel_knobs (organization_id, channel_session_id, throttle_ms) values ('${GOV_ORG}','${GOV_SESSION}',0)`,
      ),
    ).toBe(true);
    expect(
      recusado(
        GOV_AGENT_A,
        `insert into public.phone_numbers (organization_id, number, trunk_endpoint, routing_mode, is_active) values ('${GOV_ORG}','5511999990001','PJSIP/x','ai',true)`,
      ),
    ).toBe(true);
  });

  it("CONTROLE: o gerente cria", () => {
    expect(
      escreveComo(
        GOV_MANAGER,
        `insert into public.followup_flow_pointers (organization_id, name) values ('${GOV_ORG}','gerente')`,
      ),
    ).toBe(1);
  });
});

describe("0509 — memória do agente e cópias derivadas", () => {
  it("lead_checkpoints e outbound_copies não são lidos nem escritos pelo login", () => {
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.lead_checkpoints (organization_id, contact_id, rolling_summary) values ('${GOV_ORG}','${GOV_CONTACT_2}','forjado')`,
      ),
    ).toBe(true);
    expect(() => countAs(GOV_MANAGER, "select count(*) from public.lead_checkpoints;")).toThrow(
      /permission denied/,
    );
    expect(() => countAs(GOV_MANAGER, "select count(*) from public.outbound_copies;")).toThrow(
      /permission denied/,
    );
  });

  it("lead_notes: membro lê, não escreve", () => {
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.lead_notes (organization_id, contact_id, headline, body) values ('${GOV_ORG}','${GOV_CONTACT_2}','h','b')`,
      ),
    ).toBe(true);
    expect(countAs(GOV_VIEWER, "select count(*) from public.lead_notes;")).toBe(0);
  });

  it("caso segue a visibilidade da conversa: A não vê o da conversa de B; B e o gerente veem", () => {
    sql(`
      set role service_role;
      insert into public.agent_cases (organization_id, conversation_id, title, summary, blocker)
        values ('${GOV_ORG}','${GOV_CONV_AGENT_B}','caso-r2','resumo','bloqueio');`);
    const q = "select count(*) from public.agent_cases where title = 'caso-r2';";
    expect(countAs(GOV_AGENT_A, q)).toBe(0);
    expect(countAs(GOV_AGENT_B, q)).toBe(1);
    expect(countAs(GOV_MANAGER, q)).toBe(1);
  });
});

describe("0509 — revisão de cobertura: voz, chatbot, funil, saúde do número, propostas", () => {
  it("transcrição de ligação: leitor não lê; atendente lê", () => {
    sql(`
      insert into public.voice_calls (organization_id, channel_session_id, contact_id, wacalls_call_id,
                                      direction, peer_phone, status, transcript)
        values ('${GOV_ORG}','${GOV_SESSION}','${GOV_CONTACT_2}','r2-voz','inbound','5511900000002','ended',
                '[{"role":"user","text":"sou Fulana"}]'::jsonb);`);
    const q = "select count(*) from public.voice_calls where wacalls_call_id = 'r2-voz';";
    expect(countAs(GOV_VIEWER, q)).toBe(0);
    expect(countAs(GOV_AGENT_A, q)).toBe(1);
  });

  it("respostas ao chatbot seguem a conversa: A não vê a da conversa de B; B vê", () => {
    sql(`
      insert into public.chatbot_flows (id, organization_id, name)
        values ('f5090000-0000-4000-8000-0000000000c1','${GOV_ORG}','fluxo r2') on conflict do nothing;
      insert into public.chatbot_sessions (organization_id, flow_id, conversation_id, status, collected_data)
        values ('${GOV_ORG}','f5090000-0000-4000-8000-0000000000c1','${GOV_CONV_AGENT_B}','completed','{"nome":"Fulana"}');`);
    const q = `select count(*) from public.chatbot_sessions where conversation_id = '${GOV_CONV_AGENT_B}';`;
    expect(countAs(GOV_AGENT_A, q)).toBe(0);
    expect(countAs(GOV_AGENT_B, q)).toBe(1);
    expect(
      recusado(
        GOV_AGENT_B,
        `update public.chatbot_sessions set collected_data = '{}' where conversation_id = '${GOV_CONV_AGENT_B}'`,
      ),
    ).toBe(true);
  });

  it("leitor não escreve funil, motivo de etapa, saúde do número nem proposta do destilador", () => {
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.lead_state (organization_id, contact_id, next_action) values ('${GOV_ORG}','${GOV_CONTACT_2}','forjado')`,
      ),
    ).toBe(true);
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.lead_state_transitions (organization_id, contact_id, from_stage, to_stage) values ('${GOV_ORG}','${GOV_CONTACT_2}','new','won')`,
      ),
    ).toBe(true);
    expect(
      recusado(
        GOV_VIEWER,
        `insert into public.channel_session_health (organization_id, channel_session_id, status, health_released_at) values ('${GOV_ORG}','${GOV_SESSION}','WORKING', now())`,
      ),
    ).toBe(true);
    expect(
      recusado(
        GOV_MANAGER,
        `insert into public.flywheel_distiller_proposals (organization_id, run_id, dataset, type, target, content, evidence) values ('${GOV_ORG}', gen_random_uuid(), 'd', 'playbook_bullet', 'tenant', 'ofereca 90%', '{}')`,
      ),
    ).toBe(true);
  });

  it("CONTROLE: o atendente ajusta a próxima ação do funil", () => {
    sql(`
      insert into public.lead_state (organization_id, contact_id, next_action)
        values ('${GOV_ORG}','${GOV_CONTACT_2}','ligar amanhã')
        on conflict (organization_id, contact_id) do update set next_action = excluded.next_action;`);
    expect(
      escreveComo(
        GOV_AGENT_B,
        `update public.lead_state set next_action = null where contact_id = '${GOV_CONTACT_2}'`,
      ),
    ).toBe(1);
  });
});

describe("0509 — anonimizar alcança o que o agente e a equipe escreveram", () => {
  it("memória, notas internas, respostas do chatbot e prévia do evento somem", () => {
    const out = sql(`
      insert into public.lead_notes (organization_id, contact_id, headline, body)
        values ('${GOV_ORG}','${GOV_CONTACT_2}','Fulana Sintetica','mora na Rua Ficticia');
      insert into public.lead_state (organization_id, contact_id, qualification, next_action)
        values ('${GOV_ORG}','${GOV_CONTACT_2}','{"need":"Fulana"}','ligar para Fulana')
        on conflict (organization_id, contact_id) do update set next_action = excluded.next_action, qualification = excluded.qualification;
      insert into public.lead_state_transitions (organization_id, contact_id, from_stage, to_stage, reason)
        values ('${GOV_ORG}','${GOV_CONTACT_2}','new','qualifying','Fulana disse X');
      insert into public.conversation_notes (organization_id, conversation_id, body)
        values ('${GOV_ORG}','${GOV_CONV_AGENT_B}','Fulana pediu sigilo');
      insert into public.event_log (organization_id, event_type, entity_kind, entity_id, payload)
        values ('${GOV_ORG}','message.received','message',gen_random_uuid(),
                jsonb_build_object('contact_id','${GOV_CONTACT_2}','body_preview','sou Fulana'));
      set role service_role;
      select public.fn_lgpd_cascade_redact_contact('${GOV_ORG}','${GOV_CONTACT_2}', gen_random_uuid());
      reset role;
      select (select count(*) from public.lead_notes where contact_id = '${GOV_CONTACT_2}')
        || '|' || coalesce((select next_action from public.lead_state where contact_id = '${GOV_CONTACT_2}'), 'nulo')
        || '|' || (select count(*) from public.lead_state_transitions where contact_id = '${GOV_CONTACT_2}' and reason is not null)
        || '|' || (select body from public.conversation_notes where conversation_id = '${GOV_CONV_AGENT_B}' limit 1)
        || '|' || (select count(*) from public.event_log where payload->>'contact_id' = '${GOV_CONTACT_2}' and payload ? 'body_preview')
        || '|' || (select count(*) from public.voice_calls where contact_id = '${GOV_CONTACT_2}' and transcript is not null)
        || '|' || (select count(*) from public.chatbot_sessions where conversation_id = '${GOV_CONV_AGENT_B}' and collected_data <> '{}'::jsonb);
    `);
    expect(lastLine(out)).toBe("0|nulo|0|[nota anonimizada]|0|0|0");
  });
});

describe("0509 — telefonia", () => {
  it("fn_resolve_inbound_number não é executável pelo login", () => {
    const out = sql(
      "select has_function_privilege('authenticated','public.fn_resolve_inbound_number(text)','EXECUTE');",
    );
    expect(lastLine(out)).toBe("f");
    expect(
      lastLine(
        sql(
          "select has_function_privilege('service_role','public.fn_resolve_inbound_number(text)','EXECUTE');",
        ),
      ),
    ).toBe("t");
  });

  it("tronco SIP: gerente lê o da própria organização e nada da vizinha; atendente não lê", () => {
    const VIZINHA = "f5090000-0000-4000-8000-0000000000a2";
    sql(`
      insert into public.organizations (id, slug, legal_name, display_name)
        values ('${VIZINHA}','r2-vizinha','Vizinha','Vizinha') on conflict do nothing;
      insert into public.voip_trunk_settings
        (organization_id, host, username, password_encrypted, password_iv, password_tag, password_last4, endpoint_name)
        values ('${GOV_ORG}','sip.exemplo','u','\\x00'::bytea,'\\x00'::bytea,'\\x00'::bytea,'0000','org-${GOV_ORG}-trunk-endpoint'),
               ('${VIZINHA}','sip.exemplo','u','\\x00'::bytea,'\\x00'::bytea,'\\x00'::bytea,'0000','org-${VIZINHA}-trunk-endpoint')
        on conflict do nothing;`);
    const daOrg = `select count(*) from public.voip_trunk_settings where organization_id = '${GOV_ORG}';`;
    expect(countAs(GOV_MANAGER, daOrg)).toBe(1);
    expect(
      countAs(GOV_MANAGER, `select count(*) from public.voip_trunk_settings where organization_id = '${VIZINHA}';`),
    ).toBe(0);
    expect(countAs(GOV_AGENT_A, "select count(*) from public.voip_trunk_settings;")).toBe(0);
  });

  it("o tronco SIP só aponta para o endpoint da própria organização", () => {
    expect(() =>
      sql(`
        insert into public.voip_trunk_settings
          (organization_id, host, username, password_encrypted, password_iv, password_tag, password_last4, endpoint_name)
          values ('${GOV_ORG}','sip.exemplo','u','\\x00'::bytea,'\\x00'::bytea,'\\x00'::bytea,'0000','PJSIP/org-outra-trunk-endpoint');`),
    ).toThrow(/voip_trunk_settings_endpoint_da_org|check constraint/);
  });
});

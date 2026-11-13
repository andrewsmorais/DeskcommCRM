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
  GOV_CONTACT_1,
  GOV_CONTACT_2,
  GOV_CONTACT_3,
  GOV_CONV_AGENT_B,
  GOV_LEAD,
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

  it("número de telefone: cadastro só pela rota; pelo login nem o gerente insere nem troca número/tronco", () => {
    expect(
      recusado(
        GOV_MANAGER,
        `insert into public.phone_numbers (organization_id, number, trunk_endpoint, routing_mode, is_active) values ('${GOV_ORG}','5511999990002','PJSIP/trunk-endpoint','human',true)`,
      ),
    ).toBe(true);
    sql(`insert into public.phone_numbers (organization_id, number, trunk_endpoint, routing_mode, is_active)
           values ('${GOV_ORG}','5511999990003','PJSIP/trunk-endpoint','ai',true);`);
    const tenta = (set: string) =>
      expect(() =>
        sql(`
          set role authenticated;
          select set_config('request.jwt.claims', '{"sub":"${GOV_MANAGER}"}', false);
          update public.phone_numbers set ${set} where number = '5511999990003';`),
      ).toThrow(/colunas_do_tronco_do_numero/);
    tenta("number = '551140000000'");
    tenta("trunk_endpoint = 'PJSIP/outro'");
    // CONTROLE: rótulo e liga/desliga seguem com o gerente.
    expect(
      escreveComo(GOV_MANAGER, `update public.phone_numbers set label = 'recepção', is_active = false where number = '5511999990003'`),
    ).toBe(1);
  });

  it("número é único por TRONCO, não por instalação; a RPC antiga (só número) não escolhe ao acaso", () => {
    const GOV_ORG_B = "cccccccc-0000-4000-8000-0000000000b2";
    sql(`insert into public.organizations (id, slug, legal_name, display_name)
           values ('${GOV_ORG_B}','r2-org-b','Org B','Org B') on conflict (id) do nothing;`);
    sql(`insert into public.phone_numbers (organization_id, number, trunk_endpoint, routing_mode, is_active)
           values ('${GOV_ORG}','5511999990004','PJSIP/trunk-endpoint','ai',true),
                  ('${GOV_ORG_B}','5511999990004','PJSIP/org-${GOV_ORG_B}-trunk-endpoint','ai',true);`);
    // Mesmo número no MESMO tronco: recusado.
    expect(() =>
      sql(`insert into public.phone_numbers (organization_id, number, trunk_endpoint, routing_mode, is_active)
             values ('${GOV_ORG_B}','5511999990004','PJSIP/trunk-endpoint','ai',true);`),
    ).toThrow(/phone_numbers_numero_por_tronco/);
    // Dois cadastros ativos: a RPC sem tronco não responde.
    expect(sql(`select count(*) from public.fn_resolve_inbound_number('5511999990004');`).trim()).toBe("0");
    // CONTROLE: um cadastro só, a RPC responde.
    sql(`update public.phone_numbers set is_active = false where number = '5511999990004' and organization_id = '${GOV_ORG_B}';`);
    expect(lastLine(sql(`select organization_id from public.fn_resolve_inbound_number('5511999990004');`))).toBe(GOV_ORG);
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
    expect(
      recusado(
        GOV_AGENT_A,
        `insert into public.agent_inbox_items (organization_id, kind, severity, title, ref_kind, ref_id) values ('${GOV_ORG}','other','warn','forjado','number_health','${GOV_SESSION}')`,
      ),
    ).toBe(true);
  });

  it("aprovar a proposta da IA: só a rota registra (pelo login, ninguém — nem em nome de si mesmo)", () => {
    const decisao = (quem: string) =>
      `insert into public.crm_lead_activities (organization_id, lead_id, type, source_module, actor_kind, performed_by_user_id, reason, payload)
         values ('${GOV_ORG}','${GOV_LEAD}','next_action_approved','crm','user','${quem}','Aprovou: texto que a IA nunca propôs','{}')`;
    expect(recusado(GOV_VIEWER, decisao(GOV_VIEWER))).toBe(true);
    expect(recusado(GOV_AGENT_A, decisao(GOV_AGENT_B))).toBe(true);
    expect(recusado(GOV_AGENT_A, decisao(GOV_AGENT_A))).toBe(true);
    expect(recusado(GOV_MANAGER, decisao(GOV_MANAGER))).toBe(true);
    // CONTROLE: o servidor (a rota, pela service role) registra.
    expect(lastLine(sql(`with w as (${decisao(GOV_AGENT_A)} returning 1) select count(*) from w;`))).toBe("1");
  });

  it("atividade pelo login é em nome de si mesmo e como pessoa: nem como IA/sistema, nem como outro usuário", () => {
    const atividade = (ator: string, quem: string) =>
      `insert into public.crm_lead_activities (organization_id, lead_id, type, source_module, actor_kind, performed_by_user_id, reason, payload)
         values ('${GOV_ORG}','${GOV_LEAD}','stage_changed','crm','${ator}',${quem === "null" ? "null" : `'${quem}'`},'Movido pela IA','{}')`;
    expect(recusado(GOV_AGENT_A, atividade("system", "null"))).toBe(true);
    expect(recusado(GOV_AGENT_A, atividade("user", GOV_AGENT_B))).toBe(true);
    // Sem autor informado, a linha nasce do próprio usuário (gatilho), nunca sem dono.
    expect(
      escreveComo(
        GOV_AGENT_A,
        `insert into public.crm_lead_activities (organization_id, lead_id, type, source_module, reason, payload)
           values ('${GOV_ORG}','${GOV_LEAD}','note_added','crm','r2-sem-autor','{}')`,
      ),
    ).toBe(1);
    expect(
      lastLine(
        sql(`select actor_kind || '|' || performed_by_user_id from public.crm_lead_activities where reason = 'r2-sem-autor';`),
      ),
    ).toBe(`user|${GOV_AGENT_A}`);
  });

  it("linha do tempo: leitor não registra atividade nenhuma; atendente registra", () => {
    const nota = `insert into public.crm_lead_activities (organization_id, lead_id, type, source_module, actor_kind, performed_by_user_id, reason, payload)
         values ('${GOV_ORG}','${GOV_LEAD}','note_added','crm','user','${GOV_VIEWER}','Cliente já pagou','{}')`;
    expect(recusado(GOV_VIEWER, nota)).toBe(true);
    expect(escreveComo(GOV_AGENT_A, nota.replace(GOV_VIEWER, GOV_AGENT_A))).toBe(1);
  });

  it("demanda e vínculo de demanda: só o servidor escreve; o membro lê", () => {
    // `returning` imprime o id e depois "INSERT 0 1": o id é a primeira linha.
    const id = sql(`insert into public.demandas (organization_id, contact_id, aberta_em, origem, estado, dono_kind)
             values ('${GOV_ORG}','${GOV_CONTACT_1}', now(), 'inbound', 'aberta', 'ia') returning id;`)
      .trim()
      .split("\n")[0]!
      .trim();
    expect(
      recusado(GOV_AGENT_A, `update public.demandas set desfecho = 'perdida', fechada_em = now() where id = '${id}'`),
    ).toBe(true);
    expect(
      recusado(
        GOV_MANAGER,
        `insert into public.demandas (organization_id, contact_id, aberta_em, origem, estado, dono_kind)
           values ('${GOV_ORG}','${GOV_CONTACT_1}', now(), 'inbound', 'aberta', 'ia')`,
      ),
    ).toBe(true);
    expect(recusado(GOV_MANAGER, `delete from public.demanda_conversas where organization_id = '${GOV_ORG}'`)).toBe(true);
    expect(countAs(GOV_AGENT_A, `select count(*) from public.demandas where id = '${id}';`)).toBe(1);
  });

  it("trocar o texto da próxima ação muda a identidade dela (next_action_seq)", () => {
    const out = sql(`
      insert into public.lead_state (organization_id, contact_id, next_action, next_action_seq)
        values ('${GOV_ORG}','${GOV_CONTACT_1}','proposta A', 5)
        on conflict (organization_id, contact_id) do update set next_action = 'proposta A', next_action_seq = 5;
      update public.lead_state set next_action = 'proposta B' where contact_id = '${GOV_CONTACT_1}';
      update public.lead_state set next_action_seq = 1 where contact_id = '${GOV_CONTACT_1}';
      select next_action_seq from public.lead_state where contact_id = '${GOV_CONTACT_1}';`);
    // 5 → 6 (texto mudou sem avançar) e nunca volta para 1.
    expect(lastLine(out)).toBe("6");
  });

  it("estado do funil do agente: nem o atendente escreve pelo login; o membro lê", () => {
    sql(`
      insert into public.lead_state (organization_id, contact_id, next_action)
        values ('${GOV_ORG}','${GOV_CONTACT_2}','ligar amanhã')
        on conflict (organization_id, contact_id) do update set next_action = excluded.next_action;`);
    expect(
      recusado(
        GOV_AGENT_B,
        `update public.lead_state set next_action = null where contact_id = '${GOV_CONTACT_2}'`,
      ),
    ).toBe(true);
    expect(
      countAs(GOV_VIEWER, `select count(*) from public.lead_state where contact_id = '${GOV_CONTACT_2}';`),
    ).toBe(1);
  });
});

describe("0509 — mensagens: leitor não escreve; ninguém grava em nome da IA pelo login", () => {
  const nova = (via: string) =>
    `insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body)
       values ('${GOV_ORG}','${GOV_CONV_AGENT_B}','${GOV_SESSION}','${GOV_CONTACT_2}','text','outbound','queued','${via}','texto do leitor')`;
  it("leitor não insere nem altera mensagem", () => {
    expect(recusado(GOV_VIEWER, nova("user"))).toBe(true);
    expect(
      recusado(GOV_VIEWER, `update public.messages set body = 'trocado' where conversation_id = '${GOV_CONV_AGENT_B}'`),
    ).toBe(true);
  });
  it("atendente não grava linha `queued` em nome da IA (o resgate da fila a reenviaria)", () => {
    expect(recusado(GOV_AGENT_B, nova("ai"))).toBe(true);
    expect(recusado(GOV_AGENT_B, nova("automation"))).toBe(true);
  });
  it("CONTROLE: atendente insere a própria mensagem", () => {
    expect(escreveComo(GOV_AGENT_B, nova("user"))).toBe(1);
  });

  it("pelo UPDATE também não: atendente não troca a origem, não devolve à fila nem reescreve a automática na fila", () => {
    sql(`insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body)
           values ('${GOV_ORG}','${GOV_CONV_AGENT_B}','${GOV_SESSION}','${GOV_CONTACT_2}','text','outbound','queued','ai','r2-ia-na-fila'),
                  ('${GOV_ORG}','${GOV_CONV_AGENT_B}','${GOV_SESSION}','${GOV_CONTACT_2}','text','outbound','sent','user','r2-humana-enviada');`);
    const tenta = (dml: string) =>
      expect(() =>
        sql(`
          set role authenticated;
          select set_config('request.jwt.claims', '{"sub":"${GOV_AGENT_B}"}', false);
          ${dml};`),
      ).toThrow(/colunas_de_envio_da_mensagem/);
    tenta(`update public.messages set sent_via = 'ai', status = 'queued' where body = 'r2-humana-enviada'`);
    tenta(`update public.messages set status = 'queued' where body = 'r2-humana-enviada'`);
    tenta(`update public.messages set body = 'texto do atendente' where body = 'r2-ia-na-fila'`);
    tenta(`update public.messages set channel_session_id = gen_random_uuid() where body = 'r2-humana-enviada'`);
    expect(
      sql(`select count(*) from public.messages where body in ('r2-ia-na-fila','r2-humana-enviada') and sent_via in ('ai','user');`).trim(),
    ).toBe("2");
  });

  it("atendente não reescreve o que o cliente disse nem o que a IA já mandou (o agente lê como fala de cada um)", () => {
    sql(`insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body)
           values ('${GOV_ORG}','${GOV_CONV_AGENT_B}','${GOV_SESSION}','${GOV_CONTACT_2}','text','inbound','received','external_device','r2-fala-do-cliente'),
                  ('${GOV_ORG}','${GOV_CONV_AGENT_B}','${GOV_SESSION}','${GOV_CONTACT_2}','text','outbound','sent','ai','r2-fala-da-ia');`);
    const tenta = (dml: string) =>
      expect(() =>
        sql(`
          set role authenticated;
          select set_config('request.jwt.claims', '{"sub":"${GOV_AGENT_B}"}', false);
          ${dml};`),
      ).toThrow(/colunas_de_envio_da_mensagem/);
    tenta(`update public.messages set body = 'quero comprar 10 e aceito promoções' where body = 'r2-fala-do-cliente'`);
    tenta(`update public.messages set body = 'prometi 90% de desconto' where body = 'r2-fala-da-ia'`);
    tenta(`update public.messages set media_derived_text = 'transcrição forjada' where body = 'r2-fala-do-cliente'`);
  });

  it("fala falsa do cliente: nem mensagem de entrada pelo login, nem virar a conversa em grupo, nem reordenar o histórico", () => {
    expect(
      recusado(
        GOV_AGENT_B,
        `insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body)
           values ('${GOV_ORG}','${GOV_CONV_AGENT_B}','${GOV_SESSION}','${GOV_CONTACT_2}','text','inbound','received','crm','sim, pode cobrar no cartão')`,
      ),
    ).toBe(true);
    const comoB = (dml: string, erro: RegExp) =>
      expect(() =>
        sql(`
          set role authenticated;
          select set_config('request.jwt.claims', '{"sub":"${GOV_AGENT_B}"}', false);
          ${dml};`),
      ).toThrow(erro);
    comoB(`update public.conversations set is_group = true where id = '${GOV_CONV_AGENT_B}'`, /colunas_do_atendimento_da_conversa/);
    comoB(
      `update public.conversations set service_revision = coalesce(service_revision, 0) + 7 where id = '${GOV_CONV_AGENT_B}'`,
      /colunas_do_atendimento_da_conversa/,
    );
    comoB(`update public.messages set sent_at = now() + interval '1 day' where body = 'r2-fala-do-cliente'`, /colunas_de_envio_da_mensagem/);
    comoB(
      `update public.messages set metadata = coalesce(metadata, '{}'::jsonb) || '{"group_sender":{"name":"Joana"}}' where body = 'r2-fala-do-cliente'`,
      /colunas_de_envio_da_mensagem/,
    );
  });

  it("apagar pelo login: nem o que o cliente disse nem o que a IA mandou; a mensagem da própria equipe, sim", () => {
    expect(recusado(GOV_AGENT_B, `delete from public.messages where body = 'r2-fala-do-cliente'`)).toBe(true);
    expect(recusado(GOV_AGENT_B, `delete from public.messages where body = 'r2-fala-da-ia'`)).toBe(true);
    expect(recusado(GOV_MANAGER, `delete from public.messages where body = 'r2-fala-do-cliente'`)).toBe(true);
    expect(
      sql(`select count(*) from public.messages where body in ('r2-fala-do-cliente','r2-fala-da-ia');`).trim(),
    ).toBe("2");
    // CONTROLE: o eco do celular da empresa (que o envio limpa) e a mensagem da equipe.
    sql(`insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body)
           values ('${GOV_ORG}','${GOV_CONV_AGENT_B}','${GOV_SESSION}','${GOV_CONTACT_2}','text','outbound','sent','external_device','r2-eco-do-celular');`);
    expect(escreveComo(GOV_AGENT_B, `delete from public.messages where body = 'r2-eco-do-celular'`)).toBe(1);
  });

  it("CONTROLE: atendente encerra e reabre a conversa (o carimbo do atendimento roda depois do guarda)", () => {
    expect(escreveComo(GOV_AGENT_B, `update public.conversations set status = 'closed' where id = '${GOV_CONV_AGENT_B}'`)).toBe(1);
    expect(escreveComo(GOV_AGENT_B, `update public.conversations set status = 'open' where id = '${GOV_CONV_AGENT_B}'`)).toBe(1);
  });

  it("CONTROLE: atendente edita a mensagem enviada e registra o desfecho do envio humano", () => {
    expect(
      escreveComo(
        GOV_AGENT_B,
        `update public.messages set body = 'r2-humana-editada', edited_at = now() where body = 'r2-humana-enviada'`,
      ),
    ).toBe(1);
    expect(
      escreveComo(
        GOV_AGENT_B,
        `update public.messages set status = 'failed', error_code = 'missing_phone_number' where body = 'texto do leitor' and sent_via = 'user'`,
      ),
    ).toBe(1);
  });
});

describe("0509 — contato: colunas de controle e piso de atendente", () => {
  it("leitor não edita contato; atendente edita a ficha", () => {
    expect(
      recusado(GOV_VIEWER, `update public.contacts set email = 'leitor@x.test' where id = '${GOV_CONTACT_3}'`),
    ).toBe(true);
    expect(
      escreveComo(GOV_AGENT_A, `update public.contacts set email = 'atendente@x.test' where id = '${GOV_CONTACT_3}'`),
    ).toBe(1);
  });

  it("atendente não reabre opt-out, não anonimiza nem funde contato pelo login", () => {
    sql(`update public.contacts set is_blocked = true, blocked_reason = 'stop_keyword', blocked_at = now()
           where id = '${GOV_CONTACT_3}';`);
    const tenta = (set: string) =>
      expect(() =>
        sql(`
          set role authenticated;
          select set_config('request.jwt.claims', '{"sub":"${GOV_AGENT_A}"}', false);
          update public.contacts set ${set} where id = '${GOV_CONTACT_3}';`),
      ).toThrow(/colunas_de_controle_do_contato/);
    tenta("is_blocked = false, blocked_reason = null, blocked_at = null");
    tenta("is_anonymized = true, anonymized_at = now()");
    tenta(`is_merged_into = '${GOV_CONTACT_1}', merged_at = now()`);
    // CONTROLE: o servidor (rota de desbloqueio, pela service role) reabre.
    expect(
      lastLine(
        sql(`set role service_role;
             with w as (update public.contacts set is_blocked = false, blocked_reason = null, blocked_at = null
                         where id = '${GOV_CONTACT_3}' returning 1) select count(*) from w;`),
      ),
    ).toBe("1");
  });

  it("CONTROLE: a retomada (atendente) solta o \"só humano\" do contato", () => {
    sql(`update public.contacts set force_human = true where id = '${GOV_CONTACT_3}';`);
    expect(
      escreveComo(GOV_AGENT_A, `update public.contacts set force_human = false where id = '${GOV_CONTACT_3}'`),
    ).toBe(1);
  });

  it("consentimento, origem e \"só humano\" mudados pelo login ficam na auditoria (com quem mudou, de e para)", () => {
    const auditoria = (acao: string) =>
      lastLine(
        sql(`select count(*) || '|' || coalesce(max(actor_user_id::text), '-')
               from public.api_audit_log
              where resource_id = '${GOV_CONTACT_3}' and action = '${acao}' and metadata->>'registrado_por' = 'banco';`),
      );
    expect(
      escreveComo(
        GOV_AGENT_A,
        `update public.contacts set consent = consent || '{"marketing":{"granted_at":"2026-11-13T00:00:00Z","source":"forjado"}}'::jsonb, source = 'api' where id = '${GOV_CONTACT_3}'`,
      ),
    ).toBe(1);
    expect(auditoria("lgpd.consent_changed")).toBe(`1|${GOV_AGENT_A}`);
    // A retomada do caso anterior (force_human → false) e esta troca de origem.
    expect(auditoria("contact.updated")).toBe(`2|${GOV_AGENT_A}`);
    expect(
      lastLine(
        sql(`select metadata->'para'->'marketing'->>'source' from public.api_audit_log
              where resource_id = '${GOV_CONTACT_3}' and action = 'lgpd.consent_changed' order by created_at desc limit 1;`),
      ),
    ).toBe("forjado");
    // CONTROLE: mudança pelo servidor é auditada por quem a faz, não pelo banco.
    sql(`update public.contacts set source = 'manual' where id = '${GOV_CONTACT_3}';`);
    expect(auditoria("contact.updated")).toBe(`2|${GOV_AGENT_A}`);
  });
});

describe("0509 — barramento de eventos e recibos de idempotência", () => {
  it("prévia de mensagem no event_log: atendente não lê; gerente lê", () => {
    sql(`insert into public.event_log (organization_id, event_type, entity_kind, entity_id, payload)
           values ('${GOV_ORG}','message.outbound','message',gen_random_uuid(),'{"body_preview":"segredo r2"}');`);
    const q = "select count(*) from public.event_log where payload->>'body_preview' = 'segredo r2';";
    expect(countAs(GOV_AGENT_A, q)).toBe(0);
    expect(countAs(GOV_MANAGER, q)).toBe(1);
  });

  it("recibo de idempotência é de quem o criou", () => {
    expect(
      escreveComo(
        GOV_AGENT_A,
        `insert into public.idempotency_keys (organization_id, key, endpoint, request_hash, status_code, response_body)
           values ('${GOV_ORG}','r2-chave','/api/v1/messages','\\x00'::bytea, 201, '{"body":"oi"}')`,
      ),
    ).toBe(1);
    const q = "select count(*) from public.idempotency_keys where key = 'r2-chave';";
    expect(countAs(GOV_AGENT_A, q)).toBe(1);
    expect(countAs(GOV_AGENT_B, q)).toBe(0);
  });

  it("recibo da service role (token de servidor) não aparece para login nenhum", () => {
    sql(`insert into public.idempotency_keys (organization_id, key, endpoint, request_hash, status_code, response_body)
           values ('${GOV_ORG}','r2-chave-token','/api/v1/messages','\\x00'::bytea, 201, '{"body":"do token"}');`);
    const q = "select count(*) from public.idempotency_keys where key = 'r2-chave-token';";
    expect(countAs(GOV_MANAGER, q)).toBe(0);
    expect(countAs(GOV_AGENT_A, q)).toBe(0);
    expect(sql(q).trim()).toBe("1");
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

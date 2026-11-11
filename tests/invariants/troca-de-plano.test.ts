/**
 * Migration 0508 — troca de plano pedida pelo cliente.
 *
 * O pedido mora na assinatura; quem o grava é o servidor (rota do CRM) e quem o
 * aplica é o webhook da página de vendas, pela identidade da cobrança. O banco
 * garante: troca coerente (plano e tipo juntos, só Essencial/Impulso), uma
 * cobrança de troca não aponta para duas assinaturas, e o membro não escreve
 * nada disso pela REST (nem a troca, nem o plano).
 */
import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const org = "f5080000-0000-4000-8000-000000000001";
const org2 = "f5080000-0000-4000-8000-000000000002";
const dono = "f5080000-0000-4000-8000-000000000003";
const sub = "f5080000-0000-4000-8000-000000000004";
const sub2 = "f5080000-0000-4000-8000-000000000005";

const seed = `begin;
insert into auth.users(id,email) values('${dono}','dono-0508@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values('${org}','p0508-a','A','A'),('${org2}','p0508-b','B','B');
insert into user_organizations(organization_id,user_id,role,accepted_at) values('${org}','${dono}','admin',now());
insert into subscriptions(id,organization_id,status,plan_type,billing_cycle) values
  ('${sub}','${org}','active','essencial','monthly'),('${sub2}','${org2}','active','essencial','monthly');`;
const recusa = (stmt: string, erro = "check_violation") =>
  `do $$ begin begin ${stmt}; raise exception 'passou'; exception when ${erro} then null; end; end $$;`;
const prova = (corpo: string) =>
  expect(sql(`${seed}\n${corpo}\nrollback; select 'provado';`)).toContain("provado");

describe("0508 — troca de plano", () => {
  it("troca incoerente é recusada; a coerente grava", () =>
    prova(`
      ${recusa(`update subscriptions set troca_plano='impulso' where id='${sub}'`)}
      ${recusa(`update subscriptions set troca_plano='escala', troca_tipo='upgrade' where id='${sub}'`)}
      ${recusa(`update subscriptions set troca_plano='impulso', troca_tipo='lateral' where id='${sub}'`)}
      ${recusa(`update subscriptions set troca_plano='impulso', troca_tipo='upgrade', troca_valor_cents=-1 where id='${sub}'`)}
      update subscriptions set troca_plano='impulso', troca_tipo='upgrade', troca_pagamento_id='pay_0508', troca_valor_cents=3000 where id='${sub}';
    `));

  it("uma cobrança de troca não aponta para duas assinaturas", () =>
    prova(`
      update subscriptions set troca_plano='impulso', troca_tipo='upgrade', troca_pagamento_id='pay_0508' where id='${sub}';
      ${recusa(`update subscriptions set troca_plano='impulso', troca_tipo='upgrade', troca_pagamento_id='pay_0508' where id='${sub2}'`, "unique_violation")}
    `));

  it("o membro lê a troca, mas não escreve a troca nem o plano pela REST", () =>
    prova(`
      update subscriptions set troca_plano='impulso', troca_tipo='upgrade', troca_pagamento_id='pay_0508' where id='${sub}';
      select set_config('request.jwt.claims','{"sub":"${dono}","aal":"aal1"}',true);
      set local role authenticated;
      do $$ begin if (select troca_plano from subscriptions where id='${sub}') is distinct from 'impulso'
        then raise exception 'membro não leu a troca'; end if; end $$;
      ${recusa(`update subscriptions set plan_type='impulso' where id='${sub}'`, "insufficient_privilege")}
      ${recusa(`update subscriptions set troca_pagamento_id='pay_outra' where id='${sub}'`, "insufficient_privilege")}
    `));
});

/**
 * Migration 0506 — acompanhamento de suporte não cria nem muda membros.
 *
 * Auditoria de 04/11/2026: num acompanhamento completo, a pessoa da plataforma
 * (admin efetiva da organização B, sem ser membro) convidava a si mesma e
 * aceitava de OUTRA sessão — virava admin permanente de B, que sobrevivia ao
 * fim do acompanhamento e à revogação do acesso de plataforma. Decisão de
 * 11/11/2026: o suporte não cria membro (como no mercado); quem convida é o
 * administrador da empresa. Cada recusa tem o controle ao lado.
 */
import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ator = "f5060000-0000-4000-8000-000000000001";
const sessao = "f5060000-0000-4000-8000-000000000002";
const outra = "f5060000-0000-4000-8000-000000000003";
const a = "f5060000-0000-4000-8000-000000000004";
const b = "f5060000-0000-4000-8000-000000000005";
const dono = "f5060000-0000-4000-8000-000000000006";

const seed = `begin;
insert into auth.users(id,email) values('${ator}','suporte-0506@invariant.test'),('${dono}','dono-0506@invariant.test');
insert into auth.sessions(id,user_id,aal) values('${sessao}','${ator}','aal1'),('${outra}','${ator}','aal1');
insert into organizations(id,slug,display_name,legal_name) values('${a}','p0506-a','A','A'),('${b}','p0506-b','B','B');
insert into user_organizations(organization_id,user_id,role,accepted_at) values('${a}','${ator}','admin',now()),('${b}','${dono}','admin',now());
insert into platform_admins(user_id,granted_by,scope,mfa_required,reason) values('${ator}','${ator}','full',false,'invariante 0506');`;
const claims = (uid: string, sid: string) =>
  `select set_config('request.jwt.claims','{"sub":"${uid}","session_id":"${sid}","aal":"aal1"}',true);`;
const inicia = `select fn_start_support('${ator}','${sessao}','${b}','${a}','full',3600);`;
const negado = (stmt: string) =>
  `do $$ begin begin ${stmt}; raise exception 'escrita escapou'; exception when insufficient_privilege then null; end; end $$;`;
const prova = (corpo: string) =>
  expect(sql(`${seed}\n${corpo}\nrollback; select 'provado';`)).toContain("provado");

describe("0506 — suporte não cria membro", () => {
  it("em acompanhamento completo, o convite para si mesmo é recusado pela REST", () =>
    prova(`${inicia} ${claims(ator, sessao)}
      set local role authenticated;
      ${negado(`insert into team_invites(organization_id,email,role,invited_by,expires_at) values('${b}','suporte-0506@invariant.test','admin','${ator}',now()+interval '1 day')`)}
      ${negado(`insert into user_organizations(organization_id,user_id,role,accepted_at) values('${b}','${ator}','admin',now())`)}
    `));

  it("em acompanhamento completo, mudar o papel de um membro também é recusado", () =>
    prova(`${inicia} ${claims(ator, sessao)}
      set local role authenticated;
      update user_organizations set role='viewer' where organization_id='${b}' and user_id='${dono}';
      reset role;
      do $$ begin if (select role from user_organizations where organization_id='${b}' and user_id='${dono}')<>'admin'
        then raise exception 'papel mudou'; end if; end $$;
    `));

  it("controle: o admin da própria empresa segue convidando", () =>
    prova(`${claims(dono, outra)}
      set local role authenticated;
      insert into team_invites(organization_id,email,role,invited_by,expires_at)
        values('${b}','novo-0506@invariant.test','agent','${dono}',now()+interval '1 day');
      reset role;
      do $$ begin if not exists(select 1 from team_invites where email='novo-0506@invariant.test') then raise exception 'convite não gravou'; end if; end $$;
    `));
});

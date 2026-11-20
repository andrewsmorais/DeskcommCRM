/**
 * Conversa privada (migration 0495) — "Privar ou liberar" do chatbot e da Inbox.
 *
 * Uma conversa privada só é vista pelo atendente responsável, por gerente/admin
 * e pelo super-admin, mesmo numa organização em que todo atendente vê tudo
 * (`visibility_mode = 'all'`). Medido como cada papel, pela RLS de verdade:
 *   - a conversa, as mensagens e as notas dela (as policies das tabelas filhas
 *     consultam `conversations` e herdam o filtro);
 *   - liberar devolve a regra da organização;
 *   - nenhuma função `security definer` de `public` (que IGNORA a RLS) chama a
 *     regra na forma de 2 argumentos, que não conhece a privacidade — era o
 *     falso verde: mudar só a policy e deixar as definer de fora.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";

const ORG = "abababab-0000-4000-8000-000000000001";
const DONO = "abababab-1111-4000-8000-000000000001";
const OUTRO = "abababab-1111-4000-8000-000000000002";
const GERENTE = "abababab-1111-4000-8000-000000000003";
const LEITOR = "abababab-1111-4000-8000-000000000004";
const SESSAO = "abababab-2222-4000-8000-000000000001";
const CONTATO = "abababab-3333-4000-8000-000000000001";
const CONVERSA = "abababab-4444-4000-8000-000000000001";
const MENSAGEM = "abababab-5555-4000-8000-000000000001";

const PAPEIS: [string, string][] = [
  [DONO, "agent"],
  [OUTRO, "agent"],
  [GERENTE, "manager"],
  [LEITOR, "viewer"],
];

const veConversa = (u: string) =>
  countAs(u, `select count(*) from public.conversations where id = '${CONVERSA}';`);
const veMensagens = (u: string) =>
  countAs(u, `select count(*) from public.messages where conversation_id = '${CONVERSA}';`);
const veNotas = (u: string) =>
  countAs(
    u,
    `select count(*) from public.conversation_notes where conversation_id = '${CONVERSA}';`,
  );
const privar = (v: boolean) =>
  sql(`update public.conversations set is_private = ${v} where id = '${CONVERSA}';`);

beforeAll(() => {
  sql(`
    ${PAPEIS.map(([id], i) => `insert into auth.users (id, email) values ('${id}', 'privada-${i}@invariant.test') on conflict do nothing;`).join("\n")}
    insert into public.organizations (id, slug, legal_name, display_name, settings)
      values ('${ORG}', 'conversa-privada', 'Conversa Privada', 'Conversa Privada',
              jsonb_build_object('visibility_mode', 'all'))
      on conflict do nothing;
    ${PAPEIS.map(([id, papel]) => `insert into public.user_organizations (user_id, organization_id, role, accepted_at) values ('${id}', '${ORG}', '${papel}', now()) on conflict do nothing;`).join("\n")}
    do $p$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO}', '${ORG}', 'conversa-privada', '\\x00'::bytea);
    exception when unique_violation then null; end $p$;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Cliente da conversa privada');
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id, assigned_at)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'claimed', '${DONO}', now());
    insert into public.messages (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
      values ('${MENSAGEM}', '${ORG}', '${CONVERSA}', '${SESSAO}', '${CONTATO}', 'text', 'inbound', 'segredo');
    insert into public.conversation_notes (organization_id, conversation_id, body, created_by_name)
      values ('${ORG}', '${CONVERSA}', 'nota interna', 'Chatbot');
  `);
});

describe("conversa privada", () => {
  it("livre: na organização em que todo atendente vê tudo, o outro atendente vê", () => {
    privar(false);
    expect(veConversa(OUTRO)).toBe(1);
    expect(veMensagens(OUTRO)).toBe(1);
  });

  it("privada: só o responsável, gerente e quem não é atendente comum enxergam", () => {
    privar(true);
    expect(veConversa(DONO)).toBe(1);
    expect(veConversa(GERENTE)).toBe(1);
    expect(veConversa(OUTRO)).toBe(0);
    expect(veConversa(LEITOR)).toBe(0);
  });

  it("privada: mensagens e notas da conversa somem junto para quem não a vê", () => {
    privar(true);
    expect(veMensagens(OUTRO)).toBe(0);
    expect(veNotas(OUTRO)).toBe(0);
    expect(veMensagens(DONO)).toBe(1);
    expect(veNotas(DONO)).toBe(1);
  });

  it("liberar devolve a regra da organização", () => {
    privar(true);
    expect(veConversa(OUTRO)).toBe(0);
    privar(false);
    expect(veConversa(OUTRO)).toBe(1);
    expect(veConversa(LEITOR)).toBe(1);
  });

  it("a policy de leitura de conversas usa a regra com privacidade", () => {
    const qual = sql(
      `select qual from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_select';`,
    );
    expect(qual).toContain("is_private");
  });

  it("nenhuma função security definer chama a regra sem a privacidade", () => {
    const out = sql(`
      select coalesce(string_agg(p.proname, ','), '')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and p.proname <> 'fn_can_view_conversation'
         and p.prosrc ~ 'fn_can_view_conversation\\(\\s*[a-z_.]+\\s*,\\s*[a-z_.]+\\s*\\)';
    `);
    expect(out.trim().split("\n").at(-1)?.trim() ?? "").toBe("");
  });
});

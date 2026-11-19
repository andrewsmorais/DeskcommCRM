import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * OS LIMITES DO PLANO DENTRO DO BANCO (migration 0563; auditoria de planos de
 * 19/11/2026, achado 5).
 *
 * Um administrador logado escreve algumas tabelas direto pela API pública do
 * banco, com o próprio token. Antes, o limite do plano só existia nas rotas: o
 * Essencial ligava o 2º chatbot, criava o 3º funil e reativava a 3ª pessoa da
 * equipe. Aqui a escrita é feita EXATAMENTE como a API pública faz (SET ROLE
 * authenticated + request.jwt.claims), e o servidor (sem o papel) continua livre.
 */

const pool = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
});

const essencial = randomUUID();
const semPlano = randomUUID();
const escala = randomUUID();
const parado = randomUUID();
const descendo = randomUUID();
const impulso = randomUUID();
const dono = randomUUID();
const outros = [randomUUID(), randomUUID(), randomUUID()];
const canalImpulso = randomUUID();

const futuro = new Date(Date.now() + 20 * 86_400_000).toISOString();
const passado = new Date(Date.now() - 86_400_000).toISOString();

async function comoUsuario<T>(
  run: (db: pg.PoolClient) => Promise<T>,
  aal: "aal1" | "aal2" = "aal1",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: dono, role: "authenticated", aal }),
    ]);
    const r = await run(client);
    await client.query("commit");
    return r;
  } catch (erro) {
    await client.query("rollback");
    throw erro;
  } finally {
    client.release();
  }
}

const recusado = (p: Promise<unknown>) => expect(p).rejects.toThrow(/plano_limite_atingido/);

async function chatbot(org: string, ativo: boolean, comoServidor = false): Promise<string> {
  const id = randomUUID();
  const inserir = (db: pg.Pool | pg.PoolClient) =>
    db.query("insert into public.chatbot_flows (id, organization_id, name, is_active) values ($1,$2,$3,$4)", [
      id,
      org,
      `Fluxo ${id.slice(0, 6)}`,
      ativo,
    ]);
  if (comoServidor) await inserir(pool);
  else await comoUsuario(inserir);
  return id;
}

beforeAll(async () => {
  await pool.query("insert into auth.users(id,email) values($1,$2)", [dono, `dono-${dono.slice(0, 8)}@invariant.test`]);
  for (const u of outros)
    await pool.query("insert into auth.users(id,email) values($1,$2)", [u, `p-${u.slice(0, 8)}@invariant.test`]);
  for (const [org, slug] of [
    [essencial, "ess"],
    [semPlano, "sem"],
    [escala, "esc"],
    [parado, "par"],
    [descendo, "desc"],
    [impulso, "imp"],
  ] as const) {
    await pool.query(
      "insert into organizations(id,slug,display_name,legal_name) values($1,$2,$3,$3)",
      [org, `lim-${slug}-${org.slice(0, 6)}`, `Org ${slug}`],
    );
    await pool.query(
      "insert into user_organizations(organization_id,user_id,role,accepted_at) values($1,$2,'admin',now())",
      [org, dono],
    );
  }
  const assinatura = (org: string, plano: string, fim: string) =>
    pool.query(
      "insert into subscriptions(organization_id,status,plan_type,billing_cycle,current_period_end) values($1,'active',$2,'monthly',$3)",
      [org, plano, fim],
    );
  await assinatura(essencial, "essencial", futuro);
  await assinatura(escala, "escala", futuro);
  await assinatura(parado, "essencial", passado);
  await assinatura(impulso, "impulso", futuro);
  await pool.query(
    `insert into subscriptions(organization_id,status,plan_type,billing_cycle,current_period_end,troca_tipo,troca_plano,troca_efetiva_em)
     values($1,'active','escala','monthly',$2,'downgrade','essencial',$2)`,
    [descendo, futuro],
  );
  await pool.query(
    "insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values($1,$2,$3,'\\x00')",
    [canalImpulso, impulso, `lim-${canalImpulso.slice(0, 8)}`],
  );
});

afterAll(async () => {
  const orgs = [essencial, semPlano, escala, parado, descendo, impulso];
  await pool.query("delete from organizations where id = any($1::uuid[])", [orgs]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [[dono, ...outros]]);
  await pool.end();
});

describe("0563 — limites do plano dentro do banco", () => {
  it("Essencial: o 2º chatbot ligado pela API pública é recusado; desligado entra", async () => {
    await chatbot(essencial, true);
    await recusado(chatbot(essencial, true));
    const desligado = await chatbot(essencial, false);
    // Ligar depois também conta.
    await recusado(
      comoUsuario((db) => db.query("update chatbot_flows set is_active = true where id = $1", [desligado])),
    );
  });

  it("o servidor (sem o papel da API pública) segue livre: a rota já contou", async () => {
    await chatbot(essencial, true, true);
    const { rows } = await pool.query(
      "select count(*)::int as n from chatbot_flows where organization_id = $1 and is_active",
      [essencial],
    );
    expect(rows[0].n).toBe(2);
  });

  it("desligar nunca é barrado, mesmo acima do limite", async () => {
    await comoUsuario((db) =>
      db.query("update chatbot_flows set is_active = false where organization_id = $1", [essencial]),
    );
  });

  it("funis: o 3º não arquivado é recusado; arquivado entra; desarquivar conta", async () => {
    const funil = (arquivado: boolean) =>
      comoUsuario((db) =>
        db
          .query(
            "insert into crm_pipelines(id,organization_id,name,slug,is_archived) values($1,$2,'F',$3,$4) returning id",
            [randomUUID(), essencial, `f-${randomUUID().slice(0, 8)}`, arquivado],
          )
          .then((r) => r.rows[0].id as string),
      );
    // A organização pode nascer com um funil padrão: completa até o teto (2).
    const { rows } = await pool.query(
      "select count(*)::int as n from crm_pipelines where organization_id = $1 and not is_archived",
      [essencial],
    );
    for (let i = rows[0].n; i < 2; i++) await funil(false);
    await recusado(funil(false));
    const guardado = await funil(true);
    await recusado(
      comoUsuario((db) => db.query("update crm_pipelines set is_archived = false where id = $1", [guardado])),
    );
  });

  it("equipe: reativar a 3ª pessoa no Essencial é recusado", async () => {
    await pool.query(
      "insert into user_organizations(organization_id,user_id,role,accepted_at) values($1,$2,'agent',now())",
      [essencial, outros[0]],
    );
    await pool.query(
      "insert into user_organizations(organization_id,user_id,role,accepted_at,revoked_at) values($1,$2,'agent',now(),now())",
      [essencial, outros[1]],
    );
    await recusado(
      comoUsuario((db) =>
        db.query(
          "update user_organizations set revoked_at = null where organization_id = $1 and user_id = $2",
          [essencial, outros[1]],
        ),
      ),
    );
  });

  it("sem assinatura (instalação que não vende planos): sem limite", async () => {
    await chatbot(semPlano, true);
    await chatbot(semPlano, true);
    await chatbot(semPlano, true);
  });

  it("assinatura parada: nada novo liga", async () => {
    await recusado(chatbot(parado, true));
  });

  it("Escala: 3 chatbots, o 4º recusado; a proposta do dono sobe o teto", async () => {
    await chatbot(escala, true);
    await chatbot(escala, true);
    await chatbot(escala, true);
    await recusado(chatbot(escala, true));
    await pool.query(
      `update subscriptions set limites_personalizados = '{"chatbots": 4}'::jsonb where organization_id = $1`,
      [escala],
    );
    await chatbot(escala, true);
  });

  it("descida pendente: criar já respeita o plano menor", async () => {
    await chatbot(descendo, true);
    await recusado(chatbot(descendo, true));
  });

  it("o jeito de distribuir POR NÚMERO exige o Escala; voltar ao padrão é livre", async () => {
    await expect(
      comoUsuario(
        (db) =>
          db.query("select public.fn_set_channel_distribution_mode($1,$2,'round_robin')", [impulso, canalImpulso]),
        "aal2",
      ),
    ).rejects.toThrow(/routing_plan_required/);
    await comoUsuario(
      (db) => db.query("select public.fn_set_channel_distribution_mode($1,$2,null)", [impulso, canalImpulso]),
      "aal2",
    );
  });

  it("as funções de plano não ficam expostas a quem está logado", async () => {
    await expect(
      comoUsuario((db) => db.query("select public.fn_limite_do_plano($1,'chatbots')", [essencial])),
    ).rejects.toThrow(/permission denied/);
  });
});

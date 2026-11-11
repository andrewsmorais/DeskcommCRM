/**
 * A CREDENCIAL DO AGENDADOR NÃO ASSINA NADA.
 *
 * `INTERNAL_SECRET` e `INTERNAL_CRON_SECRET` são o Bearer que `autorizaCron`
 * aceita, e o produto manda colá-los fora da instalação (cron-job.org, segredo
 * do GitHub Actions, Vercel Cron). Até esta correção eram também a chave do link
 * de exportação e do `state` do OAuth da loja: quem tinha o relógio fabricava o
 * link de qualquer organização e baixava o ZIP inteiro dela, ou forjava o
 * `state` e gravava a própria loja na integração da vítima.
 *
 * Este arquivo prende as duas direções: nenhum valor aceito como Bearer verifica
 * link ou `state`, e o que a chave nova assina verifica — até a raiz girar.
 * O par Agenda/Ads é medido pelas rotas, em `agenda-google-callback-route` e
 * `google-ads-callback-route`, porque lá a chave é escolhida no call site.
 */
import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  env: {
    INTERNAL_SECRET: "bearer-do-relogio-colado-no-cron-job-org",
    INTERNAL_CRON_SECRET: "bearer-dedicado-do-agendador-externo-xyz",
    NEXT_PUBLIC_APP_URL: "https://crm.exemplo",
  },
}));
vi.mock("@/lib/env", () => ({ env: fake.env }));

import { autorizaCron } from "@/lib/auth/cron-auth";
import { chaveDeAssinatura, ROTULOS_DE_ASSINATURA } from "@/lib/auth/chave-de-assinatura";
import { caminhoDeExportacao, segredoDaExportacao } from "@/lib/exportacao/link";
import { assinarLink, verificarLink } from "@/lib/exportacao/token";
import { issueState, verifyState } from "@/lib/nuvemshop/state";

const VITIMA = "33333333-3333-4333-8333-333333333333";
const ATOR = "44444444-4444-4444-8444-444444444444";
const SESSAO = "55555555-5555-4555-8555-555555555555";
const RAIZ = "uma-service-role-key-de-teste-bem-comprida-0123456789";

const ORIGINAL = {
  LINK_SIGNING_SECRET: process.env.LINK_SIGNING_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  INTERNAL_SECRET: process.env.INTERNAL_SECRET,
};

function restaurar(nome: keyof typeof ORIGINAL) {
  const v = ORIGINAL[nome];
  if (v === undefined) delete process.env[nome];
  else process.env[nome] = v;
}

/** Os dois arranjos que o produto documenta: só INTERNAL_SECRET, ou um secret dedicado de cron. */
const ARRANJOS = [
  { nome: "só INTERNAL_SECRET", cron: "" },
  { nome: "com INTERNAL_CRON_SECRET dedicado", cron: "bearer-dedicado-do-agendador-externo-xyz" },
];

function bearersAceitos(): string[] {
  return [fake.env.INTERNAL_CRON_SECRET, fake.env.INTERNAL_SECRET].filter(Boolean);
}

function pedidoDeCron(bearer: string): NextRequest {
  return new NextRequest("https://crm.exemplo/api/v1/cron/qualquer", {
    headers: { authorization: `Bearer ${bearer}` },
  });
}

/** O `state` da loja como quem tem só o Bearer o fabricaria (formato completo, com ator). */
function stateDaLojaForjado(chave: string): string {
  const payload = `${VITIMA}.nonce-forjado.${Date.now() + 60_000}.${ATOR}.${SESSAO}`;
  const sig = createHmac("sha256", chave).update(payload, "utf8").digest("hex");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}

beforeEach(() => {
  delete process.env.LINK_SIGNING_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = RAIZ;
  // O `state` da loja lia o ambiente direto — o Bearer fica no `process.env`
  // também, como numa instalação de verdade.
  process.env.INTERNAL_SECRET = fake.env.INTERNAL_SECRET;
});

afterEach(() => {
  restaurar("LINK_SIGNING_SECRET");
  restaurar("SUPABASE_SERVICE_ROLE_KEY");
  restaurar("INTERNAL_SECRET");
  fake.env.INTERNAL_CRON_SECRET = "bearer-dedicado-do-agendador-externo-xyz";
});

describe.each(ARRANJOS)("nenhum Bearer de cron assina ($nome)", ({ cron }) => {
  beforeEach(() => {
    fake.env.INTERNAL_CRON_SECRET = cron;
  });

  it("controle: cada valor usado abaixo É aceito por `autorizaCron`", () => {
    // Sem isto o caso seguinte provaria só que um valor qualquer não assina.
    for (const bearer of bearersAceitos()) expect(autorizaCron(pedidoDeCron(bearer))).toBe(true);
  });

  it("link de exportação fabricado com o Bearer não verifica", () => {
    for (const bearer of bearersAceitos()) {
      const token = assinarLink(
        { orgId: VITIMA, expiraEm: new Date(Date.now() + 3_600_000) },
        bearer,
      );
      expect(token, "o fabricante consegue assinar — a defesa é na verificação").toBeTruthy();
      expect(verificarLink(token as string, segredoDaExportacao())).toBeNull();
      expect(segredoDaExportacao()).not.toBe(bearer);
    }
  });

  it("`state` da loja fabricado com o Bearer não verifica", () => {
    for (const bearer of bearersAceitos()) {
      expect(verifyState(stateDaLojaForjado(bearer))).toBeNull();
    }
  });
});

describe("a chave nova assina, e morre quando a raiz gira", () => {
  it("o link que o produto emite verifica", () => {
    const caminho = caminhoDeExportacao(VITIMA, new Date(Date.now() + 3_600_000));
    expect(caminho).toMatch(/^\/api\/v1\/exportacao\//);
    const token = (caminho as string).split("/").pop() as string;
    expect(verificarLink(token, segredoDaExportacao())).toMatchObject({ orgId: VITIMA });
  });

  it("trocar a SUPABASE_SERVICE_ROLE_KEY invalida o link e o `state`", () => {
    const token = (caminhoDeExportacao(VITIMA, new Date(Date.now() + 3_600_000)) as string)
      .split("/")
      .pop() as string;
    const state = issueState(VITIMA, { userId: ATOR, authSessionId: SESSAO });
    expect(verifyState(state)).toMatchObject({ orgId: VITIMA });

    process.env.SUPABASE_SERVICE_ROLE_KEY = "outra-service-role-key-girada-pelo-operador-987654";
    expect(verificarLink(token, segredoDaExportacao())).toBeNull();
    expect(verifyState(state)).toBeNull();
  });

  it("definir LINK_SIGNING_SECRET passa a valer no lugar da service role, e invalida o que havia", () => {
    const token = (caminhoDeExportacao(VITIMA, new Date(Date.now() + 3_600_000)) as string)
      .split("/")
      .pop() as string;
    process.env.LINK_SIGNING_SECRET = "segredo-de-assinatura-dedicado-com-32-ou-mais";
    expect(verificarLink(token, segredoDaExportacao())).toBeNull();

    const novo = (caminhoDeExportacao(VITIMA, new Date(Date.now() + 3_600_000)) as string)
      .split("/")
      .pop() as string;
    expect(verificarLink(novo, segredoDaExportacao())).toMatchObject({ orgId: VITIMA });
    // Girar a service role agora não mexe: a raiz é a dedicada.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "outra-service-role-key-girada-pelo-operador-987654";
    expect(verificarLink(novo, segredoDaExportacao())).toMatchObject({ orgId: VITIMA });
  });
});

describe("chaveDeAssinatura", () => {
  it("é estável para o mesmo rótulo e diferente entre rótulos", () => {
    const valores = Object.values(ROTULOS_DE_ASSINATURA);
    expect(new Set(valores).size, "dois usos com o mesmo rótulo assinariam um pelo outro").toBe(
      valores.length,
    );
    const chaves = valores.map((r) => chaveDeAssinatura(r));
    expect(new Set(chaves).size).toBe(valores.length);
    for (const r of valores) expect(chaveDeAssinatura(r)).toBe(chaveDeAssinatura(r));
  });

  it("nunca devolve a raiz nem um Bearer em claro", () => {
    for (const r of Object.values(ROTULOS_DE_ASSINATURA)) {
      const chave = chaveDeAssinatura(r);
      expect(chave).toMatch(/^[0-9a-f]{64}$/);
      expect([RAIZ, fake.env.INTERNAL_SECRET, fake.env.INTERNAL_CRON_SECRET]).not.toContain(chave);
    }
  });

  it("LINK_SIGNING_SECRET curto é ignorado; sem raiz utilizável devolve vazio", () => {
    const comServico = chaveDeAssinatura(ROTULOS_DE_ASSINATURA.exportacao);
    process.env.LINK_SIGNING_SECRET = "curto";
    expect(chaveDeAssinatura(ROTULOS_DE_ASSINATURA.exportacao)).toBe(comServico);

    process.env.SUPABASE_SERVICE_ROLE_KEY = "tambem-curta";
    expect(chaveDeAssinatura(ROTULOS_DE_ASSINATURA.exportacao)).toBe("");
    // E quem chama recusa: link nenhum sai sem assinatura.
    expect(caminhoDeExportacao(VITIMA, new Date(Date.now() + 3_600_000))).toBeNull();
  });

  it("não depende de nenhum Bearer: girar INTERNAL_SECRET não muda a chave", () => {
    const antes = chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDaLoja);
    process.env.INTERNAL_SECRET = "bearer-girado-depois-de-vazar-no-agendador";
    fake.env.INTERNAL_SECRET = "bearer-girado-depois-de-vazar-no-agendador";
    expect(chaveDeAssinatura(ROTULOS_DE_ASSINATURA.estadoDaLoja)).toBe(antes);
    fake.env.INTERNAL_SECRET = "bearer-do-relogio-colado-no-cron-job-org";
  });
});

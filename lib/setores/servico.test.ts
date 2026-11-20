/**
 * `transferirParaSetor` — a ordem dos efeitos ao mandar a conversa a um setor,
 * com um client falso que registra cada chamada:
 *   - dono de fora do setor solta a conversa; dono do setor fica com ela;
 *   - a passagem para humanos é gravada ANTES de soltar (senão a conversa
 *     voltaria ao automático) e a distribuição é pedida por último;
 *   - tirar o setor (null) só limpa a marca;
 *   - setor de outra organização não é achado (a busca filtra a organização).
 */
import { comandoDaConversa } from "@/lib/inbox/comando-da-conversa";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { membrosRecusados, setorInputSchema, transferirParaSetor } from "./servico";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "22222222-2222-4222-8222-222222222222";
const SETOR = "33333333-3333-4333-8333-333333333333";
const ANA = "44444444-4444-4444-8444-444444444444";

type Linha = Record<string, unknown>;
type Chamada =
  | { tipo: "update"; tabela: string; valores: Linha; filtros: Linha }
  | { tipo: "rpc"; nome: string; args: Linha };

/** Client falso: tabelas em memória, filtro por `eq`, e o registro do que mudou. */
function clientFalso(tabelas: Record<string, Linha[]>) {
  const chamadas: Chamada[] = [];
  const from = (tabela: string) => {
    const filtros: Linha = {};
    let valores: Linha | null = null;
    const linhas = () =>
      (tabelas[tabela] ?? []).filter((l) => Object.entries(filtros).every(([k, v]) => l[k] === v));
    const q = {
      select: () => q,
      update: (v: Linha) => {
        valores = v;
        return q;
      },
      eq: (k: string, v: unknown) => {
        filtros[k] = v;
        return q;
      },
      is: () => q,
      in: (k: string, vs: unknown[]) => {
        const lista = linhas().filter((l) => vs.includes(l[k]));
        return Promise.resolve({ data: lista, error: null });
      },
      maybeSingle: () => Promise.resolve({ data: linhas()[0] ?? null, error: null }),
      then: (ok: (r: { error: null }) => unknown) => {
        if (valores) chamadas.push({ tipo: "update", tabela, valores, filtros: { ...filtros } });
        return Promise.resolve({ error: null }).then(ok);
      },
    };
    return q;
  };
  const rpc = (nome: string, args: Linha) => {
    chamadas.push({ tipo: "rpc", nome, args });
    return Promise.resolve({ data: null, error: null });
  };
  return { db: { from, rpc } as unknown as SupabaseClient, chamadas };
}

const conversa = (extra: Linha = {}) => ({
  id: CONVERSA,
  organization_id: ORG,
  status: "claimed",
  assigned_to_user_id: ANA,
  setor_id: null,
  ...extra,
});
const setor = { id: SETOR, organization_id: ORG };

describe("transferirParaSetor", () => {
  it("dono de fora do setor solta a conversa, depois da passagem para humanos", async () => {
    const { db, chamadas } = clientFalso({
      conversations: [conversa()],
      setores: [setor],
      setor_membros: [],
    });
    const r = await transferirParaSetor(db, {
      organizationId: ORG,
      conversationId: CONVERSA,
      setorId: SETOR,
    });
    expect(r).toEqual({ ok: true, soltouDono: true, setorAnterior: null });
    expect(chamadas.map((c) => (c.tipo === "rpc" ? c.nome : `update ${c.tabela}`))).toEqual([
      "update conversations",
      "fn_conversation_assign",
      "fn_request_channel_routing",
    ]);
    const update = chamadas[0] as Extract<Chamada, { tipo: "update" }>;
    expect(update.valores).toMatchObject({
      setor_id: SETOR,
      bot_silenced_until: "infinity",
      last_handoff_reason: "setor",
      active_ai_agent_id: null,
    });
    expect(update.filtros).toMatchObject({ organization_id: ORG, id: CONVERSA });
    expect((chamadas[1] as Extract<Chamada, { tipo: "rpc" }>).args).toMatchObject({
      p_organization_id: ORG,
      p_to_user_id: null,
      p_reason: "release",
    });
  });

  it("dono que é do setor fica com a conversa", async () => {
    const { db, chamadas } = clientFalso({
      conversations: [conversa()],
      setores: [setor],
      setor_membros: [{ organization_id: ORG, setor_id: SETOR, user_id: ANA }],
    });
    const r = await transferirParaSetor(db, {
      organizationId: ORG,
      conversationId: CONVERSA,
      setorId: SETOR,
    });
    expect(r).toMatchObject({ ok: true, soltouDono: false });
    expect(chamadas.some((c) => c.tipo === "rpc" && c.nome === "fn_conversation_assign")).toBe(
      false,
    );
  });

  it("conversa com a IA vai para Aguardando", async () => {
    const { db, chamadas } = clientFalso({
      conversations: [conversa({ status: "ai_handling", assigned_to_user_id: null })],
      setores: [setor],
    });
    await transferirParaSetor(db, {
      organizationId: ORG,
      conversationId: CONVERSA,
      setorId: SETOR,
    });
    const valores = (chamadas[0] as Extract<Chamada, { tipo: "update" }>).valores;
    // Quem manda é o comando, não o status: a trava do robô põe na fila humana.
    expect(valores.bot_silenced_until).toBe("infinity");
    expect("status" in valores).toBe(false);
    const comando = comandoDaConversa(
      {
        status: "ai_handling",
        assigned_to_user_id: null,
        bot_silenced_until: valores.bot_silenced_until as string,
      } as never,
      new Date("2026-11-03T12:00:00Z"),
    );
    expect(comando.comando.quem).toBe("aguardando");
  });

  it("tirar o setor só limpa a marca", async () => {
    const { db, chamadas } = clientFalso({ conversations: [conversa({ setor_id: SETOR })] });
    const r = await transferirParaSetor(db, {
      organizationId: ORG,
      conversationId: CONVERSA,
      setorId: null,
    });
    expect(r).toEqual({ ok: true, soltouDono: false, setorAnterior: SETOR });
    expect(chamadas).toHaveLength(1);
    expect((chamadas[0] as Extract<Chamada, { tipo: "update" }>).valores).toMatchObject({
      setor_id: null,
    });
  });

  it("setor de outra organização não é achado e nada muda", async () => {
    const { db, chamadas } = clientFalso({
      conversations: [conversa()],
      setores: [{ id: SETOR, organization_id: "99999999-9999-4999-8999-999999999999" }],
    });
    const r = await transferirParaSetor(db, {
      organizationId: ORG,
      conversationId: CONVERSA,
      setorId: SETOR,
    });
    expect(r).toEqual({ ok: false, erro: "setor_nao_encontrado" });
    expect(chamadas).toHaveLength(0);
  });
});

describe("cadastro do setor", () => {
  it("nome obrigatório, aparado, até 60 letras", () => {
    expect(setorInputSchema.safeParse({ nome: "  " }).success).toBe(false);
    expect(setorInputSchema.safeParse({ nome: "x".repeat(61) }).success).toBe(false);
    expect(setorInputSchema.parse({ nome: "  Vendas " })).toEqual({ nome: "Vendas", membros: [] });
  });

  it("leitor (viewer) e quem não é da equipe não entram como membro", async () => {
    const OUTRO = "55555555-5555-4555-8555-555555555555";
    const LEITOR = "66666666-6666-4666-8666-666666666666";
    const { db } = clientFalso({
      user_organizations: [
        { organization_id: ORG, user_id: ANA, role: "agent" },
        { organization_id: ORG, user_id: LEITOR, role: "viewer" },
      ],
    });
    expect(await membrosRecusados(db, ORG, [ANA, LEITOR, OUTRO])).toEqual([LEITOR, OUTRO]);
  });
});

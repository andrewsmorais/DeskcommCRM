import { describe, expect, it } from "vitest";

import { continuarAposAcao, iniciarFluxo, type ContextoDoTurno } from "./motor";
import { saidasDoPasso } from "./passos";

const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({ id, type, position: { x: 0, y: 0 }, data });
const liga = (s: string, t: string, h = "proximo") => ({ id: `${s}-${h}-${t}`, source: s, target: t, sourceHandle: h });
const ctx: ContextoDoTurno = { mensagem: "oi", agora: new Date("2026-10-22T13:30:00Z"), fuso: "America/Sao_Paulo" };
const SETOR = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("Enviar mensagem — seguir outro caminho se não sair", () => {
  const grafo = (ligado: boolean) => ({
    nodes: [
      no("ini", "inicio_canal"),
      no("msg", "enviar_mensagem", { texto: "Seu pedido saiu.", caminho_se_falhar: ligado }),
      no("ok", "enviar_mensagem", { texto: "Qualquer coisa, chame." }),
      no("plano_b", "criar_nota", { texto: "A mensagem do pedido não saiu." }),
    ],
    edges: [liga("ini", "msg"), liga("msg", "ok"), liga("msg", "plano_b", "falha")],
  });

  it("desligado (padrão): a mensagem sai com as outras, sem esperar", () => {
    const r = iniciarFluxo(grafo(false) as never, "ini", ctx);
    expect(r.pendente).toBeUndefined();
    expect(r.efeitos).toEqual([
      { tipo: "enviar", texto: "Seu pedido saiu." },
      { tipo: "enviar", texto: "Qualquer coisa, chame." },
    ]);
    expect(saidasDoPasso("enviar_mensagem", {})).toEqual([{ id: "proximo", rotulo: "" }]);
  });

  it("ligado: o fluxo para, o executor manda, e a saída é a do que aconteceu", () => {
    const r = iniciarFluxo(grafo(true) as never, "ini", ctx);
    expect(r.pendente).toEqual({ tipo: "mensagem", no: "msg", texto: "Seu pedido saiu." });
    expect(r.efeitos).toEqual([]);
    expect(continuarAposAcao(grafo(true) as never, r.sessao, true, ctx).efeitos).toEqual([
      { tipo: "enviar", texto: "Qualquer coisa, chame." },
    ]);
    expect(continuarAposAcao(grafo(true) as never, r.sessao, false, ctx).efeitos).toEqual([
      { tipo: "nota", texto: "A mensagem do pedido não saiu." },
    ]);
    expect(saidasDoPasso("enviar_mensagem", { caminho_se_falhar: true }).map((s) => s.id)).toEqual(["proximo", "falha"]);
  });

  it("ligado mas sem ligação em 'Não saiu': a falha encerra o fluxo, não cai no caminho do acerto", () => {
    const g = grafo(true);
    g.edges = g.edges.filter((e) => e.sourceHandle !== "falha");
    const r = iniciarFluxo(g as never, "ini", ctx);
    const depois = continuarAposAcao(g as never, r.sessao, false, ctx);
    expect(depois.efeitos).toEqual([]);
    expect(depois.sessao.status).toBe("completed");
  });
});

describe("Transferir para setor — seguir outro caminho se não der", () => {
  const grafo = (dados: Record<string, unknown>) => ({
    nodes: [
      no("ini", "inicio_canal"),
      no("t", "transferir_equipe", { mensagem: "Vou te passar para o financeiro.", ...dados }),
      no("plano_b", "enviar_mensagem", { texto: "Nosso financeiro está fora do ar. Deixe seu recado." }),
    ],
    edges: [liga("ini", "t"), liga("t", "plano_b", "falha")],
  });

  it("desligado: transfere direto, como sempre", () => {
    const r = iniciarFluxo(grafo({ setor_id: SETOR }) as never, "ini", ctx);
    expect(r.pendente).toBeUndefined();
    expect(r.efeitos.at(-1)).toMatchObject({ tipo: "transferir_equipe", setor_id: SETOR });
    expect(saidasDoPasso("transferir_equipe", { setor_id: SETOR })).toEqual([]);
  });

  it("ligado: pergunta pelo setor antes; existe → transfere com a mensagem; não existe → outro caminho, sem a mensagem", () => {
    const g = grafo({ setor_id: SETOR, caminho_se_falhar: true });
    const r = iniciarFluxo(g as never, "ini", ctx);
    expect(r.pendente).toEqual({ tipo: "setor", no: "t", setor_id: SETOR, setor_da_conversa: false });
    expect(r.efeitos).toEqual([]);

    const deu = continuarAposAcao(g as never, r.sessao, true, ctx);
    expect(deu.pendente).toBeUndefined();
    expect(deu.efeitos).toEqual([
      { tipo: "enviar", texto: "Vou te passar para o financeiro." },
      { tipo: "transferir_equipe", setor_id: SETOR },
    ]);
    expect(deu.sessao.status).toBe("transferred");
    // A marca interna não fica na sessão.
    expect(Object.keys(deu.sessao.dados).filter((k) => k.startsWith("_setor"))).toEqual([]);

    const naoDeu = continuarAposAcao(g as never, r.sessao, false, ctx);
    expect(naoDeu.efeitos).toEqual([{ tipo: "enviar", texto: "Nosso financeiro está fora do ar. Deixe seu recado." }]);
  });

  it("equipe toda não tem como falhar: não pergunta nada, mesmo com a opção ligada", () => {
    const r = iniciarFluxo(grafo({ caminho_se_falhar: true }) as never, "ini", ctx);
    expect(r.pendente).toBeUndefined();
    expect(r.efeitos.at(-1)).toMatchObject({ tipo: "transferir_equipe", setor_id: null });
  });

  it("'o setor em que a conversa já estava' também pergunta", () => {
    const r = iniciarFluxo(grafo({ setor_da_conversa: true, caminho_se_falhar: true }) as never, "ini", ctx);
    expect(r.pendente).toEqual({ tipo: "setor", no: "t", setor_id: null, setor_da_conversa: true });
  });
});

describe("Acionar outro fluxo em paralelo (bot paralelo)", () => {
  const OUTRO = "0b0f7a52-3f0e-4c58-9a57-6d2a3c1e9f10";
  const grafo = (paralelo: boolean) => ({
    nodes: [
      no("ini", "inicio_canal"),
      no("abre", "acionar_fluxo", { flow_id: OUTRO, paralelo }),
      no("segue", "enviar_mensagem", { texto: "Enquanto isso, me diga seu nome." }),
    ],
    edges: [liga("ini", "abre"), liga("abre", "segue")],
  });

  it("em paralelo: pede o outro fluxo e ESTE continua", () => {
    const r = iniciarFluxo(grafo(true) as never, "ini", ctx);
    expect(r.pendente).toBeUndefined();
    expect(r.efeitos).toEqual([
      { tipo: "fluxo_paralelo", flow_id: OUTRO },
      { tipo: "enviar", texto: "Enquanto isso, me diga seu nome." },
    ]);
    expect(saidasDoPasso("acionar_fluxo", { paralelo: true })).toEqual([{ id: "proximo", rotulo: "" }]);
  });

  it("sem paralelo (padrão): este fluxo termina e o outro assume, como sempre", () => {
    const r = iniciarFluxo(grafo(false) as never, "ini", ctx);
    expect(r.pendente).toEqual({ tipo: "fluxo", no: "abre", flow_id: OUTRO });
    expect(r.efeitos).toEqual([]);
    expect(r.sessao.status).toBe("completed");
    expect(saidasDoPasso("acionar_fluxo", {})).toEqual([]);
  });
});

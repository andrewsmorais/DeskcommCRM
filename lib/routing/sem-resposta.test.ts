import { describe, expect, it } from "vitest";

import { lerPrazoSemRespostaMinutos, selecionarSemResposta, type ConversaComDono } from "./sem-resposta";

const ORG = "org-1";
const AGORA = Date.parse("2026-11-18T15:00:00Z");
const antes = (min: number) => new Date(AGORA - min * 60_000).toISOString();

function conversa(p: Partial<ConversaComDono>): ConversaComDono {
  return {
    id: "c1",
    organization_id: ORG,
    status: "claimed",
    is_group: false,
    assigned_to_user_id: "u1",
    assigned_at: antes(120),
    last_inbound_at: antes(60),
    last_outbound_at: null,
    ...p,
  };
}
const prazo = new Map([[ORG, 30]]);
const quem = (c: ConversaComDono[]) => selecionarSemResposta(c, prazo, AGORA).map((x) => x.conversa.id);

describe("lerPrazoSemRespostaMinutos", () => {
  it("lê o prazo e recusa o que está fora da faixa", () => {
    const com = (v: unknown) => ({ routing: { unanswered_return_after_minutes: v } });
    expect(lerPrazoSemRespostaMinutos(com(30))).toBe(30);
    expect(lerPrazoSemRespostaMinutos(com(null))).toBeNull();
    expect(lerPrazoSemRespostaMinutos(com(2))).toBeNull();
    expect(lerPrazoSemRespostaMinutos(com(99999))).toBeNull();
    expect(lerPrazoSemRespostaMinutos({})).toBeNull();
    expect(lerPrazoSemRespostaMinutos(null)).toBeNull();
  });
});

describe("selecionarSemResposta", () => {
  it("devolve a conversa com cliente esperando além do prazo", () => {
    expect(quem([conversa({})])).toEqual(["c1"]);
  });
  it("não devolve antes do prazo", () => {
    expect(quem([conversa({ last_inbound_at: antes(10) })])).toEqual([]);
  });
  it("quem acabou de assumir ganha o prazo inteiro", () => {
    expect(quem([conversa({ assigned_at: antes(5) })])).toEqual([]);
    expect(quem([conversa({ assigned_at: antes(31) })])).toEqual(["c1"]);
  });
  it("não devolve quando a equipe respondeu depois do cliente", () => {
    expect(quem([conversa({ last_outbound_at: antes(20) })])).toEqual([]);
  });
  it("devolve quando a última resposta é anterior à fala do cliente", () => {
    expect(quem([conversa({ last_outbound_at: antes(90) })])).toEqual(["c1"]);
  });
  it("ignora grupo, sem dono, encerrada e sem mensagem do cliente", () => {
    expect(quem([conversa({ is_group: true })])).toEqual([]);
    expect(quem([conversa({ assigned_to_user_id: null })])).toEqual([]);
    expect(quem([conversa({ status: "closed" })])).toEqual([]);
    expect(quem([conversa({ last_inbound_at: null })])).toEqual([]);
  });
  it("organização sem prazo ligado não é tocada", () => {
    expect(selecionarSemResposta([conversa({})], new Map(), AGORA)).toEqual([]);
  });
});

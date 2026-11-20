import { describe, expect, it } from "vitest";

import { construirEmailDeExportacao } from "@/lib/email/templates/exportacao-de-dados";
import type { MarcaDeSaida } from "@/lib/branding/saida";

import { executarAvisos, type Dependencias, type EstadoDoCiclo, type LinhaDeAssinatura } from "./avisos";
import { acessoEncerrado, avisoDevido, exclusaoEm, faseDoAviso } from "./ciclo-de-vida";

const DIA = 86_400_000;
const FIM = new Date("2026-09-01T12:00:00Z");
const depois = (dias: number) => new Date(FIM.getTime() + dias * DIA);

describe("ciclo de vida: janelas", () => {
  it("antes do fim não há fase", () => expect(faseDoAviso(FIM, depois(-1))).toBeNull());
  it("encerramento até 7 dias antes da exclusão", () => {
    expect(faseDoAviso(FIM, depois(0))).toBe("encerramento");
    expect(faseDoAviso(FIM, depois(22.9))).toBe("encerramento");
  });
  it("d7 nos últimos 7 dias", () => {
    expect(faseDoAviso(FIM, depois(23))).toBe("d7");
    expect(faseDoAviso(FIM, depois(29.9))).toBe("d7");
  });
  it("dia na exclusão e 2 dias de folga, depois nada", () => {
    expect(faseDoAviso(FIM, depois(30))).toBe("dia");
    expect(faseDoAviso(FIM, depois(31.9))).toBe("dia");
    expect(faseDoAviso(FIM, depois(32))).toBeNull();
  });
  it("só um aviso devido, e nunca repete", () => {
    expect(avisoDevido(FIM, depois(25), {})).toBe("d7");
    expect(avisoDevido(FIM, depois(25), { d7: "x" })).toBeNull();
  });
  it("active nunca é encerrado, mesmo vencido", () => {
    const a = { status: "active", current_period_end: FIM.toISOString(), expires_at: null, canceled_at: null };
    expect(acessoEncerrado(a, depois(5))).toBe(false);
    expect(acessoEncerrado({ ...a, status: "canceled" }, depois(5))).toBe(true);
  });
});

function montar(linhas: LinhaDeAssinatura[], agora: Date, opts: { destinatarios?: string[]; url?: string | null; email?: boolean; enviaOk?: boolean; estado?: EstadoDoCiclo | null; baixadoEm?: string | null } = {}) {
  const gravados: EstadoDoCiclo[] = [];
  const enviados: string[] = [];
  const auditados: number[] = [];
  const dep: Dependencias = {
    agora: () => agora,
    assinaturas: async () => linhas,
    organizacao: async () => ({ nome: "Loja", redigida: false, estado: opts.estado ?? null, baixadoEm: opts.baixadoEm ?? null }),
    gravarEstado: async (_o, e) => void gravados.push(e),
    destinatarios: async () => opts.destinatarios ?? ["a@x.com", "b@x.com"],
    enviar: async ({ para }) => {
      enviados.push(para);
      return opts.enviaOk ?? true;
    },
    emailPronto: async () => opts.email ?? true,
    gerarUrl: () => (opts.url === undefined ? "https://x/y" : opts.url),
    auditar: async (_o, _a, n) => void auditados.push(n),
  };
  return { dep, gravados, enviados, auditados };
}

const linha = (status = "canceled"): LinhaDeAssinatura => ({
  organization_id: "11111111-1111-4111-8111-111111111111",
  status,
  current_period_end: FIM.toISOString(),
  expires_at: null,
  canceled_at: null,
});

describe("executarAvisos", () => {
  it("envia um e-mail por admin, grava e audita uma vez", async () => {
    const m = montar([linha()], depois(1));
    const r = await executarAvisos(m.dep);
    expect(m.enviados).toEqual(["a@x.com", "b@x.com"]);
    expect(m.gravados[0]?.avisos.encerramento).toBeTruthy();
    expect(m.auditados).toEqual([2]);
    expect(r.enviados).toHaveLength(1);
  });
  it("segunda rodada no mesmo ciclo não reenvia", async () => {
    const estado: EstadoDoCiclo = { fim: FIM.toISOString(), avisos: { encerramento: "x" } };
    const m = montar([linha()], depois(2), { estado });
    await executarAvisos(m.dep);
    expect(m.enviados).toEqual([]);
    expect(m.auditados).toEqual([]);
  });
  it("ciclo novo (fim diferente) recomeça", async () => {
    const estado: EstadoDoCiclo = { fim: "2025-01-01T00:00:00.000Z", avisos: { encerramento: "x" } };
    const m = montar([linha()], depois(2), { estado });
    await executarAvisos(m.dep);
    expect(m.enviados).toHaveLength(2);
  });
  it("conta active não recebe nada", async () => {
    const m = montar([linha("active")], depois(2));
    await executarAvisos(m.dep);
    expect(m.enviados).toEqual([]);
  });
  it("sem e-mail configurado não envia nem grava", async () => {
    const m = montar([linha()], depois(2), { email: false });
    const r = await executarAvisos(m.dep);
    expect(r.semEmail).toBe(true);
    expect(m.gravados).toEqual([]);
  });
  it("sem link não envia nem marca", async () => {
    const m = montar([linha()], depois(2), { url: null });
    const r = await executarAvisos(m.dep);
    expect(r.semLink).toBe(1);
    expect(m.enviados).toEqual([]);
    expect(m.gravados).toEqual([]);
  });
  it("sem destinatário não marca como enviado", async () => {
    const m = montar([linha()], depois(2), { destinatarios: [] });
    const r = await executarAvisos(m.dep);
    expect(r.semDestinatario).toBe(1);
    expect(m.gravados).toEqual([]);
  });
  it("falha de envio em todos não grava nem audita", async () => {
    const m = montar([linha()], depois(2), { enviaOk: false });
    const r = await executarAvisos(m.dep);
    expect(r.falhasDeEnvio).toBe(2);
    expect(m.gravados).toEqual([]);
    expect(m.auditados).toEqual([]);
  });
  it("simulação não envia, não grava, não audita", async () => {
    const m = montar([linha()], depois(2));
    const r = await executarAvisos(m.dep, { simular: true });
    expect(r.simulados).toHaveLength(1);
    expect(m.enviados).toEqual([]);
    expect(m.gravados).toEqual([]);
    expect(m.auditados).toEqual([]);
  });
});

describe("e-mail de exportação", () => {
  it("escapa o nome da organização e leva o link", async () => {
    const { NEUTROS_DE_SAIDA } = await import("@/lib/branding/saida");
    const marca = { nome: "Marca", ...NEUTROS_DE_SAIDA } as unknown as MarcaDeSaida;
    const r = construirEmailDeExportacao({
      aviso: "d7",
      orgName: "<script>x</script>",
      marca,
      urlDeDownload: "https://app/api/v1/exportacao/abc.def",
      exclusaoEm: exclusaoEm(FIM),
      suporte: "s@x.com",
    });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("https://app/api/v1/exportacao/abc.def");
    expect(r.text).toContain("https://app/api/v1/exportacao/abc.def");
    expect(r.subject.length).toBeGreaterThan(5);
  });
});

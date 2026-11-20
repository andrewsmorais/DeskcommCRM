import { describe, expect, it } from "vitest";

import { executarAvisos, type Dependencias, type LinhaDeAssinatura } from "./avisos";
import { lembreteDispensado } from "./ciclo-de-vida";
import { avisarAoTerminar, registrarDownload, ultimoDownload } from "./download";

const DIA = 86_400_000;
const FIM = new Date("2026-09-01T12:00:00Z");
const depois = (dias: number) => new Date(FIM.getTime() + dias * DIA);
const ORG = "11111111-1111-4111-8111-111111111111";

describe("lembreteDispensado", () => {
  it("o encerramento sai SEMPRE — é ele que anuncia a data da exclusão", () => {
    expect(lembreteDispensado("encerramento", FIM, depois(0.1).toISOString())).toBe(false);
  });
  it("d7 e dia param quando baixou depois do fim do acesso", () => {
    expect(lembreteDispensado("d7", FIM, depois(1).toISOString())).toBe(true);
    expect(lembreteDispensado("dia", FIM, depois(29).toISOString())).toBe(true);
  });
  it("download de quando a conta estava ativa não conta", () => {
    expect(lembreteDispensado("d7", FIM, depois(-90).toISOString())).toBe(false);
  });
  it("sem download, ou data ilegível, não dispensa", () => {
    expect(lembreteDispensado("dia", FIM, null)).toBe(false);
    expect(lembreteDispensado("dia", FIM, "ontem")).toBe(false);
  });
});

describe("executarAvisos com download", () => {
  const linha: LinhaDeAssinatura = {
    organization_id: ORG,
    status: "canceled",
    current_period_end: FIM.toISOString(),
    expires_at: null,
    canceled_at: null,
  };
  function montar(agora: Date, baixadoEm: string | null) {
    const enviados: string[] = [];
    const dep: Dependencias = {
      agora: () => agora,
      assinaturas: async () => [linha],
      organizacao: async () => ({
        nome: "Loja",
        redigida: false,
        estado: { fim: FIM.toISOString(), avisos: { encerramento: FIM.toISOString() } },
        baixadoEm,
      }),
      gravarEstado: async () => undefined,
      destinatarios: async () => ["a@x.com"],
      enviar: async ({ aviso }) => {
        enviados.push(aviso);
        return true;
      },
      emailPronto: async () => true,
      gerarUrl: () => "https://x/y",
      auditar: async () => undefined,
    };
    return { dep, enviados };
  }

  it("quem já baixou não recebe o 'faltam 7 dias'", async () => {
    const m = montar(depois(24), depois(3).toISOString());
    const r = await executarAvisos(m.dep);
    expect(m.enviados).toEqual([]);
    expect(r.jaBaixaram).toEqual([{ orgId: ORG, aviso: "d7" }]);
  });

  it("quem não baixou recebe normalmente", async () => {
    const m = montar(depois(24), null);
    await executarAvisos(m.dep);
    expect(m.enviados).toEqual(["d7"]);
  });
});

describe("ultimoDownload", () => {
  it("lê do bloco exportacao e ignora o que não é data", () => {
    expect(ultimoDownload({ exportacao: { ultimo_download_em: "2026-09-02T00:00:00.000Z" } })).toBe(
      "2026-09-02T00:00:00.000Z",
    );
    expect(ultimoDownload({ exportacao: { ultimo_download_em: "x" } })).toBeNull();
    expect(ultimoDownload({})).toBeNull();
    expect(ultimoDownload(null)).toBeNull();
  });
});

describe("registrarDownload", () => {
  it("preserva o resto de settings e o resto do bloco", async () => {
    let gravado: unknown = null;
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { settings: { tema: "violeta", exportacao: { outra: 1 }, ciclo_de_vida: { fim: "f" } } },
              error: null,
            }),
          }),
        }),
        update: (patch: unknown) => ({
          eq: async () => {
            gravado = patch;
            return { error: null };
          },
        }),
      }),
    };
    await registrarDownload(db as never, ORG, new Date("2026-09-05T10:00:00Z"));
    expect(gravado).toEqual({
      settings: {
        tema: "violeta",
        ciclo_de_vida: { fim: "f" },
        exportacao: { outra: 1, ultimo_download_em: "2026-09-05T10:00:00.000Z" },
      },
    });
  });
});

describe("avisarAoTerminar — só conta o download que chegou ao fim", () => {
  const fonte = (pedacos: string[], erroNo?: number) => {
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(c) {
        if (erroNo !== undefined && i === erroNo) {
          c.error(new Error("falhou no meio"));
          return;
        }
        if (i >= pedacos.length) c.close();
        else c.enqueue(new TextEncoder().encode(pedacos[i++]));
      },
    });
  };

  it("lido até o fim: entrega tudo e registra uma vez", async () => {
    let registros = 0;
    const s = avisarAoTerminar(fonte(["a", "b", "c"]), async () => void registros++);
    expect(await new Response(s).text()).toBe("abc");
    expect(registros).toBe(1);
  });

  it("cancelado no meio (aba fechada): não registra", async () => {
    let registros = 0;
    const s = avisarAoTerminar(fonte(["a", "b", "c"]), async () => void registros++);
    const leitor = s.getReader();
    await leitor.read();
    await leitor.cancel();
    expect(registros).toBe(0);
  });

  it("erro no meio da geração: não registra", async () => {
    let registros = 0;
    const s = avisarAoTerminar(fonte(["a", "b"], 1), async () => void registros++);
    await expect(new Response(s).text()).rejects.toThrow();
    expect(registros).toBe(0);
  });

  it("falha ao registrar não estraga o arquivo", async () => {
    const s = avisarAoTerminar(fonte(["x"]), async () => {
      throw new Error("banco fora");
    });
    expect(await new Response(s).text()).toBe("x");
  });
});

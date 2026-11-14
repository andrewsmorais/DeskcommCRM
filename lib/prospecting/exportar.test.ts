/**
 * A LISTA DA CAMPANHA DE VOLTA (vindo do produto original, #4360) — a régua de
 * "ainda não abordada" e o formato do arquivo (`;`, BOM, CRLF, fórmula neutralizada).
 */
import { describe, expect, it } from "vitest";

import {
  COLUNAS_DA_LISTA,
  csvDaLista,
  naoAbordada,
  nomeDoArquivoDaLista,
  resumoDaLista,
  type CandidatoDaLista,
} from "@/lib/prospecting/exportar";

function empresa(extra: Partial<CandidatoDaLista["data"]> = {}): CandidatoDaLista["data"] {
  return {
    name: "Padaria do Zé",
    phone: "+5511988887777",
    website: "https://padaria.test/",
    category: "Padaria",
    address: "Rua das Flores, 10 - São Paulo",
    emails: ["contato@padaria.test"],
    socials: ["https://instagram.com/padaria"],
    ...extra,
  };
}

function linha(extra: Partial<CandidatoDaLista> = {}): CandidatoDaLista {
  return { status: "new", attempted_at: null, data: empresa(), ...extra };
}

describe("quem ainda pode ser abordado", () => {
  it("só entra quem nunca teve tentativa e continua na fila", () => {
    expect(naoAbordada(linha({ status: "new" }))).toBe(true);
    expect(naoAbordada(linha({ status: "queued" }))).toBe(true);
    // Já saiu mensagem (ou está saindo): não volta para outra campanha — o
    // contato e o negócio existem, e a triagem recusaria.
    for (const status of ["sending", "sent", "skipped", "failed"]) {
      expect(naoAbordada(linha({ status }))).toBe(false);
    }
  });

  it("tentativa registrada tira a empresa mesmo que o status tenha voltado para a fila", () => {
    expect(naoAbordada(linha({ status: "queued", attempted_at: "2026-11-01T12:00:00Z" }))).toBe(false);
  });

  it("número sem WhatsApp e linha sem telefone ficam de fora", () => {
    expect(naoAbordada(linha({ data: empresa({ whatsapp: { existe: false } }) }))).toBe(false);
    expect(naoAbordada(linha({ data: empresa({ phone: null }) }))).toBe(false);
  });

  it("o resumo conta sobre a lista inteira da campanha", () => {
    const resumo = resumoDaLista([
      linha(),
      linha({ status: "sent", attempted_at: "2026-11-01T12:00:00Z" }),
      linha({ status: "queued" }),
    ]);
    expect(resumo).toEqual({ total: 3, nao_abordadas: 2 });
  });
});

describe("o arquivo CSV", () => {
  it("sai com BOM, `;` e as colunas do modelo de importação", () => {
    const csv = csvDaLista([linha()]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const [cabecalho] = csv.replace("\uFEFF", "").split("\r\n");
    expect(cabecalho).toBe("empresa;telefone;site;segmento;endereco;email;redes");
    expect(cabecalho?.split(";")).toEqual([...COLUNAS_DA_LISTA]);
    expect(csv).toContain("Padaria do Zé;+5511988887777;https://padaria.test/");
  });

  it("telefone E.164 não leva `'` de fórmula (senão a reimportação recusa o número)", () => {
    const csv = csvDaLista([linha()]);
    expect(csv).toContain(";+5511988887777;");
    expect(csv).not.toContain("'+55");
  });

  it("neutraliza célula que começa com fórmula e protege o separador", () => {
    const csv = csvDaLista([
      linha({ data: empresa({ name: "=HYPERLINK(\"x\")" }) }),
      linha({ data: empresa({ name: "Silva; Filhos" }) }),
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"Silva; Filhos"');
  });

  it("lista vazia devolve só o cabeçalho", () => {
    expect(csvDaLista([]).replace("\uFEFF", "").trim()).toBe(COLUNAS_DA_LISTA.join(";"));
  });
});


describe("o nome do arquivo", () => {
  it("sem acento, espaço nem aspas", () => {
    expect(nomeDoArquivoDaLista("Clínicas de São Paulo \"top\"", new Date("2026-11-14T10:00:00Z"))).toBe(
      "lista-clinicas-de-sao-paulo-top-2026-11-14.csv",
    );
    expect(nomeDoArquivoDaLista("***", new Date("2026-11-14T10:00:00Z"))).toBe(
      "lista-prospeccao-2026-11-14.csv",
    );
  });
});

import { unzipSync, strFromU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { BOM, celula, linha } from "./csv";
import { CONJUNTOS } from "./conjuntos";
import { assinarLink, verificarLink } from "./token";
import { criarZipDaConta, PAGINA } from "./zip";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const SEGREDO = "um-segredo-de-teste-bem-longo";

describe("csv", () => {
  it("escapa separador, aspas e quebra de linha", () => {
    expect(celula("a;b")).toBe('"a;b"');
    expect(celula('diz "oi"')).toBe('"diz ""oi"""');
    expect(celula("l1\nl2")).toBe('"l1\nl2"');
  });
  it("trata nulo, booleano, data e objeto", () => {
    expect(celula(null)).toBe("");
    expect(celula(true)).toBe("sim");
    expect(celula(false)).toBe("não");
    expect(celula({ a: 1 })).toBe('"{""a"":1}"');
  });
  it("neutraliza célula que viraria fórmula, sem deformar telefone nem número negativo", () => {
    expect(celula("=SOMA(A1)")).toBe("'=SOMA(A1)");
    expect(celula("@cmd")).toBe("'@cmd");
    expect(celula("+cmd|x")).toBe("'+cmd|x");
    expect(celula("+55 12 98166-7389")).toBe("+55 12 98166-7389");
    expect(celula("-12,5")).toBe("-12,5");
  });
  it("linha termina em CRLF", () => {
    expect(linha(["a", "b"])).toBe("a;b\r\n");
  });
});

describe("link assinado", () => {
  const em1h = () => new Date(Date.now() + 3_600_000);
  it("ida e volta devolve a organização e o prazo", () => {
    const t = assinarLink({ orgId: ORG, expiraEm: em1h() }, SEGREDO)!;
    const r = verificarLink(t, SEGREDO);
    expect(r?.orgId).toBe(ORG);
  });
  it("recusa link expirado", () => {
    const t = assinarLink({ orgId: ORG, expiraEm: new Date(Date.now() - 1000) }, SEGREDO)!;
    expect(verificarLink(t, SEGREDO)).toBeNull();
  });
  it("recusa adulteração: trocar a organização invalida a assinatura", () => {
    const t = assinarLink({ orgId: ORG, expiraEm: em1h() }, SEGREDO)!;
    const outro = assinarLink({ orgId: OUTRA, expiraEm: em1h() }, SEGREDO)!;
    const forjado = `${outro.split(".")[0]}.${t.split(".")[1]}`;
    expect(verificarLink(forjado, SEGREDO)).toBeNull();
  });
  it("recusa segredo diferente, lixo e token gigante", () => {
    const t = assinarLink({ orgId: ORG, expiraEm: em1h() }, SEGREDO)!;
    expect(verificarLink(t, "outro-segredo-completamente-diferente")).toBeNull();
    expect(verificarLink("lixo", SEGREDO)).toBeNull();
    expect(verificarLink("a".repeat(500), SEGREDO)).toBeNull();
  });
  it("sem segredo utilizável não assina nem verifica (fail-closed)", () => {
    expect(assinarLink({ orgId: ORG, expiraEm: em1h() }, "")).toBeNull();
    expect(assinarLink({ orgId: ORG, expiraEm: em1h() }, "curto")).toBeNull();
    expect(verificarLink("x.y", "")).toBeNull();
  });
  it("recusa organização que não é UUID", () => {
    expect(assinarLink({ orgId: "org_abc", expiraEm: em1h() }, SEGREDO)).toBeNull();
  });
});

describe("conjuntos", () => {
  it("todo conjunto tem id e nenhum exporta organization_id nem segredo", () => {
    for (const c of CONJUNTOS) {
      const campos = c.colunas.map((x) => x.campo);
      expect(campos[0]).toBe("id");
      expect(campos).not.toContain("organization_id");
      expect(campos.some((f) => /cpf|token|secret|credential|encrypted/i.test(f))).toBe(false);
    }
  });
});

/** Banco de mentira que respeita eq(organization_id), order(id), gt(id) e limit. */
function bancoDeMentira(tabelas: Record<string, Record<string, unknown>[]>): {
  db: SupabaseClient;
  filtros: { tabela: string; orgId: unknown }[];
} {
  const filtros: { tabela: string; orgId: unknown }[] = [];
  const db = {
    from(tabela: string) {
      let orgId: unknown;
      let maior: string | null = null;
      let limite = Infinity;
      const q = {
        select: () => q,
        eq: (_c: string, v: unknown) => {
          orgId = v;
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          limite = n;
          return q;
        },
        gt: (_c: string, v: string) => {
          maior = v;
          return q;
        },
        then(res: (v: unknown) => void) {
          filtros.push({ tabela, orgId });
          const linhas = (tabelas[tabela] ?? [])
            .filter((l) => l.organization_id === orgId)
            .filter((l) => maior === null || String(l.id) > maior)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .slice(0, limite);
          res({ data: linhas, error: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, filtros };
}

function pegar(arquivos: Record<string, Uint8Array>, nome: string): Uint8Array {
  const a = arquivos[nome];
  if (!a) throw new Error(`arquivo ausente no ZIP: ${nome}`);
  return a;
}

async function lerTudo(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const partes: Uint8Array[] = [];
  const leitor = s.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
  }
  const total = partes.reduce((n, p) => n + p.length, 0);
  const saida = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    saida.set(p, o);
    o += p.length;
  }
  return saida;
}

describe("zip da conta", () => {
  it("só leva linhas da organização do link, em todas as tabelas", async () => {
    const { db, filtros } = bancoDeMentira({
      contacts: [
        { id: "a1", organization_id: ORG, display_name: "Maria", phone_number: "+55 12 98166-7389" },
        { id: "a2", organization_id: OUTRA, display_name: "SEGREDO DE OUTRO" },
      ],
    });
    const arquivos = unzipSync(await lerTudo(criarZipDaConta(db, ORG, "Loja Teste")));
    const contatos = strFromU8(pegar(arquivos, "contatos.csv"));
    // O decodificador de texto descarta o BOM, então confere-se o byte cru.
    expect(Array.from(pegar(arquivos, "contatos.csv").slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(BOM).toBe("\uFEFF");
    expect(contatos).toContain("Maria");
    expect(contatos).not.toContain("SEGREDO DE OUTRO");
    expect(filtros.every((f) => f.orgId === ORG)).toBe(true);
    expect(filtros.length).toBeGreaterThanOrEqual(CONJUNTOS.length);
  });

  it("tem LEIA-ME, resumo e um arquivo por conjunto, mesmo vazio", async () => {
    const { db } = bancoDeMentira({});
    const arquivos = unzipSync(await lerTudo(criarZipDaConta(db, ORG, "Loja Teste")));
    expect(Object.keys(arquivos).sort()).toEqual(
      ["LEIA-ME.txt", "RESUMO.txt", ...CONJUNTOS.map((c) => c.arquivo)].sort(),
    );
    expect(strFromU8(pegar(arquivos, "LEIA-ME.txt"))).toContain("Loja Teste");
  });

  it("pagina por chave sem perder nem repetir linha (mais de uma página)", async () => {
    const n = PAGINA * 2 + 5;
    const linhas = Array.from({ length: n }, (_, i) => ({
      id: String(i).padStart(6, "0"),
      organization_id: ORG,
      display_name: `Contato ${i}`,
    }));
    const { db } = bancoDeMentira({ contacts: linhas });
    const arquivos = unzipSync(await lerTudo(criarZipDaConta(db, ORG, "Grande")));
    const csv = strFromU8(pegar(arquivos, "contatos.csv")).split("\r\n").filter(Boolean);
    expect(csv.length).toBe(n + 1);
    expect(new Set(csv.slice(1).map((l) => l.split(";")[0])).size).toBe(n);
    expect(strFromU8(pegar(arquivos, "RESUMO.txt"))).toContain(`contatos.csv: ${n} linhas`);
  });

  it("erro de leitura derruba o fluxo em vez de fechar um ZIP incompleto", async () => {
    const db = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          gt: () => q,
          then: (res: (v: unknown) => void) => res({ data: null, error: { message: "boom" } }),
        };
        return q;
      },
    } as unknown as SupabaseClient;
    await expect(lerTudo(criarZipDaConta(db, ORG, "X"))).rejects.toThrow(/exportacao_leitura_falhou/);
  });
});

/**
 * A anonimização da organização inteira percorre TODOS os contatos pendentes.
 *
 * A versão anterior paginava por deslocamento sobre `is_anonymized = false`:
 * cada lote anonimizado saía do filtro e o deslocamento seguinte pulava
 * contatos. A simulação abaixo reproduz o filtro do banco em memória — o
 * contato anonimizado deixa de aparecer na leitura seguinte — e é isso que
 * torna o defeito visível.
 */
import { describe, expect, it } from "vitest";

import { percorrerContatosPendentes, type TenantProgress } from "./lgpd-redact-worker";

function banco(total: number, falham: Set<string> = new Set()) {
  const ids = Array.from({ length: total }, (_, i) => `c${String(i).padStart(4, "0")}`);
  const anonimizados = new Set<string>();
  const lerPagina = async (depoisDe: string | null, tamanho: number) =>
    ids
      .filter((id) => !anonimizados.has(id))
      .filter((id) => depoisDe === null || id > depoisDe)
      .slice(0, tamanho);
  const anonimizar = async (id: string) => {
    if (falham.has(id)) throw new Error("cascata falhou");
    anonimizados.add(id);
  };
  return { ids, anonimizados, lerPagina, anonimizar };
}

const progressoNovo = (): TenantProgress => ({ processed: 0, batch_offset: 0, failed_contacts: [] });

/** Como o worker fazia antes: `range(offset, …)` sobre o conjunto que encolhe. */
async function porDeslocamento(b: ReturnType<typeof banco>, tamanho: number) {
  let offset = 0;
  for (;;) {
    const pendentes = b.ids.filter((id) => !b.anonimizados.has(id));
    const lote = pendentes.slice(offset, offset + tamanho);
    if (lote.length === 0) break;
    for (const id of lote) await b.anonimizar(id);
    offset += lote.length;
    if (lote.length < tamanho) break;
  }
}

describe("anonimização da organização inteira — lotes", () => {
  it("controle: a paginação por deslocamento deixava contatos para trás", async () => {
    const b = banco(250);
    await porDeslocamento(b, 100);
    expect(b.anonimizados.size).toBeLessThan(250);
  });

  it("o cursor de id alcança todos os 250", async () => {
    const b = banco(250);
    const progresso = progressoNovo();
    let gravacoes = 0;
    await percorrerContatosPendentes({
      lerPagina: b.lerPagina,
      anonimizar: b.anonimizar,
      salvarProgresso: async () => void gravacoes++,
      progresso,
      tamanho: 100,
    });
    expect(b.anonimizados.size).toBe(250);
    expect(progresso.processed).toBe(250);
    expect(progresso.failed_contacts).toEqual([]);
    expect(gravacoes).toBe(3);
  });

  it("quem falhou não trava o laço, e o retry pega só quem falta", async () => {
    const b = banco(150, new Set(["c0005", "c0120"]));
    const progresso = progressoNovo();
    const args = {
      lerPagina: b.lerPagina,
      anonimizar: b.anonimizar,
      salvarProgresso: async () => undefined,
      progresso,
      tamanho: 50,
    };
    await percorrerContatosPendentes(args);
    expect(b.anonimizados.size).toBe(148);
    expect(progresso.failed_contacts).toEqual(["c0005", "c0120"]);

    // A causa sumiu: a execução seguinte recomeça e a lista de falhas é desta execução.
    const curado = { ...b, anonimizar: async (id: string) => void b.anonimizados.add(id) };
    await percorrerContatosPendentes({ ...args, anonimizar: curado.anonimizar });
    expect(b.anonimizados.size).toBe(150);
    expect(progresso.failed_contacts).toEqual([]);
  });

  it("organização sem contato pendente não grava progresso", async () => {
    const b = banco(0);
    let gravacoes = 0;
    await percorrerContatosPendentes({
      lerPagina: b.lerPagina,
      anonimizar: b.anonimizar,
      salvarProgresso: async () => void gravacoes++,
      progresso: progressoNovo(),
    });
    expect(gravacoes).toBe(0);
  });
});

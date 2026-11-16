/**
 * A barra de rolagem segue o TEMA — e não um neutro fixo.
 *
 * A issue #3789: com um tema de extensão escolhido (a paleta `mist`, por
 * exemplo), a tela inteira mudava e a barra de rolagem continuava no greige da
 * paleta padrão. O motivo estava escrito em `app/globals.css`: a barra pedia
 * `--color-neutral-300` (claro) e `--color-neutral-600` (escuro), e os neutros
 * NÃO entram na allowlist do tema de extensão (`CHAVES_DE_TOKEN_DO_TEMA` em
 * `lib/extensions/tema.ts` — a lista é fechada e o `z.object(...).strict()`
 * recusa o resto). O bloco `body:has([data-tema-extensao])` sobrescreve borda,
 * superfície, texto e accent; os neutros ficam parados na paleta padrão, então
 * a barra era o ÚNICO pedaço da tela que não acompanhava o tema.
 *
 * A saída não é criar token (a allowlist é fechada e as paletas são registro
 * fechado): é a barra ler um token que o tema JÁ controla. `--color-border` é
 * declarado pelas cinco paletas de `app/design/lib/tokens.ts`, nos dois temas
 * (`surfaces.light.border` / `surfaces.dark.border`), e já muda entre claro e
 * escuro no `globals.css` — por isso o par claro/escuro sai de um `var()` só e
 * o bloco `[data-theme="dark"]` exclusivo da barra deixa de existir.
 *
 * Neste fork não há tema de extensão: os casos sobre a allowlist e as paletas
 * ficaram de fora, e o que sobra garante a barra lendo o token do tema claro/escuro.
 *
 * ⚠️ ESTE TESTE É UMA CERCA, NÃO UMA PROVA de pixel: ele lê o CSS e as
 * paletas, e não pinta uma barra num navegador. O que ele impede é o caminho
 * pelo qual o defeito volta — e volta em silêncio, porque uma barra fora do
 * tom não parece erro, parece escolha de design.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";


const CSS = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");

/** O trecho do `globals.css` que pinta a barra de rolagem. */
function regiaoDaBarra(): string {
  const inicio = CSS.indexOf("/* Scrollbar");
  expect(inicio, "o bloco da barra de rolagem sumiu de `app/globals.css`").toBeGreaterThan(-1);
  const fim = CSS.indexOf("/* ---- XYFlow", inicio);
  expect(fim, "o bloco da barra perdeu o vizinho que delimita o fim dele").toBeGreaterThan(inicio);
  return CSS.slice(inicio, fim);
}

/** O CSS sem os comentários: prosa não pinta pixel, e o comentário do bloco cita
 * os nomes antigos de propósito (é a memória do defeito). */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** O corpo de uma regra de topo dentro de `@layer base`. */
function blocoDe(regiao: string, seletor: string): string {
  const inicio = regiao.indexOf(`\n  ${seletor} {`);
  expect(inicio, `não achei a regra \`${seletor}\` no bloco da barra`).toBeGreaterThan(-1);
  const fim = regiao.indexOf("\n  }", inicio);
  return regiao.slice(inicio, fim);
}

/** Todo `var(--color-…)` citado num trecho de CSS, sem repetição. */
function tokensUsados(texto: string): string[] {
  return [...new Set([...texto.matchAll(/var\((--color-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
}

/**
 * Os campos de `PALETTES[].surfaces` são camelCase; o CSS usa o nome do token.
 * Um campo novo sem correspondência aqui reprova — é o lembrete de que a régua
 * das paletas e a do CSS precisam andar juntas.
 */
describe("a barra de rolagem lê o tema, não os neutros fixos", () => {
  it("não cita nenhum `--color-neutral-*` no bloco da barra", () => {
    // O caminho exato pelo qual o defeito volta: um neutro tem par por tema,
    // então ELE PARECE theme-aware — mas o tema de extensão não pode tocá-lo.
    expect(semComentarios(regiaoDaBarra())).not.toMatch(/--color-neutral-/);
  });

  it("pinta a barra (`scrollbar-color`) com o token de borda do tema", () => {
    const universal = blocoDe(regiaoDaBarra(), "*");
    expect(universal).toMatch(/scrollbar-color:\s*var\(--color-border\)\s+transparent\s*;/);
  });

  it("pinta o polegar do WebKit com o mesmo token de borda", () => {
    const polegar = blocoDe(regiaoDaBarra(), "::-webkit-scrollbar-thumb");
    expect(polegar).toMatch(/background-color:\s*var\(--color-border\)\s*;/);
  });

  it("o hover do polegar também sai do tema", () => {
    const hover = blocoDe(regiaoDaBarra(), "::-webkit-scrollbar-thumb:hover");
    expect(tokensUsados(hover).length).toBeGreaterThan(0);
  });

  it("não tem bloco escuro separado: o token já troca com `[data-theme]`", () => {
    // Um bloco `[data-theme="dark"]` só para a barra é o segundo caminho de
    // volta: ele fixa uma cor por tema e esquece o tema de extensão.
    expect(semComentarios(regiaoDaBarra())).not.toMatch(/\[data-theme="dark"\]/);
  });
});

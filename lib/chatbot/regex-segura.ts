/**
 * REGRA PRÓPRIA ("expressão regular") NO "PEDIR PARA DIGITAR".
 *
 * Quem escreve a regra é o cliente, e ela roda no worker com a mensagem do
 * contato. Uma regra mal escrita — `(a+)+$`, `(a|aa)*b` — pode levar o motor de
 * expressões do JavaScript a um tempo exponencial ("ReDoS") e travar o
 * worker inteiro, de todas as empresas da instalação. O JavaScript não tem
 * como interromper um `test` em andamento, então a defesa é recusar ANTES:
 *
 *   1. a regra tem no máximo 200 caracteres e compila;
 *   2. sem referência a grupo (`\1`) nem lookbehind — os dois fogem da análise;
 *   3. nenhum grupo que se repete (`(...)+`, `(...)*`, `(...){2,}`) pode ter,
 *      dentro dele, outra repetição ou um "ou" (`|`) — é daí que nasce o tempo
 *      exponencial;
 *   4. no máximo 3 repetições sem limite (`*`, `+`, `{n,}`) na regra inteira;
 *   5. e a regra é testada só nos 100 primeiros caracteres da mensagem.
 *
 * Com (3) não sobra crescimento exponencial; com (4) e (5) o pior polinomial
 * fica em ~100⁴ passos (medido: menos de 0,1 s), e as regras comuns rodam em
 * microssegundos. Formatos prontos (CPF, e-mail…)
 * cobrem o caso comum; a regra própria é para o resto.
 */

export const REGEX_MAX = 200;
export const TEXTO_TESTADO_MAX = 100;
const REPETICOES_LIVRES_MAX = 3;

/** Remove escapes e classes `[...]`, que não contam como estrutura. */
function esqueleto(padrao: string): string {
  let s = "";
  let i = 0;
  while (i < padrao.length) {
    const c = padrao[i]!;
    if (c === "\\") {
      s += "x";
      i += 2;
      continue;
    }
    if (c === "[") {
      let j = i + 1;
      if (padrao[j] === "^") j++;
      if (padrao[j] === "]") j++;
      while (j < padrao.length && padrao[j] !== "]") j += padrao[j] === "\\" ? 2 : 1;
      s += "x";
      i = j + 1;
      continue;
    }
    s += c;
    i++;
  }
  return s;
}

/** Por que a regra não pode ser usada, ou `null` quando pode. Mensagem para a tela. */
export function problemaDaRegex(padrao: string): string | null {
  const p = padrao.trim();
  if (!p) return "Escreva a regra.";
  if (p.length > REGEX_MAX) return `A regra pode ter no máximo ${REGEX_MAX} caracteres.`;
  try {
    new RegExp(p, "iu");
  } catch {
    return "A regra não é uma expressão regular válida.";
  }
  if (/\\[1-9]|\\k</.test(p)) return "A regra não pode repetir um grupo já capturado (\\1).";
  if (/\(\?<[=!]/.test(p)) return "A regra não pode olhar para trás ((?<= ou (?<!).";

  const s = esqueleto(p);
  // (3) grupo repetido com repetição ou "ou" dentro.
  const pilha: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") pilha.push(i);
    else if (c === ")") {
      const ini = pilha.pop() ?? 0;
      // `+`, `*` e `{n}`/`{n,}`/`{n,m}` repetem; `?` não (é 0 ou 1 vez).
      if (/^(?:[*+]|\{\d+(?:,\d*)?\})/.test(s.slice(i + 1))) {
        const dentro = s.slice(ini + 1, i).replace(/^\?(?::|=|!)/, "");
        // Repetição EXATA dentro (`\d{2}`) não faz o motor voltar atrás; as
        // outras (`*`, `+`, `?`, `{n,}`, `{n,m}`) e o "ou" fazem.
        if (/[*+?|]|\{\d+,/.test(dentro))
          return 'A regra repete um grupo que já tem repetição ou "|" dentro, e isso pode travar o atendimento. Simplifique o grupo.';
      }
    }
  }
  // (4) repetições sem limite.
  const livres = (s.match(/[*+]|\{\d+,\}/g) ?? []).length;
  if (livres > REPETICOES_LIVRES_MAX)
    return `A regra pode ter no máximo ${REPETICOES_LIVRES_MAX} repetições sem limite (* ou +).`;
  return null;
}

/**
 * A mensagem casa com a regra? Regra recusada por `problemaDaRegex` nunca casa
 * (o editor já não deixa salvar; isto cobre fluxo antigo ou importado).
 */
export function casaRegex(padrao: string, texto: string): boolean {
  if (problemaDaRegex(padrao)) return false;
  return new RegExp(padrao.trim(), "iu").test(texto.trim().slice(0, TEXTO_TESTADO_MAX));
}

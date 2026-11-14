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
 *   4. no máximo 3 repetições de tamanho livre (`*`, `+`, `{n,}`, `{n,m}` com
 *      folga) na regra inteira, e um orçamento conjunto com as opcionais (`?`);
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
/**
 * Orçamento conjunto: cada repetição larga custa 2, cada opcional (`?`,
 * `{n,n+1}`) custa 1. MEDIDO no Node 22, em 100 letras iguais: 3 largas + 2
 * opcionais ≈ 0,2 s (o pior caso que cabe); 3 largas + 6 opcionais = 4 s; 20
 * opcionais sozinhos = 2 s e cada um a mais dobra.
 */
const CUSTO_MAX = 8;

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
  // (4) repetições de tamanho VARIÁVEL, todas — não só `*` e `+`.
  //
  // A primeira versão contava só `*`, `+` e `{n,}`. A auditoria de 14/11/2026
  // mostrou o furo: `a?` escrito 40 vezes passa sem grupo nenhum e tem 2^40
  // caminhos; `a{0,99}` é um `*` com outro nome nos 100 caracteres testados.
  // Agora toda repetição que pode casar um número variável de vezes entra na
  // conta: as largas (`*`, `+`, `{n,}`, `{n,m}` com folga > 1) no teto de
  // sempre, e as estreitas (`?`, `{n,n+1}`) num orçamento conjunto com elas.
  const semPrefixoDeGrupo = s.replace(/\(\?(?::|=|!|<[A-Za-z_][A-Za-z0-9_]*>)/g, "(");
  let livres = 0;
  let opcionais = 0;
  for (const q of semPrefixoDeGrupo.match(/[*+?]|\{\d+(?:,\d*)?\}/g) ?? []) {
    if (q === "*" || q === "+") livres++;
    else if (q === "?") opcionais++;
    else {
      const [, de, virgula, ate] = /^\{(\d+)(,?)(\d*)\}$/.exec(q) ?? [];
      if (!virgula) continue; // `{n}` exato: não varia
      if (ate === "") livres++;
      else {
        const folga = Number(ate) - Number(de);
        if (folga > 1) livres++;
        else if (folga === 1) opcionais++;
      }
    }
  }
  if (livres > REPETICOES_LIVRES_MAX)
    return `A regra pode ter no máximo ${REPETICOES_LIVRES_MAX} repetições de tamanho livre (*, + ou {n,m}).`;
  if (2 * livres + opcionais > CUSTO_MAX)
    return "A regra tem partes opcionais (?) e repetições demais juntas, e isso pode travar o atendimento. Simplifique a regra.";
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

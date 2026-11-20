/**
 * O BLOCO CONDICIONAL `{{#campo}}...{{/campo}}` — a linha que some quando o
 * campo está vazio (trazido do produto original, #4339/#4497).
 *
 * O que está entre `{{#campo}}` e `{{/campo}}` sai quando o campo TEM valor.
 * Sem valor, o bloco é apagado; se o bloco era o conteúdo inteiro da linha, a
 * linha some junto (e o `\n` dela), para o cliente não receber um rótulo
 * sozinho, como `🔢 Apólice:` sem nada depois. Bloco no meio de uma linha com
 * texto em volta só perde o miolo.
 *
 *   `{{#seguro_apolice}}🔢 Apólice: {{seguro_apolice}}{{/seguro_apolice}}`
 *
 * Quem decide "tem valor" é quem chama (`temValor`), com a MESMA leitura da
 * variável que o renderizador usa. As telas de rascunho (Inbox) passam
 * `manterSemValor`: lá a variável sem valor continua visível como token, e
 * esconder a linha esconderia do atendente o que ele precisa preencher.
 *
 * Bloco sem fechamento é texto solto — não se apaga conteúdo de quem errou a
 * sintaxe. Texto sem `{{#` sai exatamente como antes.
 */

const ABERTURA_DE_BLOCO = /\{\{#\s*([\w.]+)\s*\}\}/;

/** Marca do bloco apagado: NUL não é digitável no editor, então não colide com nada. */
const BLOCO_REMOVIDO = "\u0000";

export interface OpcoesDoBloco {
  /** O campo produziu texto? Mesma leitura que o renderizador usa. */
  temValor: (campo: string) => boolean;
  /** Rascunho (Inbox): sem valor, o bloco FICA (só as marcas saem). */
  manterSemValor?: boolean;
}

export function aplicarBlocosCondicionais(texto: string, opcoes: OpcoesDoBloco): string {
  if (!texto.includes("{{#")) return texto;
  let saida = texto;
  // Um laço por bloco: o primeiro que aparece é o mais externo, e o miolo dele
  // (que pode trazer outros blocos) volta para a próxima volta.
  for (let voltas = 0; voltas < 50; voltas += 1) {
    const abre = ABERTURA_DE_BLOCO.exec(saida);
    if (!abre) break;
    const nome = abre[1] ?? "";
    if (nome === "") break;
    const depoisDaAbertura = abre.index + abre[0].length;
    const nomeEscapado = nome.replace(/\./g, "\\.");
    const fecha = new RegExp(String.raw`\{\{\/\s*${nomeEscapado}\s*\}\}`).exec(
      saida.slice(depoisDaAbertura),
    );
    if (!fecha) break;
    const miolo = saida.slice(depoisDaAbertura, depoisDaAbertura + fecha.index);
    const depoisDoFechamento = depoisDaAbertura + fecha.index + fecha[0].length;
    const fica = opcoes.manterSemValor === true || opcoes.temValor(nome);
    saida = saida.slice(0, abre.index) + (fica ? miolo : BLOCO_REMOVIDO) + saida.slice(depoisDoFechamento);
  }
  if (!saida.includes(BLOCO_REMOVIDO)) return saida;
  const mantidas: string[] = [];
  for (const linha of saida.split(/\r?\n/)) {
    if (linha.includes(BLOCO_REMOVIDO) && linha.replaceAll(BLOCO_REMOVIDO, "").trim() === "") continue;
    mantidas.push(linha.replaceAll(BLOCO_REMOVIDO, ""));
  }
  return mantidas.join("\n");
}

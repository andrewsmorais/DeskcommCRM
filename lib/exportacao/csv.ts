/**
 * Planilha CSV para a exportação da conta — módulo PURO.
 *
 * Separador `;` e BOM no começo do arquivo: é o que o Excel em português abre
 * direto, com acento certo e colunas separadas. Com vírgula ele joga tudo numa
 * coluna só, e sem BOM ele estraga o acento.
 *
 * ─── Fórmula em célula ──────────────────────────────────────────────────────
 *
 * Quem escreve a mensagem é o cliente final de quem exporta. Uma mensagem que
 * começa com `=` vira FÓRMULA quando a planilha é aberta, e o arquivo sai do
 * nosso sistema para o computador do dono. Por isso a célula que começa como
 * fórmula ganha um `'` na frente. Telefone (`+55 12…`) e número negativo não
 * contam: `+`/`-` seguidos de dígito, espaço, ponto ou parêntese ficam como
 * estão, senão todo telefone do arquivo sairia deformado.
 */
export const SEPARADOR = ";";
export const BOM = "﻿";
const QUEBRA = "\r\n";

function pareceFormula(texto: string): boolean {
  const c = texto[0];
  if (c === "=" || c === "@" || c === "\t" || c === "\r") return true;
  if (c === "+" || c === "-") return !/^[+-][\d\s.()]/.test(texto);
  return false;
}

/** Uma célula já pronta para entrar na linha (escapada e entre aspas se preciso). */
export function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let texto: string;
  if (typeof valor === "boolean") texto = valor ? "sim" : "não";
  else if (valor instanceof Date) texto = valor.toISOString();
  else if (typeof valor === "object") texto = JSON.stringify(valor);
  else texto = String(valor);

  if (pareceFormula(texto)) texto = `'${texto}`;
  if (/[;"\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function linha(valores: readonly unknown[]): string {
  return valores.map(celula).join(SEPARADOR) + QUEBRA;
}

import { reVariavel } from "@/lib/empresa/variaveis";

/**
 * As partes PURAS do passo WebHook (sem rede, sem cripto): cabeçalhos que o
 * produto reserva e o corpo JSON montável. Ficam fora de `webhook.ts` para o
 * validador e o editor usarem sem levar `node:crypto` nem DNS junto.
 */
/** Cabeçalhos que o produto controla: o passo não os escreve. */
const CABECALHOS_RESERVADOS =
  /^(host|content-length|content-type|authorization|cookie|connection|transfer-encoding|accept|te|upgrade|proxy-.*|x-webhook-.*|x-forwarded-.*)$/i;

export function cabecalhoReservado(nome: string): boolean {
  return CABECALHOS_RESERVADOS.test(nome.trim());
}

/** `{{variavel}}` num texto livre (valor de cabeçalho), sem quebra de linha. */
export function textoComVariaveis(texto: string, dados: Record<string, string>): string {
  return texto
    .replace(reVariavel(), (_, nome: string) => dados[nome] ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

/**
 * O corpo personalizado: `{{variavel}}` vira o valor ESCAPADO para JSON (sem as
 * aspas — quem monta o fluxo as escreve: `{"nome": "{{nome}}"}`), então a
 * resposta do contato nunca muda a estrutura do JSON. `null` = o resultado não
 * é JSON válido, e a chamada não sai.
 */
export function corpoPersonalizado(modelo: string, dados: Record<string, string>): string | null {
  const texto = modelo.replace(reVariavel(), (_, nome: string) =>
    JSON.stringify(dados[nome] ?? "").slice(1, -1),
  );
  try {
    JSON.parse(texto);
    return texto;
  } catch {
    return null;
  }
}

/** O desenho do corpo é JSON válido? Variável conta como "0" (cabe com ou sem aspas). */
export function corpoPersonalizadoValido(modelo: string): boolean {
  if (!modelo.trim()) return false;
  try {
    JSON.parse(modelo.replace(reVariavel(), "0"));
    return true;
  } catch {
    return false;
  }
}

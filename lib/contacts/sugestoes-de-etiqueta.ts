import { normalizarTag, normalizarTags } from "@/lib/contacts/tag-normalizada";

/**
 * As etiquetas que a pessoa pode aceitar com um toque enquanto digita.
 *
 * O texto é a lista separada por vírgula (`vip, recompra, ne`). A última parte —
 * a que está sendo digitada — filtra o vocabulário da organização; as partes
 * anteriores dizem o que já foi escolhido e não volta a ser sugerido. A
 * comparação é pela forma NORMALIZADA (a mesma que a API grava), então "VIP" já
 * digitado impede a sugestão de "vip". Sem nada digitado ainda, sugere as mais
 * usadas (o vocabulário já vem ordenado pela rota), para quem não sabe o que existe.
 */
export function sugestoesDeEtiqueta(textoDigitado: string, vocabulario: readonly string[], limite = 8): string[] {
  const partes = textoDigitado.split(",");
  const emEdicao = normalizarTag(partes[partes.length - 1] ?? "");
  const jaEscolhidas = new Set(normalizarTags(partes.slice(0, -1)));
  const unicas = [...new Set(vocabulario.map(normalizarTag))].filter(Boolean);
  return unicas
    .filter((v) => !jaEscolhidas.has(v))
    .filter((v) => emEdicao === "" || (v.includes(emEdicao) && v !== emEdicao))
    .slice(0, limite);
}

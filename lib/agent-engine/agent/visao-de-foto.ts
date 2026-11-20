/**
 * O AGENTE QUE NÃO VÊ FOTOS (migration 0533, `image_vision_enabled = false`).
 *
 * Ver a foto custa: a descrição é uma chamada paga a um modelo com visão, e a
 * imagem anexada ao turno é cobrada de novo. Com a opção desligada, o turno
 * troca o corpo de toda mensagem de foto por um aviso honesto — chegou uma foto
 * que você não viu — e mantém a LEGENDA, que é texto que o cliente digitou
 * ("quanto custa isso?" numa foto continua sendo uma pergunta).
 *
 * O corpo de uma foto no contexto vem de `corpoDaMensagem`
 * (`edge/crm/get-lead-context.ts`): com descrição, a moldura
 * `[Mídia do cliente: …]\nLegenda do cliente: X\nConteúdo: Y`; sem descrição, a
 * própria legenda ou o marcador `[image]`. As duas formas são lidas aqui.
 */
export const AVISO_DE_FOTO_NAO_VISTA =
  '[O cliente enviou uma foto que você NÃO vê: este agente está configurado para não olhar fotos. ' +
  'Não descreva nem adivinhe o conteúdo; se precisar dele, peça que o cliente explique em texto.]';

const PREFIXO_DA_MOLDURA = '[Mídia do cliente:';
const PREFIXO_DA_LEGENDA = 'Legenda do cliente: ';

/** A legenda que o cliente digitou junto da foto, ou `null`. */
export function legendaDaFoto(corpo: string): string | null {
  const texto = corpo.trim();
  if (texto === '' || texto === '[image]') return null;
  if (!texto.startsWith(PREFIXO_DA_MOLDURA)) return texto;
  for (const linha of texto.split('\n')) {
    if (linha.startsWith(PREFIXO_DA_LEGENDA)) {
      const legenda = linha.slice(PREFIXO_DA_LEGENDA.length).trim();
      return legenda === '' ? null : legenda;
    }
  }
  return null;
}

/** O corpo que o agente sem visão recebe no lugar do de uma foto. */
export function corpoSemVisaoDeFoto(corpo: string): string {
  const legenda = legendaDaFoto(corpo);
  return legenda === null ? AVISO_DE_FOTO_NAO_VISTA : `${AVISO_DE_FOTO_NAO_VISTA}\nLegenda do cliente: ${legenda}`;
}

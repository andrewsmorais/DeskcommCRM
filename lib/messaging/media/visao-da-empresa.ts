/**
 * A empresa tem agente publicado e NENHUM deles quer ver fotos (migration 0533)?
 * Então a descrição da foto não tem leitor no atendimento automático e não é
 * feita (`workers/media-derive-worker.ts`). Sem agente publicado a resposta é
 * `false`: a descrição pode ter outro leitor, e na dúvida a foto é lida. Coluna
 * ausente (`undefined`) vale `true`, o padrão do banco.
 *
 * Mora fora de `derive.ts` de propósito: aquele módulo é dublado inteiro nos
 * testes do worker, e esta regra precisa valer neles também.
 */
export function fotoSemLeitorNoAtendimento(
  versoesPublicadas: ReadonlyArray<{ image_vision_enabled?: boolean | null }>,
): boolean {
  if (versoesPublicadas.length === 0) return false;
  return versoesPublicadas.every((v) => v.image_vision_enabled === false);
}

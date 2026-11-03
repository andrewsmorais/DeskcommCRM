/**
 * "Organizar blocos automaticamente" do editor de chatbot — PURO, sem React.
 *
 * Arruma o desenho em camadas de cima para baixo, na ordem em que o fluxo anda:
 * cada passo fica numa linha abaixo do passo mais distante que leva até ele
 * (caminho mais longo a partir de um início), e os passos de uma mesma linha
 * ficam na ordem dos passos de cima que os chamam, para as linhas cruzarem
 * menos. Ligação que VOLTA (o "voltar ao menu", um laço) não empurra ninguém
 * para baixo — senão um laço jogaria o fluxo para o infinito.
 *
 * Bloco de notas e passo solto (sem ligação nenhuma) vão para uma coluna à
 * direita, para não ficarem no meio do caminho.
 */
export type NoParaOrganizar = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  /** Tamanho medido na tela; ausente = estimado. */
  largura?: number;
  altura?: number;
};
export type LigacaoParaOrganizar = { source: string; target: string };

const LARGURA_PADRAO = 260;
const ALTURA_PADRAO = 140;
const ESPACO_X = 70;
const ESPACO_Y = 90;
const INICIOS = new Set(["inicio_canal", "inicio_automacao", "inicio_manual"]);

export function organizarBlocos(
  nodes: NoParaOrganizar[],
  edges: LigacaoParaOrganizar[],
): Map<string, { x: number; y: number }> {
  const ids = new Set(nodes.map((n) => n.id));
  const validas = edges.filter(
    (e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target,
  );
  const saidas = new Map<string, string[]>();
  const entradas = new Map<string, string[]>();
  for (const n of nodes) {
    saidas.set(n.id, []);
    entradas.set(n.id, []);
  }
  for (const e of validas) {
    saidas.get(e.source)!.push(e.target);
    entradas.get(e.target)!.push(e.source);
  }

  const soltos = nodes.filter(
    (n) =>
      n.type === "bloco_de_notas" ||
      (saidas.get(n.id)!.length === 0 &&
        entradas.get(n.id)!.length === 0 &&
        !INICIOS.has(n.type ?? "")),
  );
  const soltoIds = new Set(soltos.map((n) => n.id));
  const doFluxo = nodes.filter((n) => !soltoIds.has(n.id));

  // Raízes: os inícios; sem início, quem não tem entrada; sem nenhum, o primeiro.
  let raizes = doFluxo.filter((n) => INICIOS.has(n.type ?? ""));
  if (raizes.length === 0) raizes = doFluxo.filter((n) => entradas.get(n.id)!.length === 0);
  if (raizes.length === 0 && doFluxo[0]) raizes = [doFluxo[0]];

  // Ligações que voltam (laço): achadas por busca em profundidade a partir das raízes.
  const voltas = new Set<string>();
  const estado = new Map<string, 1 | 2>();
  const visitar = (id: string) => {
    estado.set(id, 1);
    for (const alvo of saidas.get(id) ?? []) {
      if (soltoIds.has(alvo)) continue;
      const s = estado.get(alvo);
      if (s === 1) voltas.add(`${id}>${alvo}`);
      else if (s === undefined) visitar(alvo);
    }
    estado.set(id, 2);
  };
  for (const r of raizes) if (!estado.has(r.id)) visitar(r.id);
  // Passos que nenhuma raiz alcança também entram (desenho pela metade).
  for (const n of doFluxo) if (!estado.has(n.id)) visitar(n.id);

  // Camada = caminho mais longo desde uma raiz, sem contar as voltas.
  const camada = new Map<string, number>();
  const ordem: string[] = [];
  const grau = new Map<string, number>();
  for (const n of doFluxo) {
    grau.set(
      n.id,
      (entradas.get(n.id) ?? []).filter((de) => !soltoIds.has(de) && !voltas.has(`${de}>${n.id}`))
        .length,
    );
  }
  const fila = doFluxo.filter((n) => grau.get(n.id) === 0).map((n) => n.id);
  for (const id of fila) camada.set(id, 0);
  while (fila.length > 0) {
    const id = fila.shift()!;
    ordem.push(id);
    for (const alvo of saidas.get(id) ?? []) {
      if (soltoIds.has(alvo) || voltas.has(`${id}>${alvo}`)) continue;
      camada.set(alvo, Math.max(camada.get(alvo) ?? 0, (camada.get(id) ?? 0) + 1));
      grau.set(alvo, (grau.get(alvo) ?? 1) - 1);
      if (grau.get(alvo) === 0) fila.push(alvo);
    }
  }
  for (const n of doFluxo) if (!camada.has(n.id)) camada.set(n.id, 0);

  const porId = new Map(nodes.map((n) => [n.id, n]));
  const largura = (id: string) => porId.get(id)?.largura ?? LARGURA_PADRAO;
  const altura = (id: string) => porId.get(id)?.altura ?? ALTURA_PADRAO;

  const linhas: string[][] = [];
  for (const id of doFluxo.map((n) => n.id)) {
    const c = camada.get(id)!;
    (linhas[c] ??= []).push(id);
  }

  const posicao = new Map<string, { x: number; y: number }>();
  const centroX = new Map<string, number>();
  let y = 0;
  for (const linha of linhas) {
    if (!linha) continue;
    // Ordem na linha: pela média do centro dos passos de cima que chamam este.
    const peso = (id: string) => {
      const pais = (entradas.get(id) ?? []).filter((p) => centroX.has(p));
      if (pais.length === 0) return Number.POSITIVE_INFINITY;
      return pais.reduce((t, p) => t + centroX.get(p)!, 0) / pais.length;
    };
    const indiceOriginal = new Map(doFluxo.map((n, i) => [n.id, i]));
    const ordenada = [...linha].sort(
      (a, b) => peso(a) - peso(b) || indiceOriginal.get(a)! - indiceOriginal.get(b)!,
    );
    const total = ordenada.reduce((t, id) => t + largura(id), 0) + ESPACO_X * (ordenada.length - 1);
    let x = -total / 2;
    for (const id of ordenada) {
      posicao.set(id, { x: Math.round(x), y: Math.round(y) });
      centroX.set(id, x + largura(id) / 2);
      x += largura(id) + ESPACO_X;
    }
    y += Math.max(...ordenada.map(altura)) + ESPACO_Y;
  }

  // Coluna à direita para notas e passos soltos.
  const direita =
    posicao.size > 0
      ? Math.max(...[...posicao].map(([id, p]) => p.x + largura(id))) + ESPACO_X * 2
      : 0;
  let ySolto = 0;
  for (const n of soltos) {
    posicao.set(n.id, { x: Math.round(direita), y: Math.round(ySolto) });
    ySolto += altura(n.id) + ESPACO_Y / 2;
  }
  return posicao;
}

/**
 * Copiar e colar passos no editor de chatbot (Ctrl+C / Ctrl+V). PURO.
 *
 * Copia os passos marcados e as ligações ENTRE eles (a que sai para um passo
 * que ficou de fora não vai). Colar dá id novo a tudo, religa pelas ids novas
 * e põe o grupo onde a tela pedir — no mesmo fluxo ou em outro.
 *
 * O segredo e a autorização do WebHook NÃO viajam: estão cifrados para a
 * organização de origem, e colar num fluxo de outra empresa (quem atende
 * várias, no mesmo navegador) daria a ela o uso de um segredo que não é dela.
 * O passo colado volta sem eles e a validação de "Ligar" não se queixa — o
 * WebHook só chama sem assinatura —, por isso a tela avisa ao colar.
 */
import { ehTipoDePasso } from "./passos";

export type PassoCopiado = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};
export type LigacaoCopiada = { source: string; target: string; sourceHandle: string | null };
export type Copiados = { versao: 1; passos: PassoCopiado[]; ligacoes: LigacaoCopiada[] };

const SEGREDOS = ["segredo_enc", "autorizacao_enc"] as const;

export function copiarPassos(
  nodes: PassoCopiado[],
  edges: { source: string; target: string; sourceHandle?: string | null }[],
  ids: string[],
): Copiados | null {
  const marcados = new Set(ids);
  const passos = nodes
    .filter((n) => marcados.has(n.id) && ehTipoDePasso(n.type))
    .map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data: structuredClone(n.data ?? {}),
    }));
  if (passos.length === 0) return null;
  const ligacoes = edges
    .filter((e) => marcados.has(e.source) && marcados.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null }));
  return { versao: 1, passos, ligacoes };
}

/** Lê o que foi copiado (texto do armazenamento); lixo vira null. */
export function lerCopiados(texto: string | null): Copiados | null {
  if (!texto) return null;
  try {
    const v = JSON.parse(texto) as Copiados;
    if (v?.versao !== 1 || !Array.isArray(v.passos) || !Array.isArray(v.ligacoes)) return null;
    const passos = v.passos.filter(
      (p) =>
        typeof p?.id === "string" &&
        ehTipoDePasso(p.type) &&
        Number.isFinite(p.position?.x) &&
        Number.isFinite(p.position?.y) &&
        typeof p.data === "object" &&
        p.data !== null,
    );
    if (passos.length === 0) return null;
    const ids = new Set(passos.map((p) => p.id));
    const ligacoes = v.ligacoes.filter((l) => ids.has(l?.source) && ids.has(l?.target));
    return { versao: 1, passos, ligacoes };
  } catch {
    return null;
  }
}

/**
 * Os passos prontos para entrar no quadro: ids novos, ligações religadas e o
 * canto de cima à esquerda do grupo em `onde`. `semSegredo` = algum WebHook
 * perdeu o segredo ou a autorização (a tela avisa).
 */
export function colarPassos(
  copiados: Copiados,
  novoId: () => string,
  onde: { x: number; y: number },
): {
  passos: PassoCopiado[];
  ligacoes: (LigacaoCopiada & { id: string })[];
  semSegredo: boolean;
} {
  const minX = Math.min(...copiados.passos.map((p) => p.position.x));
  const minY = Math.min(...copiados.passos.map((p) => p.position.y));
  const troca = new Map(copiados.passos.map((p) => [p.id, novoId()]));
  let semSegredo = false;
  const passos = copiados.passos.map((p) => {
    const data = structuredClone(p.data);
    for (const chave of SEGREDOS) {
      if (data[chave]) semSegredo = true;
      if (chave in data) data[chave] = null;
    }
    return {
      id: troca.get(p.id)!,
      type: p.type,
      position: { x: onde.x + (p.position.x - minX), y: onde.y + (p.position.y - minY) },
      data,
    };
  });
  const ligacoes = copiados.ligacoes.map((l) => {
    const source = troca.get(l.source)!;
    const target = troca.get(l.target)!;
    return {
      id: `${source}-${l.sourceHandle ?? "proximo"}-${target}`,
      source,
      target,
      sourceHandle: l.sourceHandle,
    };
  });
  return { passos, ligacoes, semSegredo };
}

/**
 * O formato de uma entrada do manual do assistente de ajuda.
 *
 * Uma entrada por tela do `NAV_CATALOG` (chave = `href`). O NOME, a descrição
 * curta, o grupo, o papel mínimo e o módulo da tela NÃO entram aqui: saem do
 * catálogo de navegação na hora de montar o prompt, para nunca divergirem do
 * menu. Aqui mora só o que o código não diz sozinho: como usar.
 *
 * `tests/unit/ajuda-manual-cobre-todas-as-telas.test.ts` reprova tela nova sem
 * entrada e entrada de tela que deixou de existir.
 */
export type EntradaDoManual = {
  /** Uma ou duas frases: para que serve, em linguagem de quem não é técnico. */
  oQueE: string;
  /** Passo a passo das tarefas mais comuns nesta tela, na ordem dos cliques. */
  comoUsar: string[];
  /** Limites reais, armadilhas e o que a tela NÃO faz. Opcional. */
  cuidados?: string[];
};

export type ManualDoGrupo = Record<string, EntradaDoManual>;

/** Um guia que atravessa telas (ex.: escrever o prompt do agente). */
export type Guia = {
  id: string;
  titulo: string;
  /** Texto corrido em markdown simples, em PT-BR. */
  conteudo: string;
};

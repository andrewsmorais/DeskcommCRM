/**
 * O CATÁLOGO DE VARIÁVEIS `{{...}}` DESTA INSTALAÇÃO — o que cada tela ENTENDE.
 *
 * A ideia veio do produto original (#3687), mas a lista é a DESTE fork: cada
 * entrada só diz "disponível em" onde o renderizador daqui de fato resolve o
 * nome. Oferecer no botão uma variável que o motor não troca seria mandar
 * `{{saudacao}}` literal para o cliente.
 *
 *   - automação: `lib/automation/template.ts` (`renderTemplate`)
 *   - resposta rápida (Inbox): `lib/inbox/template-vars.ts` (`interpolateTemplate`)
 *   - campanha: `lib/campanhas/renderizador.ts` (`renderizar`)
 */
export type FonteDeVariavel = "automacao" | "inbox" | "campanha";

export const GRUPOS_DE_VARIAVEL = ["contato", "negocio", "outros"] as const;
export type GrupoDeVariavel = (typeof GRUPOS_DE_VARIAVEL)[number];

export const ROTULO_DO_GRUPO: Readonly<Record<GrupoDeVariavel, string>> = {
  contato: "Contato",
  negocio: "Negócio",
  outros: "Outros",
};

export interface VariavelDoCatalogo {
  /** A chave literal, sem `{{` e `}}`. */
  chave: string;
  grupo: GrupoDeVariavel;
  descricao: string;
  disponivelEm: readonly FonteDeVariavel[];
}

export const VARIAVEIS_DO_CATALOGO: readonly VariavelDoCatalogo[] = [
  { chave: "nome", grupo: "contato", descricao: "Nome do contato, como está no cadastro", disponivelEm: ["automacao", "inbox", "campanha"] },
  { chave: "primeiro_nome", grupo: "contato", descricao: "Só a primeira palavra do nome", disponivelEm: ["automacao", "inbox", "campanha"] },
  { chave: "telefone", grupo: "contato", descricao: "Telefone do contato", disponivelEm: ["automacao"] },
  { chave: "email", grupo: "contato", descricao: "E-mail do contato", disponivelEm: ["automacao"] },
  { chave: "lead.title", grupo: "negocio", descricao: "Título do negócio", disponivelEm: ["automacao"] },
  { chave: "saudacao", grupo: "outros", descricao: "Bom dia / Boa tarde / Boa noite, na hora do envio", disponivelEm: ["campanha"] },
];

export function entradasDe(fonte: FonteDeVariavel): VariavelDoCatalogo[] {
  return VARIAVEIS_DO_CATALOGO.filter((v) => v.disponivelEm.includes(fonte));
}

/** A dica de como escrever um caminho que o catálogo não enumera, por tela. */
export const DICA_DA_FONTE: Readonly<Partial<Record<FonteDeVariavel, string>>> = {
  automacao: "Outro dado do negócio ou do contato: {{lead.nome_do_campo}} ou {{contact.nome_da_coluna}}.",
  inbox: "As variáveis da empresa entram como {{empresa.nome_da_variavel}} (Configurações › Variáveis da empresa).",
};

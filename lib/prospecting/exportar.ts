/**
 * A LISTA DA CAMPANHA DE VOLTA PARA QUEM OPERA (vindo do produto original, #4360).
 *
 * A prospecção sabia buscar empresas e não sabia devolvê-las: quem buscou 80
 * empresas e quis levar a lista para outro lugar (outra estratégia, outra
 * ferramenta, uma planilha para a equipe) não tinha botão de saída.
 *
 * Sai só quem AINDA PODE ser abordado: sem tentativa (`attempted_at` nulo), na
 * fila (`new`/`queued`) e com telefone. Quem já recebeu mensagem fica de fora de
 * propósito — o contato e o negócio já existem no CRM, e a mensagem já saiu.
 *
 * Formato: `;` de separador, BOM UTF-8 e CRLF — o que o Excel em português abre
 * em colunas, com o acento certo.
 *
 * Por que exportar e não "duplicar campanha": `prospecting_candidates` tem
 * `unique (organization_id, place_id)` e `prospecting_phone_once_org` — a mesma
 * empresa só pode estar em UMA campanha por organização. Copiar as linhas
 * gravaria zero linha, em silêncio.
 */

/** O mínimo de um candidato que a régua e o CSV leem (`prospecting_candidates`). */
// `type` e não `interface`: `pg` exige `Record<string, any>` no genérico do
// `query<>`, e só o alias ganha índice implícito.
export type CandidatoDaLista = {
  status?: string;
  attempted_at?: string | Date | null;
  /** Coluna `phone` da linha; `data.phone` é a mesma coisa no caminho da busca. */
  phone?: string | null;
  data: {
    name?: string | null;
    phone?: string | null;
    website?: string | null;
    category?: string | null;
    address?: string | null;
    emails?: readonly string[] | null;
    socials?: readonly string[] | null;
    whatsapp?: { existe: boolean } | null;
  };
}

/**
 * A régua ÚNICA de "ainda não abordada". A rota do CSV e o contador da tela
 * chamam esta função — duas cópias divergiriam no primeiro ajuste, e o botão
 * diria "12" enquanto o arquivo levasse 9.
 */
export function naoAbordada(c: CandidatoDaLista): boolean {
  // Tentativa registrada = a empresa foi (ou está sendo) abordada. `sending` e
  // `sent` já caem aqui pelo status; o `attempted_at` pega também quem voltou
  // para a fila depois de uma falha.
  if (c.attempted_at != null) return false;
  if (c.status !== "new" && c.status !== "queued") return false;
  // O canal já respondeu que este número não tem WhatsApp: abordar seria
  // escrever (e pagar) uma mensagem que ninguém recebe. (Nesta instalação a
  // busca ainda não confere o número, então o campo hoje sempre chega vazio.)
  if (c.data.whatsapp?.existe === false) return false;
  return Boolean(c.data.phone ?? c.phone);
}

export interface ResumoDaLista {
  total: number;
  nao_abordadas: number;
}

/** Quantas ainda podem ser abordadas, sobre a lista INTEIRA da campanha. */
export function resumoDaLista(candidatos: readonly CandidatoDaLista[]): ResumoDaLista {
  return {
    total: candidatos.length,
    nao_abordadas: candidatos.filter(naoAbordada).length,
  };
}

/**
 * As colunas do arquivo — as mesmas do modelo de importação do produto original,
 * para a lista poder voltar por lá no dia em que a importação chegar aqui.
 */
export const COLUNAS_DA_LISTA = [
  "empresa",
  "telefone",
  "site",
  "segmento",
  "endereco",
  "email",
  "redes",
] as const;

const SEPARADOR = ";";

/**
 * Telefone E.164 passa intacto pela neutralização de fórmula: o `'` na frente
 * de `+5511…` estragaria o número para quem reaproveitar a lista.
 */
const TELEFONE_FORMATADO = /^\+[\d\s().-]+$/;

function neutralizarFormula(trecho: string): string {
  if (!/^[=+\-@\t\r]/.test(trecho)) return trecho;
  if (TELEFONE_FORMATADO.test(trecho)) return trecho;
  return `'${trecho}`;
}

/**
 * RFC 4180 com `;` de separador (Excel em pt-BR) e célula que começa com
 * caractere de fórmula neutralizada — a mesma regra do export de contatos
 * (`lib/contacts/exportar.ts`). Quebra de linha no meio do texto sai entre
 * aspas, senão vira linha nova no leitor que não conhece aspas.
 */
function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = neutralizarFormula(String(valor).replace(/\s+/g, " ").trim());
  if (texto.includes(SEPARADOR) || texto.includes('"') || /[\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Os valores de uma linha, na ordem de `COLUNAS_DA_LISTA`. */
function valoresDaEmpresa(c: CandidatoDaLista): string[] {
  const emails = (c.data.emails ?? []).filter(Boolean).slice(0, 5).join(" ");
  const redes = (c.data.socials ?? []).filter(Boolean).slice(0, 15).join(" ");
  return [
    c.data.name ?? "",
    c.data.phone ?? c.phone ?? "",
    c.data.website ?? "",
    c.data.category ?? "",
    c.data.address ?? "",
    emails,
    redes,
  ];
}

/**
 * O arquivo inteiro. Começa com BOM porque é o que faz o Excel em português
 * abrir o acento certo.
 *
 * Lista vazia devolve só o cabeçalho: quem decide recusar um arquivo sem
 * empresa é a rota, com mensagem — um CSV de zero linha não explica nada.
 */
export function csvDaLista(candidatos: readonly CandidatoDaLista[]): string {
  const linhas = [
    COLUNAS_DA_LISTA.join(SEPARADOR),
    ...candidatos.map((c) => valoresDaEmpresa(c).map(celula).join(SEPARADOR)),
  ];
  return `\uFEFF${linhas.join("\r\n")}\r\n`;
}

/** `lista-<campanha>-AAAA-MM-DD.csv`, sem acento, espaço nem aspas no nome. */
export function nomeDoArquivoDaLista(nomeDaCampanha: string, agora: Date): string {
  const dia = agora.toISOString().slice(0, 10);
  const apelido = nomeDaCampanha
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `lista-${apelido || "prospeccao"}-${dia}.csv`;
}

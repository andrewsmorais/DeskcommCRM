/**
 * Leitor de vCard (.vcf) para a importação de contatos — o "Importar contatos
 * de arquivo .vcf" da Umbler Talk. É o arquivo que o celular exporta ("Exportar
 * contatos" no Android, "Compartilhar contato" no iPhone, Google Contatos).
 *
 * PURO e sem dependência: devolve as MESMAS linhas que a planilha CSV
 * (cabeçalho + dados), e a rota segue pelo caminho da planilha — validação,
 * duplicados, limite de linhas e resumo por linha são os mesmos. Duas portas
 * para um caminho só, senão o .vcf aceitaria o que o CSV recusa.
 *
 * Cobre vCard 2.1, 3.0 e 4.0:
 *   - linhas dobradas (continuação começa com espaço ou tab);
 *   - QUOTED-PRINTABLE com quebra suave "=" (o Android exporta 2.1 assim,
 *     com acento em `=C3=A7`);
 *   - prefixo de grupo ("item1.TEL"), parâmetros (TYPE=CELL) e escapes (\, \; \n).
 *
 * De cada cartão: o nome (FN; sem ele, o N montado), o primeiro telefone — o
 * celular, quando o cartão marca um —, o primeiro e-mail e o aniversário.
 * Foto, endereço e empresa ficam de fora: o contato do CRM não tem onde guardar.
 */

export const CABECALHO_DO_VCF = ["nome", "telefone", "email", "nascimento"] as const;

type Propriedade = { nome: string; params: string[]; valor: string };

/** Desfaz o "quoted-printable" (bytes =XX, interpretados como UTF-8). */
function decodificarQP(valor: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < valor.length; i++) {
    const c = valor[i]!;
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(valor.slice(i + 1, i + 3))) {
      bytes.push(parseInt(valor.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of new TextEncoder().encode(c)) bytes.push(b);
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function desescapar(v: string): string {
  return v.replace(/\\([nN,;:\\])/g, (_m, c: string) => (c === "n" || c === "N" ? " " : c));
}

/** Teto de uma linha lógica (um campo do cartão), em letras. */
const LINHA_LOGICA_MAX = 20_000;

/** As linhas lógicas do arquivo: dobras e quebras suaves de QP desfeitas. */
function linhasLogicas(texto: string): string[] {
  const fisicas = texto.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  // Tempo LINEAR: a linha lógica em montagem fica em PEDAÇOS e só é juntada uma
  // vez, e "é quoted-printable?" é decidido quando ela começa. A versão
  // anterior relia a linha inteira a cada linha física — um arquivo de 5 MB só
  // com continuações custava trilhões de passos e parava o servidor para todas
  // as empresas (auditoria de 14/11/2026). Linha lógica maior que o teto é
  // cortada: nenhum campo de contato legítimo chega perto.
  const saida: string[] = [];
  let pedacos: string[] | null = null;
  let tamanho = 0;
  let qp = false;
  let terminaEmIgual = false;
  const fechar = () => {
    if (pedacos) saida.push(pedacos.join(""));
    pedacos = null;
  };
  const somar = (parte: string) => {
    const cabe = LINHA_LOGICA_MAX - tamanho;
    const p = cabe <= 0 ? "" : parte.length > cabe ? parte.slice(0, cabe) : parte;
    pedacos!.push(p);
    tamanho += p.length;
    terminaEmIgual = parte.endsWith("=");
  };
  for (const l of fisicas) {
    if (pedacos && qp && terminaEmIgual) {
      // Quebra suave de quoted-printable: tira o "=" do fim e emenda.
      const ultimo = pedacos.length - 1;
      const anterior = pedacos[ultimo]!;
      if (anterior.endsWith("=")) {
        pedacos[ultimo] = anterior.slice(0, -1);
        tamanho -= 1;
      }
      somar(l);
    } else if (pedacos && /^[ \t]/.test(l)) {
      somar(l.slice(1));
    } else {
      fechar();
      pedacos = [];
      tamanho = 0;
      qp = /QUOTED-PRINTABLE/i.test(l.slice(0, l.indexOf(":") === -1 ? l.length : l.indexOf(":")));
      somar(l);
    }
  }
  fechar();
  return saida;
}

function lerPropriedade(linha: string): Propriedade | null {
  const doisPontos = linha.indexOf(":");
  if (doisPontos <= 0) return null;
  const partes = linha.slice(0, doisPontos).split(";");
  const nome = (partes[0] ?? "").replace(/^[^.]*\./, "").toUpperCase();
  const params = partes.slice(1).map((p) => p.toUpperCase());
  let valor = linha.slice(doisPontos + 1);
  if (params.some((p) => p.includes("QUOTED-PRINTABLE"))) valor = decodificarQP(valor);
  return { nome, params, valor };
}

function ehCelular(p: Propriedade): boolean {
  return p.params.some((x) => /\b(CELL|MOBILE)\b/.test(x));
}

/** "19900215", "1990-02-15" ou "--0215" (sem ano) → "1990-02-15" ou "". */
function dataDoAniversario(v: string): string {
  const t = v.trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/**
 * O arquivo inteiro como linhas de planilha: `[CABECALHO_DO_VCF, ...cartões]`.
 * Arquivo sem nenhum cartão devolve só o cabeçalho (a rota responde "vazio").
 */
export function vcfParaLinhas(texto: string): string[][] {
  const linhas: string[][] = [[...CABECALHO_DO_VCF]];
  let cartao: Propriedade[] | null = null;
  for (const l of linhasLogicas(texto)) {
    const p = lerPropriedade(l.trim());
    if (!p) continue;
    if (p.nome === "BEGIN" && p.valor.trim().toUpperCase() === "VCARD") {
      cartao = [];
      continue;
    }
    if (p.nome === "END" && p.valor.trim().toUpperCase() === "VCARD") {
      if (cartao) linhas.push(linhaDoCartao(cartao));
      cartao = null;
      continue;
    }
    cartao?.push(p);
  }
  return linhas;
}

function linhaDoCartao(props: Propriedade[]): string[] {
  const um = (nome: string) => props.find((p) => p.nome === nome);
  let nome = desescapar(um("FN")?.valor ?? "").trim();
  if (!nome) {
    // N = sobrenome;nome;nomes do meio;prefixo;sufixo
    const n = (um("N")?.valor ?? "").split(";").map((x) => desescapar(x).trim());
    nome = [n[3], n[1], n[2], n[0], n[4]].filter(Boolean).join(" ");
  }
  const telefones = props.filter((p) => p.nome === "TEL");
  const tel = (telefones.find(ehCelular) ?? telefones[0])?.valor ?? "";
  const telefone = tel.replace(/^tel:/i, "").trim();
  const email = (um("EMAIL")?.valor ?? "").replace(/^mailto:/i, "").trim();
  const nascimento = dataDoAniversario(um("BDAY")?.valor ?? "");
  return [nome, telefone, email, nascimento];
}

/** O arquivo parece um vCard? (pelo nome ou pelo conteúdo, nunca só pelo tipo). */
export function pareceVcf(nomeDoArquivo: string, tipo: string): boolean {
  const n = nomeDoArquivo.toLowerCase();
  return n.endsWith(".vcf") || n.endsWith(".vcard") || /^text\/(x-)?vcard$/i.test(tipo);
}

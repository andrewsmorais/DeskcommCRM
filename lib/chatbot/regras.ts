/**
 * Regras do chatbot — PURO, sem banco. Lido pelo motor (decidir a saída de
 * "Definir condição" / "Multi-condicional" e validar "Campo do contato"), pela
 * validação do fluxo (o que impede ligar) e pela tela (o rótulo das saídas).
 *
 * Toda comparação de texto ignora maiúsculas, acentos e espaços repetidos — é
 * o que quem monta o fluxo espera de "a etiqueta é VIP" ou "a resposta é sim".
 */
import type {
  CampoDoContato,
  ConfigDe,
  PerguntaDoFormulario,
  Regra,
  TipoDeResposta,
} from "./passos";

/** O que o motor sabe do contato neste turno (lido pelo executor antes de rodar). */
export type ContatoDoTurno = {
  tags: string[];
  nome: string | null;
  email: string | null;
  /** aaaa-mm-dd */
  aniversario: string | null;
  personalizados: Record<string, string>;
};

export function contatoVazio(): ContatoDoTurno {
  return { tags: [], nome: null, email: null, aniversario: null, personalizados: {} };
}

/** Minúsculas, sem acento, espaços colapsados — para comparar o que o contato digitou. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const NOME_DO_CAMPO: Record<string, string> = {
  nome: "Nome",
  email: "E-mail",
  aniversario: "Aniversário",
};

export function valorAtualDoCampo(contato: ContatoDoTurno, chave: string): string {
  switch (chave) {
    case "nome":
      return contato.nome ?? "";
    case "email":
      return contato.email ?? "";
    case "aniversario":
      return contato.aniversario ?? "";
    default:
      return contato.personalizados[chave] ?? "";
  }
}

const NEGA = new Set(["nao_tem", "diferente"]);

/** "4", "4,5", " 10 " → número; texto sem número → null. */
export function comoNumero(texto: string): number | null {
  const m = texto.trim().replace(",", ".").match(/^-?\d+(?:\.\d+)?$/);
  return m ? Number(m[0]) : null;
}

export function regraVale(
  r: Regra,
  ctx: { mensagem: string | null; dados: Record<string, string>; contato: ContatoDoTurno },
): boolean {
  const alvo = normalizar(r.valor);
  if (r.fonte === "etiqueta") {
    const tem = alvo !== "" && ctx.contato.tags.some((t) => normalizar(t) === alvo);
    return NEGA.has(r.operador) ? !tem : tem;
  }
  const bruto =
    r.fonte === "mensagem"
      ? (ctx.mensagem ?? "")
      : r.fonte === "variavel"
        ? (ctx.dados[r.chave] ?? "")
        : valorAtualDoCampo(ctx.contato, r.chave);
  const texto = normalizar(bruto);
  switch (r.operador) {
    case "maior_ou_igual":
    case "menor_ou_igual": {
      const a = comoNumero(bruto);
      const b = comoNumero(r.valor);
      if (a === null || b === null) return false;
      return r.operador === "maior_ou_igual" ? a >= b : a <= b;
    }
    case "preenchido":
      return texto !== "";
    case "vazio":
      return texto === "";
    case "igual":
      return texto === alvo;
    case "diferente":
      return texto !== alvo;
    case "contem":
    case "tem":
      return alvo !== "" && texto.includes(alvo);
    case "nao_tem":
      return alvo === "" || !texto.includes(alvo);
  }
}

/** Resumo curto da regra, para a saída no quadro e o nó. */
export function descreverRegra(r: Regra): string {
  const v = r.valor ? `"${r.valor}"` : "…";
  let s: string;
  if (r.fonte === "etiqueta") {
    s = NEGA.has(r.operador) ? `Sem a etiqueta ${v}` : `Etiqueta ${v}`;
  } else {
    const alvo =
      r.fonte === "mensagem"
        ? "Mensagem"
        : r.fonte === "variavel"
          ? `{{${r.chave || "…"}}}`
          : (NOME_DO_CAMPO[r.chave] ?? (r.chave || "Campo"));
    switch (r.operador) {
      case "preenchido":
        s = `${alvo} preenchido`;
        break;
      case "vazio":
        s = `${alvo} vazio`;
        break;
      case "igual":
        s = `${alvo} = ${v}`;
        break;
      case "diferente":
      case "nao_tem":
        s = `${alvo} ≠ ${v}`;
        break;
      case "contem":
      case "tem":
        s = `${alvo} contém ${v}`;
        break;
      case "maior_ou_igual":
        s = `${alvo} ≥ ${r.valor || "…"}`;
        break;
      case "menor_ou_igual":
        s = `${alvo} ≤ ${r.valor || "…"}`;
        break;
    }
  }
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

/** O que falta para a regra funcionar, em português de quem monta o fluxo (null = completa). */
export function problemaDaRegra(r: Regra): string | null {
  if (r.fonte === "etiqueta") return r.valor ? null : "escreva a etiqueta";
  if (r.fonte !== "mensagem" && !r.chave)
    return r.fonte === "variavel" ? "escolha a resposta guardada" : "escolha o campo do contato";
  if (r.operador !== "preenchido" && r.operador !== "vazio" && !r.valor)
    return "escreva o valor para comparar";
  if ((r.operador === "maior_ou_igual" || r.operador === "menor_ou_igual") && comoNumero(r.valor) === null)
    return "escreva um número para comparar";
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * O valor pronto para gravar no contato, ou null quando não serve — o motor
 * então segue pela saída "Valor inválido" (para o fluxo pedir de novo).
 *   - nome: 1 a 200 caracteres;
 *   - email: formato de e-mail, em minúsculas;
 *   - aniversario: dd/mm/aaaa (ou aaaa-mm-dd), data que existe, gravada aaaa-mm-dd;
 *   - personalizado: 1 a 500 caracteres.
 */
export function valorDoCampo(campo: CampoDoContato, bruto: string, hoje = new Date()): string | null {
  const v = bruto.replace(/\s+/g, " ").trim();
  if (!v) return null;
  switch (campo) {
    case "nome":
      return v.length <= 200 ? v : null;
    case "personalizado":
      return v.slice(0, 500);
    case "email": {
      const e = v.toLowerCase();
      return EMAIL.test(e) && e.length <= 254 ? e : null;
    }
    case "aniversario": {
      let d: number, m: number, a: number;
      const br = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (br) [d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])];
      else if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
      else return null;
      const data = new Date(Date.UTC(a, m - 1, d));
      const existe =
        data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
      if (!existe || a < 1900 || data.getTime() > hoje.getTime()) return null;
      return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
}

// ─── "Valor" ────────────────────────────────────────────────────────────────

type ConfigDoValor = ConfigDe<"valor">;

/** "25/12/2026" ou "2026-12-25" → milissegundos UTC da data; outra coisa → null. */
export function comoData(texto: string): number | null {
  const v = texto.trim();
  const br = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d: number, m: number, a: number;
  if (br) [d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])];
  else if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const t = Date.UTC(a, m - 1, d);
  const data = new Date(t);
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d
    ? t
    : null;
}

/** Os dois lados como número, ou os dois como data. Misturado ou texto → null. */
function compararOrdem(a: string, b: string): number | null {
  const na = comoNumero(a);
  const nb = comoNumero(b);
  if (na !== null && nb !== null) return na - nb;
  const da = comoData(a);
  const db = comoData(b);
  if (da !== null && db !== null) return da - db;
  return null;
}

/**
 * A comparação do passo "Valor". `alvo` é o valor do passo JÁ preenchido
 * ({{variavel}} trocada pelo motor). Texto compara sem maiúsculas e acentos;
 * maior/menor só vale entre dois números ou duas datas — "abc" > 5 é falso, e
 * não um palpite.
 */
export function valorVale(
  c: ConfigDoValor,
  ctx: {
    mensagem: string | null;
    dados: Record<string, string>;
    contato: ContatoDoTurno;
    alvo: string;
  },
): boolean {
  const bruto =
    c.fonte === "mensagem"
      ? (ctx.mensagem ?? "")
      : c.fonte === "variavel"
        ? (ctx.dados[c.chave] ?? "")
        : valorAtualDoCampo(ctx.contato, c.chave);
  const texto = normalizar(bruto);
  const alvo = normalizar(ctx.alvo);
  switch (c.operador) {
    case "preenchido":
      return texto !== "";
    case "vazio":
      return texto === "";
    case "igual": {
      const ordem = compararOrdem(bruto, ctx.alvo);
      return ordem !== null ? ordem === 0 : texto === alvo;
    }
    case "diferente": {
      const ordem = compararOrdem(bruto, ctx.alvo);
      return ordem !== null ? ordem !== 0 : texto !== alvo;
    }
    case "contem":
      return alvo !== "" && texto.includes(alvo);
    case "nao_contem":
      return alvo === "" || !texto.includes(alvo);
    case "comeca_com":
      return alvo !== "" && texto.startsWith(alvo);
    case "termina_com":
      return alvo !== "" && texto.endsWith(alvo);
    case "maior":
    case "maior_ou_igual":
    case "menor":
    case "menor_ou_igual": {
      const ordem = compararOrdem(bruto, ctx.alvo);
      if (ordem === null) return false;
      if (c.operador === "maior") return ordem > 0;
      if (c.operador === "maior_ou_igual") return ordem >= 0;
      if (c.operador === "menor") return ordem < 0;
      return ordem <= 0;
    }
  }
}

const SIMBOLO_DO_OPERADOR: Record<ConfigDoValor["operador"], string> = {
  igual: "=",
  diferente: "≠",
  contem: "contém",
  nao_contem: "não contém",
  comeca_com: "começa com",
  termina_com: "termina com",
  maior: ">",
  maior_ou_igual: "≥",
  menor: "<",
  menor_ou_igual: "≤",
  preenchido: "preenchido",
  vazio: "vazio",
};

/** Resumo curto do passo "Valor", para o nó no quadro. */
export function descreverValor(c: ConfigDoValor): string {
  const lado =
    c.fonte === "mensagem"
      ? "Mensagem"
      : c.fonte === "variavel"
        ? `{{${c.chave || "…"}}}`
        : (NOME_DO_CAMPO[c.chave] ?? (c.chave || "Campo"));
  const op = SIMBOLO_DO_OPERADOR[c.operador];
  const s =
    c.operador === "preenchido" || c.operador === "vazio"
      ? `${lado} ${op}`
      : `${lado} ${op} ${c.valor || "…"}`;
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

/** O que falta para o passo "Valor" funcionar (null = completo). */
export function problemaDoValor(c: ConfigDoValor): string | null {
  if (c.fonte !== "mensagem" && !c.chave)
    return c.fonte === "variavel" ? "escolha a resposta guardada" : "escolha o campo do contato";
  if (c.operador !== "preenchido" && c.operador !== "vazio" && !c.valor)
    return "escreva o valor para comparar";
  return null;
}

// ─── "Enviar formulário" ────────────────────────────────────────────────────

/**
 * A resposta a uma pergunta do formulário, conferida pelo tipo. Devolve o que
 * fica em {{variavel}} e, quando a pergunta grava no contato, o valor no
 * formato do cadastro; null = resposta que não serve (o motor pede de novo).
 *   - texto: 1 a 1000 caracteres;
 *   - email: formato de e-mail, em minúsculas;
 *   - numero: "10", "4,5" (fica como o contato escreveu, sem espaços);
 *   - data: dd/mm/aaaa ou aaaa-mm-dd que existe (fica dd/mm/aaaa);
 *   - telefone: 8 a 15 dígitos (fica só com os dígitos).
 * Gravar no contato soma a regra do campo (`valorDoCampo`): aniversário no
 * futuro não serve para o cadastro, então não serve como resposta.
 */
export function respostaDoFormulario(
  p: Pick<PerguntaDoFormulario, "tipo" | "gravar_em">,
  bruto: string,
  hoje = new Date(),
): { valor: string; gravado: string | null } | null {
  const v = bruto.replace(/\s+/g, " ").trim();
  if (!v) return null;
  let valor: string | null;
  switch (p.tipo as TipoDeResposta) {
    case "texto":
      valor = v.slice(0, 1000);
      break;
    case "email": {
      const e = v.toLowerCase();
      valor = EMAIL.test(e) && e.length <= 254 ? e : null;
      break;
    }
    case "numero":
      valor = comoNumero(v) !== null ? v.replace(/\s/g, "") : null;
      break;
    case "data": {
      const t = comoData(v);
      if (t === null) valor = null;
      else {
        const d = new Date(t);
        valor = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
      }
      break;
    }
    case "telefone": {
      const digitos = v.replace(/\D/g, "");
      valor = digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
      break;
    }
  }
  if (valor === null) return null;
  if (!p.gravar_em) return { valor, gravado: null };
  const gravado = valorDoCampo(p.gravar_em, valor, hoje);
  return gravado === null ? null : { valor, gravado };
}

/**
 * A nota que o contato deu: o primeiro número da mensagem ("5", "nota 4",
 * "10!") ou, sem número, a quantidade de estrelas ("⭐⭐⭐⭐"). Fora da escala → null.
 */
export function notaDaResposta(resposta: string, escala: "1_5" | "0_10"): number | null {
  const [min, max] = escala === "1_5" ? [1, 5] : [0, 10];
  const numero = resposta.match(/\d{1,2}/);
  let nota: number | null = numero ? Number(numero[0]) : null;
  if (nota === null) {
    const estrelas = [...resposta].filter((c) => c === "⭐" || c === "★").length;
    nota = estrelas > 0 ? estrelas : null;
  }
  return nota !== null && nota >= min && nota <= max ? nota : null;
}

/**
 * Regras do chatbot — PURO, sem banco. Lido pelo motor (decidir a saída de
 * "Definir condição" / "Multi-condicional" e validar "Campo do contato"), pela
 * validação do fluxo (o que impede ligar) e pela tela (o rótulo das saídas).
 *
 * Toda comparação de texto ignora maiúsculas, acentos e espaços repetidos — é
 * o que quem monta o fluxo espera de "a etiqueta é VIP" ou "a resposta é sim".
 */
import type { CampoDoContato, Regra } from "./passos";

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

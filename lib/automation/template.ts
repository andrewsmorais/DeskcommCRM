import { resolveField } from "@/lib/automation/conditions";
import { aplicarBlocosCondicionais } from "@/lib/texto/bloco-condicional";

const ALIASES: Record<string, string> = {
  nome: "contact.name",
  primeiro_nome: "contact.name",
  telefone: "contact.phone_number",
  email: "contact.email",
};

/**
 * A marcação tem dono no CRM (contato ou negócio) — e por isso NÃO se preenche
 * de fora.
 *
 * Existe para quem recebe valor de terceiro (as variáveis do integrador em
 * `lib/operacao/modelos-de-mensagem.ts`): `{{nome}}` é alias de `contact.name`,
 * então um valor mandado para "nome" seria descartado em silêncio pelo render
 * — e quem mandou receberia o texto com a marcação vazia achando que preencheu.
 * A régua é por NOME, e não pelo dado: sem contato informado a marcação também
 * estaria vazia, e aí a recusa sumiria justamente no caso mais enganoso.
 */
export function marcacaoDoCrm(nome: string): boolean {
  return (
    ALIASES[nome] !== undefined || nome.startsWith("contact.") || nome.startsWith("lead.")
  );
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  // `{{#campo}}...{{/campo}}`: o trecho só sai quando o campo tem valor, e a
  // linha inteira some quando o bloco era o conteúdo dela. Mesma leitura da
  // variável que a passada abaixo usa.
  const comBlocos = aplicarBlocosCondicionais(template, {
    temValor: (campo) => valorDaMarcacao(campo, context).trim() !== "",
  });
  return comBlocos.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => valorDaMarcacao(path, context));
}

/**
 * Campos do contato que SÓ A EQUIPE vê e que nenhuma mensagem renderiza, nem
 * pedidos pelo caminho (`{{contact.address_book_name}}`). O contexto da
 * automação carrega a linha inteira do contato, então a guarda mora aqui, onde
 * todo texto de automação passa. O nome da agenda é o rótulo que alguém da
 * empresa escreveu no celular e pode ser apelido interno (trazido do produto
 * original, PR #2439; migration 0546).
 */
const SO_DA_EQUIPE = new Set(["contact.address_book_name"]);

function valorDaMarcacao(path: string, context: Record<string, unknown>): string {
  if (SO_DA_EQUIPE.has(path)) return "";
  const resolved = resolveField(context, ALIASES[path] ?? path);
  // `{{primeiro_nome}}` = primeira palavra do nome, como no Inbox e na campanha.
  const texto = String(resolved ?? "");
  return path === "primeiro_nome" ? (texto.trim().split(/\s+/)[0] ?? "") : texto;
}

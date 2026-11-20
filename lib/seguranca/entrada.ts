/**
 * Entradas que o BANCO recusa e que, sem esta guarda, viravam erro 500.
 * Achadas pelo schemathesis (bateria de segurança, 14/11/2026). PURO: quem
 * aplica é o `proxy.ts`, na porta de toda requisição.
 *
 * Texto com o caractere NULO (U+0000) ou com metade de um par Unicode
 *    ("surrogate" sozinho): o Postgres não guarda nenhum dos dois em `text`
 *    nem em `jsonb` ("unsupported Unicode escape sequence"), então qualquer
 *    formulário que os recebesse caía em 500 no meio da gravação. Nenhum ser
 *    humano digita isso; é sonda ou lixo de integração. O certo é recusar na
 *    entrada, com 422 e o motivo.
 */

/** O texto é algo que o Postgres guarda? (sem NULO e sem par Unicode partido) */
export function textoGuardavel(s: string): boolean {
  if (s.includes("\u0000")) return false;
  return s.isWellFormed();
}

/**
 * Por que o corpo JSON não pode seguir, ou `null` se pode. Corpo que nem é
 * JSON segue: quem responde "JSON inválido" é a própria rota, com a mensagem
 * dela. Olha chaves E valores, em qualquer profundidade.
 */
export function motivoDeRecusaDoJson(corpo: string): string | null {
  let dado: unknown;
  try {
    dado = JSON.parse(corpo);
  } catch {
    return null;
  }
  const pilha: unknown[] = [dado];
  while (pilha.length > 0) {
    const v = pilha.pop();
    if (typeof v === "string") {
      if (!textoGuardavel(v)) return "texto_com_caractere_invalido";
    } else if (Array.isArray(v)) {
      // Um por um: `push(...v)` estoura o limite de argumentos do motor com
      // uma lista enorme, e o erro subia como 500 em vez de deixar passar.
      for (const filho of v) pilha.push(filho);
    } else if (v && typeof v === "object") {
      for (const [k, filho] of Object.entries(v)) {
        if (!textoGuardavel(k)) return "texto_com_caractere_invalido";
        pilha.push(filho);
      }
    }
  }
  return null;
}

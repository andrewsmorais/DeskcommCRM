/**
 * O que impede um fluxo de ser LIGADO. Rascunho pode ficar incompleto à
 * vontade; ligado, o motor responde a clientes de verdade — então o desenho
 * precisa ter por onde começar e cada passo precisa estar preenchido.
 * Mensagens escritas para quem monta o fluxo, não para quem programa.
 */
import { ehTipoDePasso, lerConfig, metaDoPasso, type Grafo } from "./passos";
import { problemaDaRegra } from "./regras";

export function problemasDoGrafo(grafo: Grafo): string[] {
  const problemas: string[] = [];
  const ids = new Set(grafo.nodes.map((n) => n.id));
  const inicios = grafo.nodes.filter((n) => n.type === "inicio_canal");

  if (inicios.length === 0) problemas.push('coloque o passo "Iniciar por um canal".');
  for (const inicio of inicios) {
    if (!grafo.edges.some((e) => e.source === inicio.id && ids.has(e.target)))
      problemas.push('ligue o "Iniciar por um canal" ao primeiro passo do fluxo.');
    const c = lerConfig("inicio_canal", inicio.data);
    if (c.gatilho === "palavra_chave" && c.palavras.length === 0)
      problemas.push('no "Iniciar por um canal", escreva ao menos uma palavra-chave.');
  }

  for (const no of grafo.nodes) {
    if (!ehTipoDePasso(no.type)) {
      problemas.push("o fluxo tem um passo que não existe mais; apague-o.");
      continue;
    }
    const nome = metaDoPasso(no.type)?.nome ?? no.type;
    switch (no.type) {
      case "enviar_mensagem":
        if (!lerConfig("enviar_mensagem", no.data).texto)
          problemas.push(`escreva o texto do passo "${nome}".`);
        break;
      case "pedir_escolher":
        if (!lerConfig("pedir_escolher", no.data).pergunta)
          problemas.push(`escreva a pergunta do passo "${nome}".`);
        break;
      case "pedir_digitar":
        if (!lerConfig("pedir_digitar", no.data).pergunta)
          problemas.push(`escreva a pergunta do passo "${nome}".`);
        break;
      case "mensagem_contem":
        if (lerConfig("mensagem_contem", no.data).palavras.length === 0)
          problemas.push(`escreva ao menos uma palavra no passo "${nome}".`);
        break;
      case "transferir_atendente":
        if (!lerConfig("transferir_atendente", no.data).user_id)
          problemas.push(`escolha o atendente do passo "${nome}".`);
        break;
      case "criar_nota":
        if (!lerConfig("criar_nota", no.data).texto)
          problemas.push(`escreva o texto do passo "${nome}".`);
        break;
      case "campo_contato": {
        const c = lerConfig("campo_contato", no.data);
        if (c.campo === "personalizado" && !c.chave)
          problemas.push(`no passo "${nome}", dê um nome ao campo personalizado.`);
        if (!c.valor) problemas.push(`no passo "${nome}", escreva o valor a gravar.`);
        break;
      }
      case "definir_condicao": {
        const p = problemaDaRegra(lerConfig("definir_condicao", no.data).regra);
        if (p) problemas.push(`no passo "${nome}", ${p}.`);
        break;
      }
      case "multi_condicional":
        lerConfig("multi_condicional", no.data).regras.forEach((r, i) => {
          const p = problemaDaRegra(r);
          if (p) problemas.push(`no passo "${nome}", regra ${i + 1}: ${p}.`);
        });
        break;
    }
  }

  if (grafo.edges.some((e) => !ids.has(e.source) || !ids.has(e.target)))
    problemas.push("há uma ligação solta; desfaça e ligue de novo.");

  return [...new Set(problemas)];
}

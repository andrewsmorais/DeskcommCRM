/**
 * O que impede um fluxo de ser LIGADO. Rascunho pode ficar incompleto à
 * vontade; ligado, o motor responde a clientes de verdade — então o desenho
 * precisa ter por onde começar e cada passo precisa estar preenchido.
 * Mensagens escritas para quem monta o fluxo, não para quem programa.
 */
import { ehTipoDePasso, lerConfig, metaDoPasso, type Grafo } from "./passos";
import { linksDoTexto, linksQueBloqueiam } from "./links";
import { problemaDaRegra, problemaDoValor } from "./regras";

export function problemasDoGrafo(grafo: Grafo): string[] {
  const problemas: string[] = [];
  const ids = new Set(grafo.nodes.map((n) => n.id));
  const inicios = grafo.nodes.filter((n) => n.type === "inicio_canal");
  const porAutomacao = grafo.nodes.filter(
    (n) => n.type === "inicio_automacao" || n.type === "inicio_manual",
  );

  if (inicios.length === 0 && porAutomacao.length === 0)
    problemas.push(
      'coloque o passo "Iniciar por um canal", "Iniciar por automação" ou "Iniciar manualmente".',
    );
  for (const inicio of porAutomacao) {
    if (!grafo.edges.some((e) => e.source === inicio.id && ids.has(e.target)))
      problemas.push(
        inicio.type === "inicio_manual"
          ? 'ligue o "Iniciar manualmente" ao primeiro passo do fluxo.'
          : 'ligue o "Iniciar por automação" ao primeiro passo do fluxo.',
      );
  }
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
      case "enviar_mensagem": {
        const texto = lerConfig("enviar_mensagem", no.data).texto;
        if (!texto) problemas.push(`escreva o texto do passo "${nome}".`);
        for (const l of linksQueBloqueiam(texto))
          problemas.push(`no passo "${nome}", o link ${l.link} não abre uma página; troque ou apague.`);
        break;
      }
      case "enviar_oferta": {
        const texto = lerConfig("enviar_oferta", no.data).texto;
        if (!texto) problemas.push(`escreva a mensagem do passo "${nome}".`);
        for (const l of linksQueBloqueiam(texto))
          problemas.push(`no passo "${nome}", o link ${l.link} não abre uma página; troque ou apague.`);
        break;
      }
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
      case "transferir_atendente": {
        const c = lerConfig("transferir_atendente", no.data);
        if (c.modo === "especifico" && !c.user_id)
          problemas.push(`escolha o atendente do passo "${nome}".`);
        if (c.espera_minutos > 0 && !c.espera_mensagem)
          problemas.push(`escreva a mensagem de espera do passo "${nome}".`);
        break;
      }
      case "transferir_equipe": {
        const c = lerConfig("transferir_equipe", no.data);
        if (c.espera_minutos > 0 && !c.espera_mensagem)
          problemas.push(`escreva a mensagem de espera do passo "${nome}".`);
        break;
      }
      case "enviar_midia":
        if (!lerConfig("enviar_midia", no.data).storage_path)
          problemas.push(`escolha o arquivo do passo "${nome}".`);
        break;
      case "agendar_horario": {
        const c = lerConfig("agendar_horario", no.data);
        if (!c.event_type_id) problemas.push(`escolha o tipo de atendimento do passo "${nome}".`);
        if (!c.pergunta) problemas.push(`escreva a pergunta do passo "${nome}".`);
        break;
      }
      case "negocio_funil": {
        const c = lerConfig("negocio_funil", no.data);
        if (!c.pipeline_id || !c.stage_id)
          problemas.push(`escolha o funil e a etapa do passo "${nome}".`);
        break;
      }
      case "tem_etiqueta":
        if (lerConfig("tem_etiqueta", no.data).etiquetas.length === 0)
          problemas.push(`escreva ao menos uma etiqueta no passo "${nome}".`);
        break;
      case "setor_da_conversa":
        if (lerConfig("setor_da_conversa", no.data).setores.length === 0)
          problemas.push(`escolha ao menos um setor no passo "${nome}".`);
        break;
      case "canal_da_conversa":
        if (lerConfig("canal_da_conversa", no.data).canais.length === 0)
          problemas.push(`escolha ao menos um número no passo "${nome}".`);
        break;
      case "acionar_fluxo":
        if (!lerConfig("acionar_fluxo", no.data).flow_id)
          problemas.push(`escolha o fluxo do passo "${nome}".`);
        break;
      case "pedir_avaliacao":
        if (!lerConfig("pedir_avaliacao", no.data).pergunta)
          problemas.push(`escreva a pergunta do passo "${nome}".`);
        break;
      case "pedir_feedback":
        if (!lerConfig("pedir_feedback", no.data).pergunta)
          problemas.push(`escreva a pergunta do passo "${nome}".`);
        break;
      case "webhook": {
        const c = lerConfig("webhook", no.data);
        if (!c.url) problemas.push(`escreva o endereço do passo "${nome}".`);
        else if (!/^https?:\/\/[^\s/]+/i.test(c.url))
          problemas.push(`o endereço do passo "${nome}" precisa começar com https://.`);
        break;
      }
      case "iniciar_followup":
        if (!lerConfig("iniciar_followup", no.data).pointer_id)
          problemas.push(`escolha o follow-up do passo "${nome}".`);
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
      case "valor": {
        const p = problemaDoValor(lerConfig("valor", no.data));
        if (p) problemas.push(`no passo "${nome}", ${p}.`);
        break;
      }
      case "enviar_localizacao": {
        const c = lerConfig("enviar_localizacao", no.data);
        if (!c.endereco && (c.latitude === null || c.longitude === null))
          problemas.push(`escreva o endereço do passo "${nome}".`);
        break;
      }
      case "enviar_contato": {
        const c = lerConfig("enviar_contato", no.data);
        if (!c.nome || c.telefone.replace(/\D/g, "").length < 10)
          problemas.push(`escreva o nome e o telefone com DDD do passo "${nome}".`);
        break;
      }
      case "enviar_produto":
        if (!lerConfig("enviar_produto", no.data).produto_id)
          problemas.push(`escolha o produto do passo "${nome}".`);
        break;
      case "etapa_do_funil":
        if (!lerConfig("etapa_do_funil", no.data).pipeline_id)
          problemas.push(`escolha o funil do passo "${nome}".`);
        break;
      case "enviar_pagamento": {
        const c = lerConfig("enviar_pagamento", no.data);
        if (!c.link && !c.pix)
          problemas.push(`escreva o link ou o Pix do passo "${nome}".`);
        // O link inteiro numa variável ({{link_checkout}}) só existe na hora do
        // envio; escrito à mão, precisa ser endereço de página.
        if (c.link && !/^\{\{\s*[a-z_][a-z0-9_]*\s*\}\}$/.test(c.link)) {
          const [l] = linksDoTexto(c.link);
          if (!l || l.link !== c.link || l.problema === "malformado" || l.problema === "protocolo_perigoso")
            problemas.push(`no passo "${nome}", o link precisa começar com https:// (ou ser uma {{variavel}}).`);
        }
        break;
      }
      case "enviar_template":
        if (!lerConfig("enviar_template", no.data).template_id)
          problemas.push(`escolha o modelo do passo "${nome}".`);
        break;
      case "enviar_formulario": {
        const c = lerConfig("enviar_formulario", no.data);
        c.perguntas.forEach((q, i) => {
          if (!q.pergunta) problemas.push(`no passo "${nome}", escreva a pergunta ${i + 1}.`);
        });
        const variaveis = c.perguntas.map((q) => q.variavel);
        if (new Set(variaveis).size !== variaveis.length)
          problemas.push(
            `no passo "${nome}", cada pergunta precisa guardar a resposta num nome diferente.`,
          );
        break;
      }
    }
  }

  if (grafo.edges.some((e) => !ids.has(e.source) || !ids.has(e.target)))
    problemas.push("há uma ligação solta; desfaça e ligue de novo.");

  return [...new Set(problemas)];
}

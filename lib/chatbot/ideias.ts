/**
 * "Ver ideias de bot" do editor de chatbot: fluxos prontos para começar, como
 * na Umbler Talk. PURO — a tela chama `montarIdeia` com um gerador de id e
 * recebe nós e ligações já organizados (`organizarBlocos`).
 *
 * Toda ideia usa só passos do catálogo (`lib/chatbot/passos.ts`) com a
 * configuração validada pelo mesmo schema do editor; o teste
 * (`ideias.test.ts`) reprova ideia com passo inexistente, ligação para saída
 * que o passo não tem, ou fluxo sem início. O que depende da conta (número,
 * tipo de atendimento da Agenda) fica para quem usa escolher — a validação de
 * "Ligar" aponta o que falta.
 */
import { configDoPasso, type Grafo, type TipoDePasso } from "./passos";
import { organizarBlocos } from "./organizar";

type NoDaIdeia = { chave: string; tipo: TipoDePasso; dados?: Record<string, unknown> };
type LigacaoDaIdeia = [de: string, para: string, saida?: string];

export type Ideia = {
  id: string;
  nome: string;
  descricao: string;
  nos: NoDaIdeia[];
  ligacoes: LigacaoDaIdeia[];
};

export const IDEIAS_DE_BOT: readonly Ideia[] = [
  {
    id: "menu",
    nome: "Menu de atendimento",
    descricao: "Boas-vindas com opções numeradas: cada opção leva a um caminho.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      { chave: "oi", tipo: "enviar_mensagem", dados: { texto: "Olá! Que bom falar com você 😊" } },
      {
        chave: "menu",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Como posso ajudar?",
          opcoes: ["Quero comprar", "Preciso de suporte", "Falar com uma pessoa"],
        },
      },
      {
        chave: "vendas",
        tipo: "transferir_equipe",
        dados: { mensagem: "Perfeito! Já vou te passar para alguém da equipe de vendas." },
      },
      {
        chave: "suporte",
        tipo: "pedir_digitar",
        dados: { pergunta: "Me conta em poucas palavras o que aconteceu.", variavel: "problema" },
      },
      {
        chave: "suporte_equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Obrigado! Já vou te passar para o suporte." },
      },
      {
        chave: "pessoa",
        tipo: "transferir_equipe",
        dados: { mensagem: "Certo! Um atendente já vai falar com você." },
      },
    ],
    ligacoes: [
      ["ini", "oi"],
      ["oi", "menu"],
      ["menu", "vendas", "opcao-0"],
      ["menu", "suporte", "opcao-1"],
      ["suporte", "suporte_equipe"],
      ["menu", "pessoa", "opcao-2"],
      ["menu", "pessoa", "invalida"],
    ],
  },
  {
    id: "fora_do_horario",
    nome: "Fora do horário",
    descricao: "No horário, passa para a equipe; fora dele, avisa quando vocês voltam.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      { chave: "hora", tipo: "horarios", dados: { faixas: [{ inicio: "08:00", fim: "18:00" }] } },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Olá! Já vou te passar para alguém da equipe." },
      },
      {
        chave: "aviso",
        tipo: "finalizar_conversa",
        dados: {
          mensagem:
            "Olá! Nosso horário é das 8h às 18h. Deixe sua mensagem que respondemos assim que voltarmos.",
        },
      },
    ],
    ligacoes: [
      ["ini", "hora"],
      ["hora", "equipe", "dentro"],
      ["hora", "aviso", "fora"],
    ],
  },
  {
    id: "coletar_dados",
    nome: "Coletar dados antes de atender",
    descricao: "Pede nome e e-mail, grava no contato e só então passa para a equipe.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "form",
        tipo: "enviar_formulario",
        dados: {
          introducao: "Olá! Para te atender melhor, preciso de dois dados rapidinho.",
          perguntas: [
            { pergunta: "Qual é o seu nome?", variavel: "nome", tipo: "texto", gravar_em: "nome" },
            { pergunta: "E o seu e-mail?", variavel: "email", tipo: "email", gravar_em: "email" },
          ],
          conclusao: "Obrigado, {{nome}}!",
        },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Já vou te passar para alguém da equipe." },
      },
    ],
    ligacoes: [
      ["ini", "form"],
      ["form", "equipe"],
      ["form", "equipe", "invalida"],
    ],
  },
  {
    id: "satisfacao",
    nome: "Pesquisa de satisfação",
    descricao: "O atendente aciona no fim do atendimento: nota, comentário e despedida.",
    nos: [
      { chave: "ini", tipo: "inicio_manual" },
      { chave: "nota", tipo: "pedir_avaliacao" },
      { chave: "comentario", tipo: "pedir_feedback" },
      {
        chave: "fim",
        tipo: "finalizar_conversa",
        dados: { mensagem: "Obrigado pela avaliação! Até a próxima." },
      },
    ],
    ligacoes: [
      ["ini", "nota"],
      ["nota", "comentario"],
      ["nota", "fim", "invalida"],
      ["comentario", "fim"],
    ],
  },
  {
    id: "agendamento",
    nome: "Agendar horário",
    descricao: "Oferece os horários livres da Agenda e marca o que o cliente escolher.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "oi",
        tipo: "enviar_mensagem",
        dados: { texto: "Olá! Vamos marcar seu horário." },
      },
      { chave: "agenda", tipo: "agendar_horario" },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Vou te passar para alguém da equipe encontrar um horário com você." },
      },
    ],
    ligacoes: [
      ["ini", "oi"],
      ["oi", "agenda"],
      ["agenda", "equipe", "sem_horario"],
      ["agenda", "equipe", "invalida"],
    ],
  },
  {
    id: "triagem_ia",
    nome: "Triagem com o agente de IA",
    descricao: "Dúvidas vão para o agente de IA do número; quem pede uma pessoa vai para a equipe.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "menu",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Olá! Como prefere seguir?",
          opcoes: ["Tirar uma dúvida", "Falar com uma pessoa"],
        },
      },
      {
        chave: "ia",
        tipo: "transferir_ia",
        dados: { mensagem: "Certo! Pode mandar sua dúvida." },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Já vou te passar para alguém da equipe." },
      },
    ],
    ligacoes: [
      ["ini", "menu"],
      ["menu", "ia", "opcao-0"],
      ["menu", "equipe", "opcao-1"],
      ["menu", "equipe", "invalida"],
      ["ia", "equipe", "falha"],
    ],
  },
  {
    // Começa pela automação "Iniciar chatbot" quando a plataforma de venda
    // (Kiwify, Cakto, Hotmart…) avisa Pix gerado ou carrinho abandonado: as
    // variáveis {{produto}}, {{valor}}, {{link_checkout}} e {{pix_copia_e_cola}}
    // chegam do aviso. Quem confirma o pagamento é a plataforma, nunca a
    // resposta do cliente — por isso "Já paguei" só agradece.
    id: "recuperar_pagamento",
    nome: "Recuperar Pix ou carrinho",
    descricao:
      'Quando a plataforma de venda avisa Pix gerado ou carrinho abandonado, lembra o cliente com o link e o Pix, e pergunta se precisa de ajuda. Ligue numa automação "Iniciar chatbot".',
    nos: [
      { chave: "ini", tipo: "inicio_automacao" },
      {
        chave: "espera",
        tipo: "aguardar_intervalo",
        dados: { quantidade: 15, unidade: "minutos", se_responder: "seguir" },
      },
      {
        chave: "lembrete",
        tipo: "enviar_mensagem",
        dados: {
          texto:
            "Oi! Vi que seu pedido de {{produto}} ficou pendente. Se quiser concluir, é por aqui:",
        },
      },
      {
        chave: "pagamento",
        tipo: "enviar_pagamento",
        dados: {
          descricao: "{{produto}}",
          valor: "{{valor}}",
          link: "{{link_checkout}}",
          pix: "{{pix_copia_e_cola}}",
        },
      },
      {
        chave: "menu",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Conseguiu finalizar?",
          opcoes: ["Já paguei", "Tive um problema", "Desisti"],
          prazo_minutos: 1440,
        },
      },
      {
        chave: "pago",
        tipo: "enviar_mensagem",
        dados: {
          texto: "Que ótimo! Assim que a plataforma confirmar, você recebe tudo por lá. 😊",
        },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Vou te passar para alguém da equipe te ajudar a concluir." },
      },
      {
        chave: "motivo",
        tipo: "pedir_digitar",
        dados: {
          pergunta: "Tudo bem! Pode me contar o que te fez desistir? Isso nos ajuda a melhorar.",
          variavel: "motivo",
          prazo_minutos: 1440,
        },
      },
      { chave: "nota", tipo: "criar_nota", dados: { texto: "Desistiu da compra: {{motivo}}" } },
      {
        chave: "obrigado",
        tipo: "enviar_mensagem",
        dados: { texto: "Obrigado por contar! Se mudar de ideia, é só chamar aqui." },
      },
      {
        chave: "ultimo",
        tipo: "enviar_mensagem",
        dados: {
          texto: "Seu pedido de {{produto}} ainda está aqui. Qualquer dúvida, é só responder. 👋",
        },
      },
    ],
    ligacoes: [
      ["ini", "espera"],
      ["espera", "lembrete"],
      ["lembrete", "pagamento"],
      ["pagamento", "menu"],
      ["pagamento", "equipe", "falha"],
      ["menu", "pago", "opcao-0"],
      ["menu", "equipe", "opcao-1"],
      ["menu", "motivo", "opcao-2"],
      ["menu", "equipe", "invalida"],
      ["menu", "ultimo", "sem_resposta"],
      ["motivo", "nota"],
      ["nota", "obrigado"],
    ],
  },
  {
    id: "atendimento_inicial",
    nome: "Atendimento inicial",
    descricao: "Cumprimenta, pergunta o nome, guarda no cadastro e mostra as opções.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "nome",
        tipo: "pedir_digitar",
        dados: {
          pergunta: "Olá! 😊 Que bom te ver por aqui. Como posso te chamar?",
          variavel: "nome",
        },
      },
      { chave: "grava", tipo: "campo_contato", dados: { campo: "nome", valor: "{{nome}}" } },
      {
        chave: "menu",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Prazer, {{nome}}! Como posso ajudar?",
          opcoes: ["Conhecer os produtos", "Tirar uma dúvida", "Falar com uma pessoa"],
        },
      },
      {
        chave: "produtos",
        tipo: "enviar_mensagem",
        dados: { texto: "Veja tudo o que temos aqui: (cole o link do seu site ou catálogo)" },
      },
      { chave: "ia", tipo: "transferir_ia", dados: { mensagem: "Pode mandar sua dúvida!" } },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Já vou te passar para alguém da equipe." },
      },
    ],
    ligacoes: [
      ["ini", "nome"],
      ["nome", "grava"],
      ["grava", "menu"],
      ["menu", "produtos", "opcao-0"],
      ["menu", "ia", "opcao-1"],
      ["menu", "equipe", "opcao-2"],
      ["menu", "equipe", "invalida"],
      ["ia", "equipe", "falha"],
    ],
  },
  {
    id: "qualificacao",
    nome: "Qualificação comercial",
    descricao:
      "Pergunta o interesse, o prazo e o e-mail, põe no funil e passa para um vendedor em rodízio.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "interesse",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Olá! Para te atender melhor: o que você procura?",
          opcoes: ["Comprar agora", "Pedir um orçamento", "Só pesquisando"],
        },
      },
      {
        chave: "prazo",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Para quando você precisa?",
          opcoes: ["Esta semana", "Este mês", "Sem pressa"],
        },
      },
      {
        chave: "email",
        tipo: "pedir_digitar",
        dados: { pergunta: "Qual o seu melhor e-mail?", variavel: "email", formato: "email" },
      },
      { chave: "grava", tipo: "campo_contato", dados: { campo: "email", valor: "{{email}}" } },
      { chave: "quente", tipo: "editar_etiquetas", dados: { adicionar: ["lead quente"] } },
      { chave: "funil", tipo: "negocio_funil" },
      {
        chave: "vendedor",
        tipo: "transferir_atendente",
        dados: { modo: "rodizio", mensagem: "Perfeito! Um vendedor já vai falar com você." },
      },
      {
        chave: "nutrir",
        tipo: "enviar_mensagem",
        dados: { texto: "Sem problema! Quando quiser, é só chamar aqui. 😉" },
      },
    ],
    ligacoes: [
      ["ini", "interesse"],
      ["interesse", "prazo", "opcao-0"],
      ["interesse", "prazo", "opcao-1"],
      ["interesse", "nutrir", "opcao-2"],
      ["interesse", "prazo", "invalida"],
      ["prazo", "email", "opcao-0"],
      ["prazo", "email", "opcao-1"],
      ["prazo", "email", "opcao-2"],
      ["prazo", "email", "invalida"],
      ["email", "grava"],
      ["email", "funil", "invalida"],
      ["grava", "quente"],
      ["quente", "funil"],
      ["funil", "vendedor"],
    ],
  },
  {
    id: "apresentar_produtos",
    nome: "Apresentação de produtos",
    descricao:
      "O cliente escolhe o que quer ver e recebe o produto do Catálogo com foto e preço atuais.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      {
        chave: "menu",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Qual produto você quer conhecer?",
          opcoes: ["Produto 1", "Produto 2", "Falar com uma pessoa"],
        },
      },
      { chave: "p1", tipo: "enviar_produto" },
      { chave: "p2", tipo: "enviar_produto" },
      {
        chave: "comprar",
        tipo: "pedir_escolher",
        dados: { pergunta: "Gostou? Quer comprar?", opcoes: ["Quero comprar", "Ver outro"] },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Ótimo! Já vou te passar para alguém da equipe fechar com você." },
      },
    ],
    ligacoes: [
      ["ini", "menu"],
      ["menu", "p1", "opcao-0"],
      ["menu", "p2", "opcao-1"],
      ["menu", "equipe", "opcao-2"],
      ["menu", "equipe", "invalida"],
      ["p1", "comprar"],
      ["p2", "comprar"],
      ["comprar", "equipe", "opcao-0"],
      ["comprar", "menu", "opcao-1"],
      ["comprar", "equipe", "invalida"],
    ],
  },
  {
    id: "catalogo",
    nome: "Envio de catálogo",
    descricao: "Manda o catálogo em PDF e o link do site, e oferece ajuda para escolher.",
    nos: [
      {
        chave: "ini",
        tipo: "inicio_canal",
        dados: { gatilho: "palavra_chave", palavras: ["catálogo", "catalogo", "preços"] },
      },
      { chave: "pdf", tipo: "enviar_midia", dados: { legenda: "Aqui está o nosso catálogo! 📖" } },
      {
        chave: "site",
        tipo: "enviar_mensagem",
        dados: { texto: "Também dá para ver tudo no site: (cole o link do seu site)" },
      },
      {
        chave: "ajuda",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Quer ajuda para escolher?",
          opcoes: ["Sim, quero ajuda", "Não, obrigado"],
          prazo_minutos: 1440,
        },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Já vou te passar para alguém da equipe." },
      },
      {
        chave: "fim",
        tipo: "finalizar_conversa",
        dados: { mensagem: "Qualquer coisa, é só chamar!" },
      },
    ],
    ligacoes: [
      ["ini", "pdf"],
      ["pdf", "site"],
      ["site", "ajuda"],
      ["ajuda", "equipe", "opcao-0"],
      ["ajuda", "fim", "opcao-1"],
      ["ajuda", "equipe", "invalida"],
    ],
  },
  {
    id: "cobrar",
    nome: "Envio de pagamento",
    descricao: "Confere o e-mail do cliente e manda o link de pagamento e o Pix.",
    nos: [
      { chave: "ini", tipo: "inicio_manual" },
      {
        chave: "email",
        tipo: "pedir_digitar",
        dados: {
          pergunta: "Para eu gerar o seu pedido, qual o seu e-mail?",
          variavel: "email",
          formato: "email",
          usar_mensagem_anterior: true,
        },
      },
      { chave: "grava", tipo: "campo_contato", dados: { campo: "email", valor: "{{email}}" } },
      {
        chave: "pagamento",
        tipo: "enviar_pagamento",
        dados: { descricao: "Seu pedido", mensagem: "Pronto! Para concluir:" },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Vou te passar para alguém da equipe concluir com você." },
      },
    ],
    ligacoes: [
      ["ini", "email"],
      ["email", "grava"],
      ["email", "equipe", "invalida"],
      ["grava", "pagamento"],
      ["pagamento", "equipe", "falha"],
    ],
  },
  {
    id: "sem_resposta",
    nome: "Recuperar cliente sem resposta",
    descricao:
      "Para uma automação de silêncio: puxa assunto e, sem resposta em 1 dia, encerra com educação.",
    nos: [
      { chave: "ini", tipo: "inicio_automacao" },
      {
        chave: "volta",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Oi! Ficou alguma dúvida? Posso te ajudar com alguma coisa?",
          opcoes: ["Sim, tenho dúvida", "Quero falar com alguém", "Não, obrigado"],
          prazo_minutos: 1440,
        },
      },
      { chave: "ia", tipo: "transferir_ia", dados: { mensagem: "Claro! Pode mandar." } },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Já vou te passar para alguém da equipe." },
      },
      {
        chave: "fim",
        tipo: "finalizar_conversa",
        dados: { mensagem: "Tudo bem! Estamos aqui quando precisar. 👋" },
      },
    ],
    ligacoes: [
      ["ini", "volta"],
      ["volta", "ia", "opcao-0"],
      ["volta", "equipe", "opcao-1"],
      ["volta", "fim", "opcao-2"],
      ["volta", "equipe", "invalida"],
      ["volta", "fim", "sem_resposta"],
      ["ia", "equipe", "falha"],
    ],
  },
  {
    id: "followup_comercial",
    nome: "Follow-up comercial",
    descricao:
      "O atendente dispara na conversa: agradece, avisa do retorno e põe o contato num follow-up.",
    nos: [
      { chave: "ini", tipo: "inicio_manual" },
      {
        chave: "msg",
        tipo: "enviar_mensagem",
        dados: {
          texto: "Obrigado pela conversa! Vou te acompanhar por aqui nos próximos dias. 😊",
        },
      },
      { chave: "followup", tipo: "iniciar_followup" },
    ],
    ligacoes: [
      ["ini", "msg"],
      ["msg", "followup"],
    ],
  },
  {
    id: "confirmar_agendamento",
    nome: "Confirmação de agendamento",
    descricao:
      "Para um lembrete da Agenda: pergunta se o cliente confirma, quer remarcar ou cancelar.",
    nos: [
      { chave: "ini", tipo: "inicio_automacao" },
      {
        chave: "pergunta",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Olá! Passando para confirmar o seu horário. Tudo certo?",
          opcoes: ["Confirmo", "Quero remarcar", "Quero cancelar"],
          prazo_minutos: 720,
        },
      },
      { chave: "ok", tipo: "enviar_mensagem", dados: { texto: "Perfeito, te esperamos! 😊" } },
      { chave: "remarcar", tipo: "reagendar_horario" },
      { chave: "cancelar", tipo: "cancelar_agendamento" },
      {
        chave: "cancelado",
        tipo: "enviar_mensagem",
        dados: {
          texto:
            "Pronto, cancelei o horário de {{agendamento}}. Quando quiser marcar de novo, é só chamar.",
        },
      },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Vou te passar para alguém da equipe resolver o seu horário." },
      },
    ],
    ligacoes: [
      ["ini", "pergunta"],
      ["pergunta", "ok", "opcao-0"],
      ["pergunta", "remarcar", "opcao-1"],
      ["pergunta", "cancelar", "opcao-2"],
      ["pergunta", "equipe", "invalida"],
      ["remarcar", "equipe", "sem_agendamento"],
      ["remarcar", "equipe", "sem_horario"],
      ["remarcar", "equipe", "invalida"],
      ["cancelar", "cancelado"],
      ["cancelar", "equipe", "sem_agendamento"],
      ["cancelar", "equipe", "falha"],
    ],
  },
  {
    id: "reagendar",
    nome: "Reagendamento",
    descricao: 'Quem escreve "remarcar" vê os horários livres e muda o próprio compromisso.',
    nos: [
      {
        chave: "ini",
        tipo: "inicio_canal",
        dados: { gatilho: "palavra_chave", palavras: ["remarcar", "reagendar", "mudar horário"] },
      },
      { chave: "remarcar", tipo: "reagendar_horario" },
      {
        chave: "sem",
        tipo: "enviar_mensagem",
        dados: { texto: "Não achei nenhum horário marcado no seu nome. Quer marcar um?" },
      },
      { chave: "agendar", tipo: "agendar_horario" },
      {
        chave: "equipe",
        tipo: "transferir_equipe",
        dados: { mensagem: "Vou te passar para alguém da equipe encontrar um horário com você." },
      },
    ],
    ligacoes: [
      ["ini", "remarcar"],
      ["remarcar", "sem", "sem_agendamento"],
      ["remarcar", "equipe", "sem_horario"],
      ["remarcar", "equipe", "invalida"],
      ["sem", "agendar"],
      ["agendar", "equipe", "sem_horario"],
      ["agendar", "equipe", "invalida"],
    ],
  },
  {
    id: "falar_com_vendedor",
    nome: "Transferência para vendedor",
    descricao: "Volta o cliente para o vendedor que já o atendeu; quem é novo entra no rodízio.",
    nos: [
      { chave: "ini", tipo: "inicio_canal" },
      { chave: "conhecido", tipo: "primeira_conversa" },
      {
        chave: "anterior",
        tipo: "transferir_atendente",
        dados: {
          modo: "anterior",
          mensagem: "Que bom te ver de novo! Já te passo para quem te atendeu.",
        },
      },
      {
        chave: "rodizio",
        tipo: "transferir_atendente",
        dados: { modo: "rodizio", mensagem: "Olá! Um vendedor já vai falar com você." },
      },
    ],
    ligacoes: [
      ["ini", "conhecido"],
      ["conhecido", "rodizio", "sim"],
      ["conhecido", "anterior", "nao"],
    ],
  },
  {
    id: "pos_venda",
    nome: "Pós-venda",
    descricao: "Quando a venda é aprovada: boas-vindas e, 3 dias depois, pede uma nota.",
    nos: [
      { chave: "ini", tipo: "inicio_automacao" },
      {
        chave: "oi",
        tipo: "enviar_mensagem",
        dados: {
          texto: "Obrigado pela compra de {{produto}}! 🎉 Qualquer dúvida, é só chamar aqui.",
        },
      },
      {
        chave: "espera",
        tipo: "aguardar_intervalo",
        dados: { quantidade: 3, unidade: "dias", se_responder: "esperar" },
      },
      { chave: "nota", tipo: "pedir_avaliacao" },
      { chave: "obrigado", tipo: "enviar_mensagem", dados: { texto: "Valeu pela avaliação! 💜" } },
    ],
    ligacoes: [
      ["ini", "oi"],
      ["oi", "espera"],
      ["espera", "nota"],
      ["nota", "obrigado"],
    ],
  },
  {
    id: "oportunidade_parada",
    nome: "Recuperar oportunidade parada",
    descricao:
      "Para uma automação de etapa parada: pergunta se ainda há interesse e anota o motivo de quem desistiu.",
    nos: [
      { chave: "ini", tipo: "inicio_automacao" },
      {
        chave: "ainda",
        tipo: "pedir_escolher",
        dados: {
          pergunta: "Oi! Ainda tem interesse em seguir com a gente?",
          opcoes: ["Sim, quero continuar", "Agora não"],
          prazo_minutos: 2880,
        },
      },
      {
        chave: "vendedor",
        tipo: "transferir_atendente",
        dados: { modo: "anterior", mensagem: "Ótimo! Já te passo para quem estava te atendendo." },
      },
      {
        chave: "motivo",
        tipo: "pedir_digitar",
        dados: {
          pergunta: "Tudo bem! Pode me contar o motivo? Ajuda a gente a melhorar.",
          variavel: "motivo",
        },
      },
      {
        chave: "nota",
        tipo: "criar_nota",
        dados: { texto: "Oportunidade parada — motivo: {{motivo}}" },
      },
      {
        chave: "fim",
        tipo: "finalizar_conversa",
        dados: { mensagem: "Obrigado! Estamos aqui quando precisar." },
      },
    ],
    ligacoes: [
      ["ini", "ainda"],
      ["ainda", "vendedor", "opcao-0"],
      ["ainda", "motivo", "opcao-1"],
      ["ainda", "vendedor", "invalida"],
      ["motivo", "nota"],
      ["nota", "fim"],
    ],
  },
];

/** Os tipos de passo que a ideia usa (para a tela marcar o que o plano não inclui). */
export function passosDaIdeia(ideia: Ideia): TipoDePasso[] {
  return [...new Set(ideia.nos.map((n) => n.tipo))];
}

/**
 * Nós e ligações da ideia com ids novos, já organizados e deslocados para
 * começar em `origem` (a tela põe ao lado do que já está no quadro).
 */
export function montarIdeia(
  ideia: Ideia,
  novoId: () => string,
  origem: { x: number; y: number } = { x: 0, y: 0 },
): Grafo {
  const ids = new Map(ideia.nos.map((n) => [n.chave, novoId()]));
  const nodes = ideia.nos.map((n) => ({
    id: ids.get(n.chave)!,
    type: n.tipo,
    position: { x: 0, y: 0 },
    data: configDoPasso[n.tipo].parse(n.dados ?? {}) as Record<string, unknown>,
  }));
  const edges = ideia.ligacoes.map(([de, para, saida = "proximo"]) => ({
    id: novoId(),
    source: ids.get(de)!,
    target: ids.get(para)!,
    sourceHandle: saida,
  }));
  const pos = organizarBlocos(nodes, edges);
  const minX = Math.min(...[...pos.values()].map((p) => p.x));
  const minY = Math.min(...[...pos.values()].map((p) => p.y));
  return {
    nodes: nodes.map((n) => {
      const p = pos.get(n.id)!;
      return { ...n, position: { x: p.x - minX + origem.x, y: p.y - minY + origem.y } };
    }),
    edges,
  };
}

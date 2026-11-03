/**
 * O texto do botão "Ajuda" (?) de cada passo do editor de chatbot, no modelo
 * da Umbler Talk: quando usar, o que acontece de fato, as opções e os cuidados,
 * e as variáveis que o passo deixa para os passos seguintes.
 *
 * `Record<TipoDePasso, string>` obriga: passo novo no catálogo sem ajuda não
 * compila. O texto descreve o que ESTE sistema faz (lib/chatbot/motor.ts e
 * executar.ts), não o que a Umbler faz — onde os dois diferem, vale o daqui.
 *
 * Um texto por passo, com os parágrafos separados por linha em branco, numa
 * tabela constante: é a forma que a tela passa por `t(AJUDA_DOS_PASSOS[tipo])`
 * e que a cerca do espanhol (tests/unit/i18n-espanhol-cobre-a-tela.test.ts)
 * consegue ler. O espanhol mora no dicionário.
 */
import { lerConfig, type TipoDePasso } from "./passos";

export const AJUDA_DOS_PASSOS: Record<TipoDePasso, string> = {
  inicio_canal:
    "Quando adicionada essa ação no seu chatbot, ele passa a responder sozinho as conversas que chegam pelo número de WhatsApp escolhido, assim que o fluxo estiver ligado.\n\nVocê escolhe se ele começa em toda conversa nova ou só quando a mensagem do cliente tiver uma das palavras-chave. Cada número tem um só chatbot de entrada ligado: ligar outro para o mesmo número desliga o anterior.\n\nDepois que o fluxo termina, ele só recomeça na mesma conversa 6 horas depois, para não responder a cada “obrigado”.\n\nO chatbot não responde quando a conversa já está com um atendente, quando o contato está bloqueado, nem em grupos de WhatsApp.",
  inicio_automacao:
    "Quando adicionada essa ação no seu chatbot, ele não responde mensagens sozinho: ele começa quando uma regra de Automações manda, com a ação “Iniciar chatbot”. Por exemplo, quando uma compra é aprovada na Kiwify ou na Cakto, ou quando um negócio muda de etapa.\n\nUm fluxo que só tem este início pode ficar ligado junto com o fluxo de atendimento do mesmo número.\n\nSe o contato estava parado em outro fluxo, aquele termina e este começa: a automação é o fato mais novo.",
  inicio_manual:
    "Quando adicionada essa ação no seu chatbot, ele fica disponível para os atendentes dentro de qualquer conversa: na Inbox, o botão do robô no topo da conversa lista os chatbots ligados que têm este início.\n\nO chatbot responde até o fluxo terminar, mesmo com a conversa no nome do atendente. É bom para pesquisa de satisfação no fim do atendimento, menu de pagamento ou coleta de dados.\n\nO fluxo precisa estar ligado para aparecer na lista. Um fluxo só com este início pode ficar ligado junto com o fluxo de atendimento.\n\nAo começar, as mensagens de espera programadas nesta conversa param: o fluxo novo é quem fala agora.",
  horarios:
    "Quando adicionada essa condição no seu chatbot, ele segue por um caminho dentro das faixas de horário que você marcar e por outro fora delas.\n\nUse para avisar quando a empresa está fechada, ou para só passar para a equipe no horário de atendimento. Uma faixa que passa da meia-noite (22:00 às 06:00) também vale.\n\nO horário é o do fuso da empresa, não o do cliente.",
  dias_semana:
    "Quando adicionada essa condição no seu chatbot, ele segue por um caminho nos dias da semana marcados e por outro nos demais.\n\nCombine com “Horários” para montar o expediente: por exemplo, segunda a sexta das 8h às 18h. Usa o fuso horário da empresa.",
  mensagem_contem:
    "Quando adicionada essa condição no seu chatbot, ele olha a última mensagem do contato e segue por “Contém” se ela tiver qualquer uma das palavras escritas, ou por “Não contém”.\n\nMaiúsculas e acentos não importam: “Preço” encontra “preco”. Separe as palavras com vírgula.\n\nÁudio, foto ou figurinha não têm texto, então seguem por “Não contém”.",
  definir_condicao:
    "Quando adicionada essa condição no seu chatbot, ele segue por “Regra atendida” ou “Regra não atendida” conforme uma regra que você monta.\n\nA regra pode olhar uma etiqueta do contato, uma resposta guardada antes no fluxo, um campo do contato (nome, e-mail, aniversário ou campo personalizado) ou a última mensagem.\n\nMaiúsculas e acentos não importam. Para comparar números (por exemplo, uma nota), use “É maior ou igual a”.",
  multi_condicional:
    "Quando adicionada essa condição no seu chatbot, você monta várias regras e cada uma ganha uma saída própria. Vale a primeira regra que bater, de cima para baixo.\n\nSe nenhuma bater, o fluxo segue por “Nenhuma regra”. Dê um nome a cada saída para o quadro ficar fácil de ler.",
  distribuir_fluxo:
    "Quando adicionada essa condição no seu chatbot, cada contato segue por uma das saídas, sorteada pelo peso de cada uma. Pesos 70 e 30 mandam cerca de 70% dos contatos para a primeira e 30% para a segunda.\n\nÉ o jeito de fazer teste A/B: duas mensagens de boas-vindas diferentes, por exemplo, para ver qual vende mais.",
  contato_ativo:
    "Quando adicionada essa condição no seu chatbot, ele verifica se o contato mandou mensagem dentro do tempo escolhido (24 horas por padrão) e segue por “Ativo” ou “Inativo”.\n\n24 horas é a janela do WhatsApp: fora dela, escrever primeiro tem mais risco de bloqueio, e no número oficial só modelo aprovado pode sair.",
  tem_etiqueta:
    "Quando adicionada essa condição no seu chatbot, ele segue por “Tem” se o contato tiver as etiquetas escritas, ou por “Não tem”.\n\nVocê escolhe se basta uma delas ou se precisa ter todas. Uma etiqueta que o próprio fluxo acabou de pôr (em “Editar etiquetas”) já conta.",
  primeira_conversa:
    "Quando adicionada essa condição no seu chatbot, ele segue por “Primeira vez” se o contato nunca tinha mandado mensagem antes deste atendimento, ou por “Já conversou antes”.\n\nUse para dar boas-vindas diferentes a quem é novo e a quem já é cliente.",
  canal_da_conversa:
    "Quando adicionada essa condição no seu chatbot, ele segue por “Um dos números” se a conversa estiver acontecendo por um dos números de WhatsApp marcados, ou por “Outro número”.\n\nÚtil quando o mesmo fluxo atende mais de um número (por exemplo, vendas e suporte) e cada um precisa de um caminho.",
  atendente_da_conversa:
    "Quando adicionada essa condição no seu chatbot, ele verifica quem é o atendente responsável pela conversa e segue por “É um deles” ou “Outro ou ninguém”.\n\nSem nenhum atendente marcado, a condição vale para qualquer atendente: serve para saber se a conversa já tem dono.",
  presenca_do_atendente:
    "Quando adicionada essa condição no seu chatbot, ele verifica se alguém da equipe pode assumir a conversa agora: disponível, dentro do horário e com folga no limite de conversas.\n\nÉ a mesma regra da Distribuição de atendimento. Use antes de transferir: se ninguém estiver disponível, avise o cliente quando vão responder.",
  bot_paralelo:
    "Quando adicionada essa condição no seu chatbot, ele verifica se o agente de IA ou outro chatbot está atendendo esta mesma conversa agora, e segue por “Tem outro bot” ou “Só este”.\n\nUse para não deixar dois robôs respondendo o mesmo cliente ao mesmo tempo.",
  status_da_conversa:
    "Quando adicionada essa condição no seu chatbot, ele verifica se o contato está esperando resposta, isto é, se a última mensagem da conversa é dele, e segue por “Esperando resposta” ou “Já respondido”.",
  valor:
    "Quando adicionada essa condição no seu chatbot, ele compara uma resposta guardada, um campo do contato ou a última mensagem com um valor que você escreve, e segue por “Verdadeiro” ou “Falso”.\n\nO valor pode ter {{variavel}}: por exemplo, comparar o e-mail que o cliente digitou com o e-mail do cadastro.\n\nTexto ignora maiúsculas e acentos. Maior e menor funcionam entre números (10, 4,5) ou entre datas (25/12/2026); entre texto e número a resposta é sempre “Falso”.",
  enviar_mensagem:
    "Quando adicionada essa ação no seu chatbot, ele envia o texto escrito diretamente para o contato no WhatsApp.\n\nUse {{nome}} para inserir o que o contato respondeu antes em “Pedir para digitar” ou outra resposta guardada.\n\nAs mensagens saem com um pequeno intervalo entre elas e só dentro da janela de envio do número, para proteger o WhatsApp de bloqueio.",
  enviar_midia:
    "Quando adicionada essa ação no seu chatbot, ele envia uma foto, um vídeo, um áudio ou um documento (como PDF) para o contato, com legenda opcional.\n\nO arquivo fica guardado no sistema e aparece na conversa como qualquer outra mídia enviada.",
  enviar_template:
    "Quando adicionada essa ação no seu chatbot, ele envia um modelo de mensagem aprovado pela Meta. É a única mensagem que o WhatsApp aceita depois de 24 horas sem o contato escrever.\n\nSó funciona em número oficial (API da Meta). Em número conectado por QR Code não há modelo: o fluxo segue por “Não enviado” e a conversa ganha uma nota com o motivo.\n\nModelos com variáveis não aparecem na lista, porque o fluxo não tem de onde tirar os valores.",
  pedir_escolher:
    "Quando adicionada essa ação no seu chatbot, ele envia a pergunta com as opções numeradas e espera a resposta do contato. Cada opção ganha uma saída própria no quadro.\n\nO contato pode responder com o número (“2”) ou com o texto da opção. Se responder outra coisa, o chatbot pede de novo, até o número de tentativas; depois segue por “Não respondeu certo”.",
  pedir_digitar:
    "Quando adicionada essa ação no seu chatbot, ele envia a pergunta e espera o contato digitar uma resposta livre.\n\nA resposta fica guardada com o nome que você escolher, para usar depois numa mensagem, numa condição ou para gravar no cadastro com “Campo do contato”.",
  enviar_formulario:
    "Quando adicionada essa ação no seu chatbot, ele faz várias perguntas em sequência, uma por mensagem, e confere cada resposta pelo tipo: texto, e-mail, número, data ou telefone.\n\nCada resposta fica guardada com o nome escolhido e, se você marcar, também é gravada no nome, e-mail ou aniversário do contato.\n\nSe o contato errar todas as tentativas de uma pergunta, o fluxo segue por “Não respondeu certo”. Não é o formulário nativo do WhatsApp: funciona em qualquer número.",
  agendar_horario:
    "Quando adicionada essa ação no seu chatbot, ele oferece os próximos horários livres de um tipo de atendimento da Agenda e marca o que o contato escolher.\n\nÉ a mesma agenda e a mesma marcação que o agente de IA usa. Se não houver horário livre, segue por “Sem horário livre”; se o contato não escolher nenhum, por “Não escolheu”.\n\nEm atendimentos que a equipe aprova antes, o horário fica reservado até a confirmação.",
  negocio_funil:
    "Quando adicionada essa ação no seu chatbot, ele põe o contato no funil de vendas: se o contato já tem um negócio aberto naquele funil, o negócio vai para a etapa escolhida; se não tem, nasce nela.\n\nO título do negócio novo pode usar {{variavel}}; vazio, usa o nome do contato.",
  acionar_fluxo:
    "Quando adicionada essa ação no seu chatbot, este fluxo termina aqui e o fluxo escolhido começa do início, levando as respostas já guardadas.\n\nEscolha este mesmo fluxo para “voltar ao menu”. Para montar submenus, crie o outro fluxo com “Iniciar por automação”: ele pode ficar ligado junto com este.\n\nO fluxo escolhido precisa estar ligado.",
  transferir_equipe:
    "Quando adicionada essa ação no seu chatbot, a conversa vai para a fila de atendimento humano e fica como Aguardando até alguém pegar. A Distribuição de atendimento escolhe quem pega.\n\nO agente de IA fica calado nesta conversa até uma pessoa devolvê-la (ou até vencer o prazo de devolução automática, se a empresa ligou um). A mensagem antes de transferir é opcional.\n\nEm “Mensagem de espera”, o chatbot pode mandar um aviso se ninguém responder dentro do tempo escolhido, até 3 vezes. Ele para assim que uma pessoa responder.",
  transferir_atendente:
    "Quando adicionada essa ação no seu chatbot, a conversa vai direto para o atendente escolhido.\n\nSe esse atendente não fizer mais parte da equipe, a transferência não acontece. A mensagem antes de transferir e a mensagem de espera funcionam como em “Transferir para a equipe”.",
  transferir_ia:
    "Quando adicionada essa ação no seu chatbot, a conversa volta para o atendimento automático: o agente de IA deste número (ou o roteador) responde dali em diante, inclusive a mensagem que o contato acabou de mandar.\n\nSe não houver agente de IA ligado no número, o fluxo segue por “Sem agente de IA”. Ligue ali um “Transferir para a equipe”.\n\nO chatbot em si não usa IA; o agente gasta IA como sempre, dentro do orçamento dele.",
  editar_etiquetas:
    "Quando adicionada essa ação no seu chatbot, ele adiciona ou remove etiquetas do contato.\n\nAs etiquetas novas disparam as automações de “etiqueta adicionada”, como se uma pessoa as tivesse posto.",
  campo_contato:
    "Quando adicionada essa ação no seu chatbot, ele grava um valor no cadastro do contato: nome, e-mail, aniversário ou um campo personalizado.\n\nO valor costuma ser uma resposta do contato, como {{email}}. Se o valor não servir (e-mail sem @, data que não existe), o fluxo segue por “Valor inválido”, para você pedir de novo.",
  criar_nota:
    "Quando adicionada essa ação no seu chatbot, ele deixa uma nota interna na conversa. A equipe vê, o contato não.\n\nUse para resumir o que o cliente respondeu antes de passar para um atendente.",
  pedir_avaliacao:
    "Quando adicionada essa ação no seu chatbot, ele pede uma nota para o atendimento, de 1 a 5 ou de 0 a 10, e espera a resposta.\n\nO contato pode responder com o número ou com estrelas. A nota aparece na conversa como nota interna e entra na média da lista de chatbots.\n\nSe o contato não der uma nota válida depois das tentativas, segue por “Não avaliou”.",
  pedir_feedback:
    "Quando adicionada essa ação no seu chatbot, ele pede um comentário sobre o atendimento e espera a resposta.\n\nO comentário vai para a conversa como nota interna, junto da nota da avaliação.",
  iniciar_followup:
    "Quando adicionada essa ação no seu chatbot, ele coloca o contato num dos follow-ups publicados do CRM, os mesmos que o agente de IA usa.\n\nSe o contato já estiver em outro follow-up ativo, ele fica no que está, e a conversa ganha uma nota dizendo isso.",
  notificar_atendente:
    "Quando adicionada essa ação no seu chatbot, ele abre um aviso na Central de avisos, com som e notificação para a equipe, levando à conversa.\n\nAs respostas do contato entram só na nota da conversa, não no aviso.",
  fluxo_de_espera:
    "Quando adicionada essa ação no seu chatbot, ela liga ou desliga as mensagens de espera desta conversa: as que “Transferir para a equipe” e “Transferir p/ atendente” mandam enquanto ninguém responde.\n\nDesligar para as que estão programadas. Ligar volta a programá-las, se ainda faltarem vezes e ninguém da equipe tiver respondido.\n\nQuando um atendente aciona um fluxo, ou uma automação começa um, elas já param sozinhas: nesses fluxos, use “Ligar” para mantê-las.",
  aguardar_intervalo:
    "Quando adicionada essa ação no seu chatbot, o fluxo espera o tempo escolhido (segundos, minutos, horas ou dias) antes de seguir.\n\nVocê escolhe o que fazer se o contato mandar mensagem durante a espera: seguir o fluxo na hora, ou continuar esperando (a mensagem fica para a equipe ver).",
  aguardar_ate:
    "Quando adicionada essa ação no seu chatbot, o fluxo pausa até o próximo horário marcado (por exemplo, amanhã às 9h, só em dias úteis) e segue dali.\n\nUsa o fuso horário da empresa. Como em “Aguardar intervalo”, você escolhe o que fazer se o contato escrever durante a espera.",
  bloquear_contato:
    "Quando adicionada essa ação no seu chatbot, ele bloqueia o contato e finaliza a conversa: nem chatbot, nem agente de IA, nem campanha escrevem mais para ele.\n\nA mensagem, se houver, sai antes do bloqueio. O bloqueio fica registrado na auditoria e numa nota da conversa.",
  excluir_contato:
    "Quando adicionada essa ação no seu chatbot, ele abre o pedido de exclusão dos dados do contato (LGPD), que um administrador aprova em Configurações › LGPD.\n\nO chatbot nunca apaga dados sozinho: uma frase mal entendida não pode destruir o histórico de um cliente. Um pedido aberto por contato basta; repetir não abre outro.",
  finalizar_conversa:
    "Quando adicionada essa ação no seu chatbot, ele finaliza a conversa automaticamente, com uma mensagem de despedida opcional antes.\n\nUse no fim dos caminhos em que o cliente já foi atendido, para a conversa sair da fila da equipe.",
  webhook:
    "Quando adicionada essa ação no seu chatbot, ele chama um endereço de fora (n8n, Make, o sistema da sua loja) com os dados do contato e as respostas, e segue por “Deu certo” ou “Falhou”.\n\nVocê escolhe partes da resposta para guardar em variáveis, como pedido.status. Segredo e autorização ficam guardados cifrados.\n\nO endereço precisa começar com https://. Se o WebHook falhar e não houver ligação em “Falhou”, o fluxo termina ali.",
  bloco_de_notas:
    "Quando adicionado no seu chatbot, o bloco de notas serve só para documentar o fluxo: explicar um caminho, deixar um lembrete para a equipe.\n\nEle aparece só aqui no quadro. O contato nunca vê, e o fluxo não passa por ele.",
};

/** Parágrafos do texto da ajuda (já traduzido pela tela). */
export function paragrafosDaAjuda(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** O que cada variável exportada guarda — textos fixos, traduzidos na tela. */
export const DESCRICOES_DE_VARIAVEL = {
  produto: "Nome do produto da venda (quando a automação vem de uma venda).",
  link_checkout: "Link de pagamento ou do carrinho.",
  valor: "Valor da venda ou do negócio.",
  evento_da_venda: "O que aconteceu na plataforma de vendas (aprovada, abandonada…).",
  digitado: "O que o contato digitou.",
  resposta_do_formulario: "Resposta da pergunta:",
  horario: "O horário marcado, como o contato leu.",
  horario_inicio: "O mesmo horário, em formato de data e hora.",
  agendamento_status: "“confirmado” ou “aguardando confirmação”.",
  avaliacao: "A nota que o contato deu.",
  feedback: "O comentário que o contato escreveu.",
  webhook_status: "O código de resposta do endereço chamado (200, 404…).",
  campo_do_webhook: "Valor deste caminho na resposta:",
} as const;

export type VariavelExportada = {
  nome: string;
  descricao: keyof typeof DESCRICOES_DE_VARIAVEL;
  /** Dado que quem montou o fluxo escreveu (a pergunta, o caminho do JSON): mostrado como está, sem tradução. */
  detalhe?: string;
};

/** As {{variáveis}} que o passo deixa guardadas, já com os nomes que quem montou escolheu. */
export function variaveisDoPasso(tipo: TipoDePasso, dados: unknown): VariavelExportada[] {
  switch (tipo) {
    case "inicio_automacao":
      return [
        { nome: "produto", descricao: "produto" },
        { nome: "link_checkout", descricao: "link_checkout" },
        { nome: "valor", descricao: "valor" },
        { nome: "evento_da_venda", descricao: "evento_da_venda" },
      ];
    case "pedir_digitar":
      return [{ nome: lerConfig("pedir_digitar", dados).variavel, descricao: "digitado" }];
    case "enviar_formulario":
      return lerConfig("enviar_formulario", dados).perguntas.map((q) => ({
        nome: q.variavel,
        descricao: "resposta_do_formulario" as const,
        ...(q.pergunta ? { detalhe: q.pergunta } : {}),
      }));
    case "agendar_horario":
      return [
        { nome: "horario", descricao: "horario" },
        { nome: "horario_inicio", descricao: "horario_inicio" },
        { nome: "agendamento_status", descricao: "agendamento_status" },
      ];
    case "pedir_avaliacao":
      return [{ nome: "avaliacao", descricao: "avaliacao" }];
    case "pedir_feedback":
      return [{ nome: "feedback", descricao: "feedback" }];
    case "webhook":
      return [
        { nome: "webhook_status", descricao: "webhook_status" },
        ...lerConfig("webhook", dados).campos.map((c) => ({
          nome: c.variavel,
          descricao: "campo_do_webhook" as const,
          detalhe: c.caminho,
        })),
      ];
    default:
      return [];
  }
}

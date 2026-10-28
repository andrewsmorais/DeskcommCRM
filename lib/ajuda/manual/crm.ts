import type { ManualDoGrupo } from "@/lib/ajuda/manual/tipos";

/**
 * Manual do grupo CRM. Cada entrada foi escrita lendo a tela (rótulos de botão,
 * campos e mensagens como o usuário os vê). Nome, descrição curta, papel mínimo
 * e módulo de cada tela saem do catálogo de navegação, não daqui.
 */
export const MANUAL_CRM: ManualDoGrupo = {
  "/app/prospecting": {
    oQueE:
      "Busca empresas de um segmento e região e pede para a IA abordar essas empresas aos poucos pelo WhatsApp, acompanhando quem responde.",
    comoUsar: [
      'Clique em "Configurar busca" e cole a "Chave da Apify"; depois "Salvar chave". Sem essa chave a busca não funciona.',
      'Em "1. Encontrar empresas", preencha "Público ou segmento" e "Cidade ou região", defina "Até quantas empresas" e o "Teto da busca (US$)" e clique em "Buscar empresas". A busca só pesquisa; nenhuma mensagem sai nessa etapa.',
      'Quando a busca terminar, abra a campanha em "Suas campanhas". Em "2. Preparar a abordagem", escolha um agente de IA publicado, a "Conexão de saída" (o número de WhatsApp), o "Funil" e as etapas.',
      'Escreva "O que a IA deve oferecer e como iniciar" e "Quando considerar o cliente qualificado".',
      'Defina o "Máximo em 24 horas" e o "Intervalo mínimo (minutos)" entre abordagens.',
      'Preencha a "Referência da avaliação de legítimo interesse" e clique em "Iniciar abordagens com IA".',
      'Em "3. Acompanhar resultados", veja cada empresa e o progresso dela (Encontrado, Na fila, Abordado, Respondeu, Qualificado). "Abrir no Inbox" leva à conversa.',
      'Para parar novas abordagens, use "Pausar abordagens"; para continuar, "Retomar fila".',
    ],
    cuidados: [
      "Esta tela só aparece quando o módulo de disparo em massa está ligado na instalação. No ChatAI Online ele normalmente fica desligado: mandar mensagem para quem nunca falou com a empresa pode fazer o cliente perder o número de WhatsApp conectado por QR code. Se o menu não mostra Prospecção, é por isso.",
      "Só quem tem papel de administrador abre a tela; os outros são levados para o Inbox.",
      "A busca usa o saldo da conta Apify do próprio cliente. A quantidade encontrada pode ser menor que o limite pedido.",
      'O botão "Iniciar abordagens com IA" fica desligado se não houver agente publicado ou se nenhum número estiver conectado (funcionando).',
      "Depois que a campanha começa, a configuração fica travada.",
      '"Encontrado" não é "Qualificado": a qualificação depende do que for confirmado na conversa.',
    ],
  },

  "/app/kanban": {
    oQueE:
      "É a lista dos seus funis de venda. Aqui você cria, renomeia, reordena, arquiva e abre cada funil para ver o quadro de cards. Também importa leads de uma planilha.",
    comoUsar: [
      'Para criar um funil, clique em "Novo funil", digite o nome (por exemplo Consultas, Obras, Matrículas) e clique em "Criar funil". Se ainda não houver nenhum, o botão é "Criar meu primeiro funil".',
      'Para abrir o quadro, clique no nome do funil. Lá, o botão "Novo Lead" cria um card, informando título, etapa, valor e fechamento previsto.',
      'Para mover um card de etapa, arraste o card para outra coluna do quadro. O botão com o menu "Ações do lead" no card também permite "Editar", trocar o "Responsável" e "Levar para outro funil".',
      'Para fechar um negócio, abra "Ações do lead" no card e escolha "Marcar como ganho" ou "Marcar como perdido". Ao perder, escolha o "Motivo" na lista e, se quiser, escreva um detalhe.',
      'Para renomear um funil, clique em "Renomear", mude o nome e clique em "Salvar". Use as setas para subir ou descer o funil na lista.',
      '"Tornar padrão" define o funil em que os contatos novos entram.',
      'Para tirar um funil de uso, clique em "Arquivar" e confirme. Ele sai da lista, mas o histórico é guardado. Os arquivados ficam em "Funis arquivados", de onde dá para "Tirar do arquivo" ou "Excluir de vez".',
      'Para trazer leads de uma planilha, clique em "Importar planilha", escolha o "Funil de destino" e "Escolher o arquivo CSV". Use "Baixar planilha modelo" para ver as colunas. Os leads entram na primeira etapa aberta do funil.',
      "Para criar, renomear ou arquivar as colunas (etapas) do funil, e mudar o vocabulário, vá em Etapas do funil (Configurações do CRM).",
    ],
    cuidados: [
      "Criar, renomear, reordenar, arquivar e excluir funis exige papel de gerente ou superior. Quem tem papel menor vê a lista e abre o quadro, mas não vê esses botões. Importar planilha está disponível a partir do papel de atendente.",
      "O plano limita a quantidade de funis (Essencial: 2, Impulso: 4, Escala: 6). Passando do limite, a criação é recusada com a mensagem pedindo upgrade.",
      "O funil padrão não pode ser arquivado. A tela mostra a explicação quando algo impede (por exemplo, formulário ou automação apontando para o funil).",
      '"Excluir de vez" não tem volta e só funciona em funil que nunca recebeu negócio. Se já recebeu, a exclusão é recusada e o funil continua arquivado. Na dúvida, arquive.',
      'O botão "Funil de clientes" só aparece quando a regra "Clientes pela agenda" está ligada em Configurações › Tipos de agendamento.',
      "Importação de planilha aceita só arquivo CSV.",
      "Excluir um card apaga o card e o histórico de atividades dele; o contato e as conversas continuam. Não dá para desfazer.",
    ],
  },

  "/app/campaigns": {
    oQueE:
      "Permite mandar a mesma mensagem de WhatsApp para uma lista de contatos escolhida por filtros, no ritmo do número, e acompanhar quem recebeu e respondeu.",
    comoUsar: [
      'Clique em "Nova campanha", dê um "Nome da campanha" e escolha o número em "Enviar pelo número".',
      'Em "Base legal do envio", marque "Consentimento" ou "Interesse legítimo" (neste caso informe a "Referência da avaliação (LIA)").',
      'Em "Público", escolha pelo menos um critério: etiquetas, tempo sem falar, funil e etapa. Clique em "Ver quantas pessoas" para conferir quantos podem receber e quantos ficam de fora.',
      'Escreva a "Mensagem". Os botões de variáveis, como o nome do contato, inserem o campo no texto. Quem não tiver o dado usado na mensagem fica fora da lista.',
      'Em "Quem responder", escolha em qual funil e etapa o card nasce e qual agente atende a resposta. Em branco, vale o padrão do número.',
      'Ajuste o "Ritmo desta campanha" (intervalo, máximo por dia e por hora, janela de horário) e clique em "Salvar rascunho". Nada é enviado nesta hora.',
      'Na tela da campanha, use "Preparar lista" para montar a lista, "Enviar teste" para mandar a um contato escolhido, e depois "Iniciar envio" (com confirmação) ou "Agendar".',
      'Acompanhe em "Na lista", "Enviadas", "Entregues" e "Responderam". Dá para "Pausar", "Retomar" ou cancelar.',
      'Em "Configuração" ficam os textos salvos, a lista de exclusão (números que nenhuma campanha alcança) e os padrões de ritmo.',
    ],
    cuidados: [
      "Esta tela só aparece quando o módulo de disparo em massa está ligado na instalação. No ChatAI Online ele normalmente fica desligado, porque disparo em massa pelo WhatsApp conectado por QR code pode fazer o cliente perder o número. Se o menu não mostra Campanhas, é por isso.",
      "Campanhas em massa fazem parte dos planos a partir do Impulso.",
      "Cancelar é definitivo: quem ainda não recebeu não recebe mais e a campanha não volta a rodar.",
      "A campanha pode ficar mais devagar que o ritmo do número, nunca mais rápida. O envio pode levar horas.",
      "Só dá para editar a campanha enquanto ela é rascunho.",
      'Se o contato pediu para parar de receber mensagens, ele conta em "pediram para parar" e não recebe.',
    ],
  },

  "/app/contacts": {
    oQueE:
      "Lista de todas as pessoas que falaram ou foram cadastradas na sua empresa. Cada contato tem uma ficha com dados, histórico (timeline) e acesso à conversa.",
    comoUsar: [
      'Use a busca "Buscar por nome, email ou telefone…" e o filtro de "Tag" para achar alguém. "Limpar filtros" volta à lista inteira.',
      'Para cadastrar, clique em "Novo contato" e preencha o "Nome" e pelo menos um identificador: "Email" ou "Telefone (E.164)", no formato +5511999998888. CPF e Tags são opcionais.',
      'Para trazer uma lista, clique em "Importar CSV": arquivo .csv com cabeçalho e as colunas nome, telefone, email, cpf, nascimento e tags, até 500 linhas por arquivo. No Excel, use "Salvar como" → "CSV UTF-8".',
      'Clique no nome de um contato para abrir a ficha, com as abas "Visão geral" e "Timeline". O botão "Editar" muda os dados.',
      "Na linha do contato, o ícone de conversa abre a conversa dele no Inbox, ou inicia uma nova.",
      'Se a mesma pessoa foi cadastrada duas vezes, clique em "Duplicados", escolha qual cadastro "fica" e clique em "Juntar".',
      'Contato que pediu para não receber mais mensagens aparece com a marca "Bloqueado". Na ficha, administradores veem o botão "Desbloquear", que volta a permitir mensagens e pede confirmação.',
    ],
    cuidados: [
      "Juntar contatos não tem como desfazer. Conversas, mensagens, negócios e histórico passam para o cadastro que fica.",
      "Excluir um contato remove também a conversa associada, se houver, e não dá para desfazer.",
      'A aba "LGPD" com o botão "Anonimizar contato" aparece só para administradores. Anonimizar é irreversível e bloqueia a edição do contato.',
      'Contato com marca "Anonimizado" não pode mais ser editado.',
    ],
  },

  "/app/companies": {
    oQueE:
      "Cadastro de empresas clientes (B2B), com razão social, CNPJ e as pessoas que decidem a compra.",
    comoUsar: [
      'Clique em "Nova empresa" e preencha ao menos um entre "Razão social", "Nome fantasia" e CNPJ. Depois clique em "Criar".',
      'Use a busca "Buscar por nome ou CNPJ" para achar uma empresa na lista.',
      'Clique na empresa para abrir a ficha: "Dados cadastrais", "Pessoas / decisores" e "Telefones".',
      'Na ficha, o botão "Enriquecer CNPJ" busca os dados do CNPJ na BrasilAPI (situação, porte, endereço).',
    ],
    cuidados: [
      "Esta tela só existe quando o módulo de CRM para empresas (B2B) está ligado na instalação. Se o item Empresas não aparece no menu, o módulo está desligado.",
      "Criar empresa exige papel de gerente ou superior. Quem só visualiza consegue ver a lista.",
      "Os telefones mostrados na ficha são os das pessoas ligadas à empresa.",
    ],
  },

  "/app/people": {
    oQueE:
      "Cadastro das pessoas ligadas a empresas (decisores), com vínculo empresarial e telefones.",
    comoUsar: [
      'Clique em "Nova pessoa", escreva o "Nome completo" e clique em "Criar".',
      'Use "Buscar por nome ou e-mail" para achar alguém.',
      'Clique no nome para abrir a ficha e ver as empresas ligadas ("Empresas") e os telefones vinculados.',
    ],
    cuidados: [
      "Esta tela só existe quando o módulo de CRM para empresas (B2B) está ligado na instalação.",
      "Os telefones ficam em Contatos, não aqui: a ficha apenas mostra os telefones já vinculados.",
      "Criar pessoa exige papel de gerente ou superior.",
    ],
  },

  "/app/tasks": {
    oQueE:
      "Lista de tarefas da equipe, com prazo, prioridade e situação. Serve para registrar o que ficou combinado e ver o que venceu.",
    comoUsar: [
      'Clique em "Nova tarefa", escreva "O que precisa ser feito" e, se quiser, "Detalhes", "Prazo" e "Horário".',
      'Escolha a "Prioridade" (Baixa, Média, Alta, Urgente) e a "Situação" (Pendente, Em andamento, Concluída, Cancelada) e clique em "Salvar".',
      'Alterne entre "Lista" e "Calendário" para ver por agrupamentos (Atrasadas, Hoje, Esta semana, Mais tarde, Sem prazo, Encerradas) ou por mês.',
      'Use o seletor de situação (padrão "Em aberto") para filtrar. "Atualizar" recarrega.',
      'Marque a caixinha da tarefa para "Marcar como concluída"; para reabrir, desmarque.',
      'Use o lápis para editar e a lixeira para apagar; apagar pede um segundo clique em "Confirmar".',
    ],
    cuidados: [
      "Tarefa presa a um negócio aparece na linha do tempo dele.",
      "Quem só visualiza vê as tarefas, mas não cria nem edita; isso exige papel de atendente ou superior.",
      "Tarefa é lembrete interno da equipe, não é compromisso com cliente. Compromisso com cliente é da Agenda.",
    ],
  },

  "/app/calls": {
    oQueE:
      "Histórico das ligações de voz feitas ou recebidas pela IA, com quem era, duração e transcrição da conversa.",
    comoUsar: [
      "Veja a tabela com data, direção (Entrada ou Saída), quem é, status, quem atendeu (IA ou Humano) e duração.",
      "Clique em uma chamada para abrir os detalhes e ler a transcrição.",
      'Para ligar, clique em "Nova ligação", digite o "Número" e clique em "Ligar com IA". A IA liga e conduz a chamada.',
    ],
    cuidados: [
      "Ligar falando você mesmo ainda não está disponível: quem fala é a IA.",
      "A telefonia é um módulo opcional da instalação. Sem ela instalada e configurada, não há ligações para mostrar e não dá para ligar.",
      'Quando não há áudio detectado na chamada, a transcrição mostra "(sem áudio detectado)" ou "Sem transcrição pra esta chamada".',
      "Exige papel de gerente ou superior.",
    ],
  },

  "/app/products": {
    oQueE:
      "Catálogo dos produtos da loja. É daqui que o atendente de IA tira o preço e as fotos quando um cliente pergunta.",
    comoUsar: [
      'Clique em "Novo produto" e preencha "Código", "Nome" e "Preço de venda" (escreva assim: 5.499,00). "Marca", "Categoria" e "Custo" são opcionais.',
      'Deixe marcado "Controlar estoque deste produto" e informe a "Quantidade", ou desmarque se for item sob encomenda ou fracionado.',
      'Clique em "Salvar produto".',
      'Para cadastrar vários de uma vez, clique em "Baixar planilha modelo", preencha e use "Importar planilha" (arquivo CSV). A tela mostra quantos foram novos, quantos atualizados e as linhas que não entraram.',
      'Para ter fotos, clique em "Fotos" na linha do produto e depois "Adicionar foto". A primeira foto é a capa e é a ordem em que a IA envia as fotos; use as setas para reordenar.',
      'Para parar de vender um produto, clique em "Desativar"; para voltar, "Reativar".',
      'Use a busca "Buscar por nome, código ou marca" para achar um item.',
    ],
    cuidados: [
      "Com o catálogo vazio, o atendente responde que não encontrou o produto, mesmo que a loja tenha.",
      "Fotos: só JPG ou PNG, até 5 MB, no máximo 5 por produto.",
      "O Custo serve para o atendente saber até onde pode negociar e não aparece para o cliente.",
      "Produto sem controle de estoque aparece sempre como disponível para o atendente.",
      "Cadastrar, importar, desativar e mexer em fotos exige papel de gerente ou superior; os demais só consultam.",
      "A tela lista até 500 produtos.",
    ],
  },

  "/app/imports": {
    oQueE:
      "Importa de uma vez uma planilha com empresas, pessoas, cargos, telefones e e-mails, e mostra o resultado de cada lote.",
    comoUsar: [
      'Escolha o "Arquivo" (CSV ou XLSX) e clique em "Importar".',
      "Ao terminar, a tela mostra o resumo do lote: quantas linhas deram certo, quantos conflitos e quantas falhas.",
      'Na lista de lotes, veja "Status", "Linhas", "Sucesso", "Conflitos", "Falhas" e "Data". Clique em um lote para ver cada linha.',
      'Dentro do lote, marque "Só conflitos" para ver apenas as linhas com conflito, junto com o erro de cada uma.',
    ],
    cuidados: [
      'Esta tela só existe quando o módulo de CRM para empresas (B2B) está ligado na instalação. Para importar contatos comuns, use "Importar CSV" em Contatos; para leads, "Importar planilha" em Funis.',
      "O arquivo precisa ser .csv ou .xlsx e ter no máximo 2 MB.",
      "Exige papel de gerente ou superior.",
    ],
  },

  "/app/proposals": {
    oQueE:
      "Cria, revisa e envia propostas comerciais ao cliente, ligadas a um negócio, e acompanha se foram aceitas ou recusadas.",
    comoUsar: [
      'Clique em "Nova proposta", escolha o "Negócio (Lead)", escreva o "Título da proposta" e, se quiser, a "Validade da proposta" e as condições. Clique em "Criar e abrir editor".',
      "No editor, preencha as condições, a validade, o prazo e a forma de pagamento.",
      'Adicione itens com "Buscar produto no catálogo…" ou "+ Item à mão", informando descrição, quantidade, preço e desconto. O total é calculado.',
      'Escolha e confirme o "Modelo do documento"; sem isso o envio fica desligado. "Preencher com a conversa" tenta completar o que falta usando a conversa com o cliente.',
      'Clique em "Salvar". Use "Ver como o cliente recebe" para conferir a prévia.',
      'Clique em "Enviar ao cliente". Para desistir de um rascunho, "Descartar rascunho".',
      'Depois de enviada, marque "Marcar como aceita" ou "Marcar como recusada" (com motivo opcional). "Revisar esta proposta" cria uma nova versão.',
    ],
    cuidados: [
      "Comandas e propostas fazem parte dos planos a partir do Impulso.",
      "Propostas só aparecem se o módulo estiver ligado na instalação e a empresa tiver ligado em Configurações › Propostas. Sem as duas coisas, a tela não existe.",
      'Para criar proposta é preciso ter um negócio ativo com contato vinculado; sem isso a tela avisa "Nenhum negócio elegível encontrado".',
      "Criar proposta exige papel de atendente ou superior; enviar e descartar exigem papel de gestor.",
      "Se o preço de um item mudou no catálogo, a tela avisa; ao salvar, o preço do catálogo é aplicado.",
      "Os modelos da proposta são cuidados em Configurações › Modelos de proposta.",
    ],
  },

  "/app/comandas": {
    oQueE:
      "O balcão: você abre uma comanda, lança o que foi feito, e fecha com a forma de pagamento. Mostra também atendimentos que aconteceram e ainda não foram cobrados.",
    comoUsar: [
      'Clique em "Nova comanda". Ela aparece na lista à esquerda com o número e a situação (Aberta, Finalizada ou Cancelada).',
      'Clique na comanda para abri-la. Em "Serviço", escolha um serviço ou "Avulso", escreva a "Descrição", o "Valor" e clique em "Incluir".',
      'Para tirar um item lançado errado, use "Remover item" na linha dele (só com a comanda aberta).',
      'Para fechar, escolha a "Forma de pagamento" e clique em "Finalizar". Se a comanda tem cliente, dá para informar "Pontos de fidelidade".',
      'Para desistir da comanda, clique em "Cancelar comanda".',
      'Em "Atendimentos sem comanda", marque o que quer cobrar, escolha a forma de pagamento e clique em "Faturar".',
      'Se uma comanda finalizada foi lançada errada, escreva o "Motivo do estorno" e clique em "Estornar".',
    ],
    cuidados: [
      "Comandas e propostas fazem parte dos planos a partir do Impulso.",
      "Lançar itens, finalizar e faturar exige papel de atendente ou superior; estornar exige gerente ou superior; quem só visualiza consulta.",
      "A forma de pagamento precisa ter conta de destino. Se não tiver, a tela avisa e é preciso definir em Configurações › Financeiro.",
      'O botão "Finalizar" só liga depois de escolher a forma de pagamento.',
      'Item de atendimento sem preço no serviço aparece com "sem preço no serviço".',
    ],
  },

  "/app/settings/tenant/pipelines": {
    oQueE:
      "É onde se configura cada funil: as colunas (etapas), para onde o agente de IA leva o card em cada passo do atendimento e, para administradores, vocabulário, campos e motivos de perda.",
    comoUsar: [
      'Em "Etapas deste funil", renomeie uma etapa clicando no nome, digitando o novo e saindo do campo (ou Enter).',
      'Para criar uma coluna, clique em "Acrescentar etapa ao fim", digite "Nome da nova coluna" e clique em "Criar".',
      'Para mudar a ordem, use as setas de "Mover" a coluna para trás ou para frente.',
      'Em "O que acontece nesta coluna", escolha "Aqui o cliente fecha" (a venda), "Aqui o cliente desiste" (a perda) ou "Nada especial". A chance de fechamento da coluna vai de 0 a 100.',
      'Marque "Avisar a equipe na Central quando um negócio entrar aqui" se quiser ser avisado quando um card chegar naquela etapa.',
      'Para tirar uma coluna do quadro, clique em "Arquivar". Se houver negócios nela, escolha para qual etapa eles vão e confirme em "Mover os negócios e arquivar".',
      'Em "Para onde o card vai em cada passo", escolha a etapa de cada passo do atendimento (ou "Não mover o card") e clique em "Salvar estas escolhas".',
      'Administradores veem "Vocabulário e campos": mudam os nomes Lead, Deal, Won e Lost, cadastram "Motivos de perda" e "Motivos de ganho" (separados por vírgula), criam campos do lead com "Adicionar campo" e clicam em "Salvar vocabulário e campos".',
    ],
    cuidados: [
      "Cada funil precisa de uma etapa de fechamento e uma de perda. A marcação muda de lugar, não se apaga: marcar uma desmarca a que estava antes.",
      "Arquivar uma coluna não apaga o histórico, mas não dá para trazer a coluna de volta por esta tela.",
      "Não dá para arquivar uma coluna que o agente usa em algum passo sem antes mudar o mapeamento. A tela avisa e leva ao mapeamento.",
      "Os negócios de uma coluna arquivada não podem ir para a etapa de fechamento nem de perda.",
      'A tela é para gerentes ou superiores; o bloco "Vocabulário e campos" só aparece para administradores.',
      'O vocabulário muda só alguns textos do quadro (como a contagem na barra de seleção); botões como "Marcar como ganho" continuam com o mesmo nome.',
      "Para criar um funil novo, use a tela Funis, não esta.",
      "O plano limita a quantidade de funis (Essencial: 2, Impulso: 4, Escala: 6).",
    ],
  },
};

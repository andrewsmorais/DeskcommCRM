import type { ManualDoGrupo } from "@/lib/ajuda/manual/tipos";

/**
 * Manual das telas do grupo "organizacao" (Configurações).
 *
 * Tudo aqui foi conferido no código da tela: os nomes de botão, aba e campo
 * são os que o usuário VÊ. Nome, descrição curta, papel mínimo e módulo saem
 * do `NAV_CATALOG` na hora de montar o prompt, e por isso não se repetem aqui.
 */
export const MANUAL_ORGANIZACAO: ManualDoGrupo = {
  "/app/settings/tenant/agenda": {
    oQueE:
      "Aqui você cria e ajusta os tipos de agendamento (consulta, retorno, visita, reunião…): quanto dura cada um, onde acontece e quem atende. É isto que a Agenda e o agente de IA oferecem ao cliente na hora de marcar.",
    comoUsar: [
      "Clique em “Novo tipo de agendamento”.",
      "Preencha “Nome”, “Categoria” (Consulta, Procedimento, Retorno, Visita, Vistoria, Reunião, Call, Orçamento, Demonstração ou Outro) e “Duração (minutos)”.",
      "Em “Onde acontece” escolha Presencial, Telefone, WhatsApp, Link de vídeo ou Google Meet.",
      "Em “Quem atende” escolha a pessoa responsável. Se deixar “Definir depois”, o tipo é criado, mas não aparece para marcar até alguém ser definido.",
      "Clique em “Criar tipo”.",
      "Para mudar um tipo que já existe, clique em “Editar” na linha dele. Ali dá para ajustar “Duração”, “Quem atende” e “Preço padrão” (opcional, vira o valor sugerido na comanda), e ligar o aviso ao cliente pelo WhatsApp antes do compromisso (“Avisar o cliente antes do compromisso, pelo WhatsApp”, com “Adicionar lembrete” para mais de um aviso e “Mensagem deste lembrete” para escrever o texto). Depois clique em “Salvar”.",
      "Para tirar um tipo de circulação sem apagar, use “Desativar”. “Reativar” traz de volta.",
    ],
    cuidados: [
      "Só quem é gerente ou administrador cria e altera tipos. Quem tem papel menor só vê a lista.",
      "Um tipo sem responsável não aparece para marcar. A linha mostra o aviso “sem responsável”.",
      "Quem atende só tem horário para oferecer se publicou a jornada semanal dele na aba “Atendimento” da Equipe.",
      "Nos textos dos lembretes dá para usar {{nome}}, {{titulo}}, {{dia}}, {{hora}} e {{endereco}}. Em branco, vale o texto padrão.",
      "Esta tela também tem três opções da agenda: “Suas agendas Google” (escolher quais agendas suas contam como ocupadas; a conexão com a conta Google se faz pela própria Agenda), “Clientes pela agenda” (quem tem horário marcado ganha a etiqueta “cliente”; só administrador muda) e “Agenda dos colegas” (define se atendente mexe no compromisso de colega; só gerente ou administrador muda).",
    ],
  },

  "/app/settings/tenant/proposals": {
    oQueE:
      "Liga as propostas comerciais para a sua empresa e define a validade e as condições que entram por padrão em toda proposta nova.",
    comoUsar: [
      "Marque “Ligar propostas comerciais para esta organização”.",
      "Em “Validade padrão (dias)” escreva por quantos dias a proposta vale (mínimo 1).",
      "Em “Condições padrão” escreva o texto que deve aparecer em toda proposta, se quiser.",
      "Escolha se quer receber aviso no WhatsApp da equipe quando a IA rascunhar uma proposta (“Avisar no WhatsApp da equipe quando a IA rascunhar uma proposta”).",
      "Clique em “Salvar”.",
      "Para mexer nos textos das propostas, use o link “Modelos de proposta”, no topo da tela.",
    ],
    cuidados: [
      "É um módulo opcional da instalação. Se quem cuida da instalação não ligou, a tela não existe e dá “página não encontrada”.",
      "O aviso no WhatsApp usa o número configurado em “Aviso no WhatsApp”. Sem esse número configurado e ligado, nada é enviado.",
      "Gerar propostas depende do plano. Os recursos “Comandas e propostas” começam no plano Impulso.",
      "Só gerente ou administrador abre esta tela.",
    ],
  },

  "/app/settings/tenant/proposals/modelos": {
    oQueE:
      "Os modelos de texto das propostas. Você usa o da plataforma como está, personaliza um deles, cria um do zero ou manda a proposta que a empresa já usa e a IA transforma em modelo.",
    comoUsar: [
      "Para criar a partir de uma proposta que você já tem, envie o arquivo em “Arquivo da proposta” (PDF, .md ou .txt de até 5 MB). A IA divide em seções, troca por campos o que muda de cliente para cliente e abre o modelo para você revisar antes de salvar.",
      "Para começar do zero, escreva um nome em “Novo modelo em branco” (por exemplo, “Locação por temporada”) e clique em “Criar”.",
      "Em um modelo da plataforma, clique em “Personalizar” para fazer a sua versão. Em um modelo da empresa ou personalizado, clique em “Editar”.",
      "No editor, ajuste “Nome do modelo” e “Para que serve (opcional)”. Cada seção tem “Título da seção” e “Texto da seção”, e pode ser marcada como “Obrigatória” ou “Só aparece se tiver dado”. Use “+ Seção” para acrescentar e as setas para subir ou descer.",
      "Escreva {{campo}} no texto onde o valor muda de um cliente para outro. A lista “Campos usados” mostra o que o modelo vai pedir ao cliente.",
      "Clique em “Salvar modelo”.",
      "Para esconder um modelo da IA e do seletor, use “Não usar”. “Usar” volta a ligar.",
    ],
    cuidados: [
      "Modelo da plataforma não se edita direto: primeiro “Personalizar”.",
      "“Voltar ao modelo da plataforma” desfaz a personalização, e as próximas propostas deixam de usar suas mudanças. “Remover” apaga um modelo da empresa. As propostas já enviadas não mudam.",
      "Um modelo com quase nenhum campo {{campo}} avisa que a IA não saberá o que perguntar ao cliente.",
      "A tela só aparece se o módulo de propostas estiver ligado na instalação e a empresa tiver ligado propostas em “Propostas”. Só gerente ou administrador abre.",
    ],
  },

  "/app/settings/tenant/financeiro": {
    oQueE:
      "O cadastro do financeiro: as contas onde o dinheiro fica, as formas de pagamento, o plano de contas, as regras de comissão e os lançamentos que se repetem todo mês.",
    comoUsar: [
      "Em “Contas”, escreva o “Nome da conta” (ex.: Caixa), escolha o tipo (Caixa, Banco ou Outra) e clique em “Adicionar conta”.",
      "Em “Formas de pagamento”, escreva o nome (ex.: Pix), escolha a “Conta de destino” (onde o dinheiro entra quando a comanda é fechada, ou “Decidir depois”) e clique em “Adicionar forma”.",
      "Em “Plano de contas”, escreva o nome (ex.: Serviços), escolha se é “Entrada” ou “Saída” e clique em “Adicionar plano”.",
      "Em “Comissão”, escolha a “Pessoa” e/ou o “Serviço”, informe o “Percentual” e clique em “Adicionar regra”.",
      "Em “Todo mês”, cadastre o que se repete (aluguel, internet, contador): nome, entrada ou saída, conta, valor e “Dia do mês”, e clique em “Adicionar”.",
      "Para tirar um item de uso, clique em “Desativar” na linha dele. As regras de comissão e os lançamentos do mês têm o botão de remover (×).",
    ],
    cuidados: [
      "Qualquer pessoa da equipe vê a tela, mas só gerente ou administrador cadastra e altera.",
      "O saldo que aparece nos relatórios é sempre a soma dos lançamentos. O valor inicial da conta é só o ponto de partida.",
      "Na comissão, vence a regra mais específica: pessoa e serviço juntos ganham de só pessoa, que ganha de só serviço. Não vence o maior percentual. Sem nenhuma regra, a comissão é zero.",
      "Lançamento recorrente nasce como conta a pagar, nunca como paga: o sistema sabe que vence, mas não sabe se você pagou. O dia do mês vai de 1 a 31; em mês mais curto, cai no último dia.",
      "Esta tela só cadastra. O lançamento do dia a dia (comandas) é feito em outra tela do CRM.",
    ],
  },

  "/app/settings/profile": {
    oQueE:
      "Os seus dados pessoais dentro do sistema: nome, idioma, fuso horário e foto. Vale só para você, não para a empresa.",
    comoUsar: [
      "Em “Nome completo”, escreva como quer aparecer.",
      "Em “Idioma”, escolha o idioma ou “Seguir o idioma da empresa”.",
      "Em “Fuso horário”, escolha o seu.",
      "Em “Avatar URL”, cole o endereço público de uma imagem, se quiser foto.",
      "Clique em “Salvar”. Aparece “Perfil atualizado.”",
    ],
    cuidados: [
      "O e-mail aparece na tela, mas ainda não dá para trocá-lo (“Trocar email — em breve.”).",
      "Subir um arquivo de foto também ainda não existe (“Upload de arquivo — em breve”). Só serve colar o endereço de uma imagem que já esteja na internet.",
    ],
  },

  "/app/settings/security": {
    oQueE:
      "A segurança da sua conta: a verificação em duas etapas (um código de 6 dígitos do celular, além da senha), os códigos de recuperação e a saída de todos os aparelhos.",
    comoUsar: [
      "Para ativar a verificação em duas etapas, clique em “Ativar” e depois em “Iniciar configuração”.",
      "Abra um aplicativo autenticador no celular (Google Authenticator, 1Password, Authy ou Bitwarden), escaneie o QR code e digite o código de 6 dígitos que ele mostrar. Se não conseguir escanear, use “Não consegue escanear? Digite o código manual”.",
      "Clique em “Confirmar” e guarde os códigos de recuperação que aparecem. Cada um serve uma única vez, para o caso de você perder o aplicativo.",
      "Para gerar uma lista nova de códigos, clique em “Regenerar códigos de recuperação” e confirme. Os códigos antigos deixam de valer na hora.",
      "Para sair de todos os aparelhos onde você está logado, clique em “Sair de todos os dispositivos” e confirme. Você precisará entrar de novo em cada um.",
      "Administradores veem também “Exigir de quem administra”. Marcando, todo administrador da empresa passa a ser obrigado a configurar a verificação em duas etapas antes de usar o sistema.",
    ],
    cuidados: [
      "A verificação em duas etapas é opcional. Por padrão ninguém é obrigado a usar. Cada pessoa liga a sua; o administrador pode, se quiser, exigir dos administradores da empresa.",
      "Se o administrador da empresa ligou a exigência, quem é administrador não consegue desligar a própria verificação. A tela avisa: “Ela é obrigatória para administradores desta empresa”. O administrador pode desmarcar a regra em “Exigir de quem administra”.",
      "Para desligar a sua verificação (botão “Desligar”), o sistema pede que você tenha acabado de informar o código de 6 dígitos nesta sessão. Se não, ele manda entrar de novo e informar o código.",
      "A lista de sessões abertas ainda não existe (“em breve”). Por enquanto só dá para sair de todos os aparelhos de uma vez.",
      "Os códigos de recuperação só podem ser gerados com a verificação ativada.",
      "Se a instalação tiver a chamada de voz pelo WhatsApp, o bloco “Chamada de voz pelo WhatsApp” aparece aqui. Ligar exige ser administrador e marcar que leu o aviso: o WhatsApp pode entender isso como uso indevido e bloquear a conta inteira do número, não só as chamadas. Desligar desconecta o aparelho na hora.",
    ],
  },

  "/app/settings/notifications": {
    oQueE:
      "Define sobre o que o sistema te avisa e por onde: aviso dentro do sistema e aviso do navegador (push). Também permite trocar os sons dos avisos da empresa.",
    comoUsar: [
      "Na tabela, cada linha é um tipo de aviso: Nova mensagem, Lead atribuído a você, Lead ganho, Lead perdido, Você foi mencionado e Ligação recebida.",
      "Ligue ou desligue “In-app” para o aviso aparecer dentro do sistema.",
      "Ligue “Push” para o aviso aparecer na bandeja do computador ou celular. O navegador vai pedir permissão; é preciso aceitar.",
      "Em “Sons dos avisos”, clique em “Ouvir” para escutar o som atual. Gerentes e administradores podem usar “Trocar som” (MP3, OGG ou WAV de até 1 MB) ou “Usar o do sistema”.",
    ],
    cuidados: [
      "A coluna “Email” está desligada: avisos por e-mail ainda não existem.",
      "As escolhas da tabela ficam salvas no navegador que você está usando. Em outro computador ou navegador, é preciso configurar de novo.",
      "Se o navegador bloqueou as notificações, o Push não liga. Libere nas configurações do site e recarregue.",
      "Sem as chaves de push configuradas no servidor, os avisos só aparecem com o site aberto. A tela mostra um aviso dizendo isso; quem cuida da instalação resolve.",
      "Os sons são da empresa (dois tipos: “Etapa que avisa” e “Precisa de uma pessoa”) e tocam com o site aberto.",
    ],
  },

  "/app/team": {
    oQueE:
      "Aqui você vê quem trabalha na empresa, convida gente nova, muda o papel de cada um e organiza o atendimento: quem recebe conversa, quanto aguenta e em quais horários.",
    comoUsar: [
      "Para convidar, clique em “Convidar membros” (só administrador vê este botão). Escreva os e-mails, um por linha (até 20 por vez), escolha o papel e clique em “Enviar convites”.",
      "O papel aparece em inglês na tela, e o menu “Role” traz: viewer (somente leitura, só olha e não altera), agent (atendente, quem atende os clientes no dia a dia), manager (gerente, também configura atendimento, etiquetas, horários e outras áreas de gestão) e admin (administrador, também cuida de equipe, plano e cobrança, marca, chaves de acesso e dados da empresa). O padrão do convite é agent.",
      "No convite, o bloco “Interface” deixa escolher quais áreas do menu a pessoa vai ver: perfil “Completa” ou “Simplificada”, ou “Personalizar áreas visíveis”. Isso muda o menu, não as permissões.",
      "Na aba “Membros”, o administrador troca o papel de alguém no seletor da coluna Role e muda o menu dele no botão da coluna “Interface”. Não dá para mexer no próprio papel; a linha mostra “você”.",
      "Para tirar o acesso de alguém, abra o menu “Ações” da linha e escolha “Revogar acesso”. Para devolver, o mesmo menu mostra “Devolver acesso”.",
      "Convites enviados ficam listados na mesma aba, em “Convites”, com status Pendente, Aceito, Expirado ou Revogado. Ali o administrador usa “Reenviar”, “Copiar link” e “Revogar”.",
      "Na aba “Atendimento”, gerentes e administradores definem o “Modo de roteamento” (Manual, em que o atendente puxa da fila, ou Rodízio, em que o sistema distribui) e, em cada atendente, a “Capacidade”, a chave “Disponível” e o horário (botão do relógio, “Editar horário”).",
      "No horário, escolha o “Fuso horário”, clique em “Adicionar janela” e informe o dia da semana, o início e o fim. Clique em “Salvar”.",
    ],
    cuidados: [
      "Só administrador convida, muda papel e revoga. Gerente vê os convites pendentes e mexe na aba “Atendimento”.",
      'O plano limita quantas pessoas a equipe pode ter. Convite pendente ocupa uma vaga até ser aceito, revogado ou expirar. Os números de cada plano estão na seção Planos; os da conta dele, em "Sobre este cliente". Agentes de IA não ocupam vaga. Se as vagas acabarem, o convite é recusado com a mensagem de que é preciso revogar um convite ou mudar de plano em Plano e cobrança.',
      "Se o e-mail do convite não saiu, a coluna mostra “Não saiu”. Use “Copiar link” e mande o link à pessoa por outro meio.",
      "Convidar quem já faz parte da empresa falha com “Já é membro desta organização.”",
      "Trocar o menu de um membro que já existe (botão da coluna “Interface”) é o recurso “Permissões avançadas”, do plano Escala.",
      "Sem janelas de horário, o rodízio aceita conversa a qualquer hora, mas a Agenda não oferece nenhum horário para marcar com aquela pessoa. A coluna “Horário” mostra “Não publicado”.",
      "O modo “Balanceamento por carga” aparece como “em breve” e não pode ser escolhido.",
      "Quem é atendente e não gerente não edita horários: precisa pedir a um gerente que use o botão “Editar horário” ao lado do nome dela.",
      "Distribuição automática, o que cada atendente enxerga e responsáveis por número ficam em “Distribuição de atendimento”.",
    ],
  },

  "/app/settings/atendimento": {
    oQueE:
      "Define quem recebe cada cliente novo e o que cada atendente enxerga. As duas escolhas andam juntas: distribuir sem restringir deixa todo mundo vendo a carteira do colega; restringir sem distribuir deixa o funil de cada um vazio.",
    comoUsar: [
      "Em “Quem recebe o cliente novo”, escolha “Cada um pega o que quiser” (o cliente cai numa fila aberta e quem clicar primeiro assume) ou “Rodízio automático entre os atendentes” (vai para quem está há mais tempo sem receber, entre os disponíveis e dentro do horário).",
      "Ajuste “Tentativas antes de desistir” e “Espera entre tentativas (segundos)”: quando ninguém está disponível, o sistema tenta de novo mais tarde, e ao estourar a conversa fica na fila.",
      "Em “O que cada atendente enxerga”, escolha “Todos veem tudo”, “Os seus, mais os que ainda não têm dono” ou “Só os seus”. Vale só para quem tem o papel de atendente; gerente e administrador continuam vendo tudo.",
      "Em “Quando a pessoa some, a IA volta?”, ligue se quiser que a conversa volte sozinha ao agente de IA depois de um tempo sem resposta da equipe, e informe os “Minutos sem resposta da equipe” (entre 5 minutos e 24 horas).",
      "Em “A conversa fica com quem atendeu”, ligue para que responder pelo Inbox uma conversa sem dono passe a assumi-la e uma conversa encerrada volte para o último atendente.",
      "Clique em “Salvar”.",
      "Em “Responsáveis por número”, escolha quais atendentes recebem as conversas de cada número de WhatsApp conectado e clique em “Salvar responsáveis”. “Voltar ao padrão da organização” desfaz.",
    ],
    cuidados: [
      "Combinar “Só os seus” com distribuição manual deixa ninguém enxergando a fila: nenhum cliente é atendido. A tela avisa; ligue o rodízio.",
      "Quando alguém assume uma conversa, o agente de IA para de responder nela até ser devolvido. A devolução automática só vale onde há agente publicado. Desligada, a IA só volta quando alguém clica em Devolver.",
      "“Responsáveis por número” depende do plano (“Distribuição por número e por time”, a partir do Escala). A capacidade e o horário de cada pessoa valem para todos os números.",
      "Só gerente ou administrador abre esta tela.",
    ],
  },

  "/app/settings/tags": {
    oQueE:
      "A lista de todas as etiquetas da empresa e onde cada uma é usada (contatos, leads, conversas e regras de agente). Dá para corrigir a cor, renomear, juntar duas parecidas ou excluir uma que ninguém usa mais.",
    comoUsar: [
      "Procure a etiqueta na tabela. As colunas mostram quantos contatos, leads, conversas e regras de agente a usam.",
      "Para mudar a cor, clique em “Cor”, escolha em “Cor da etiqueta” (ou “Sem cor”) e confirme.",
      "Para corrigir o nome, clique em “Renomear”, escreva o “Novo nome” e confirme.",
      "Para unir duas etiquetas que significam a mesma coisa, clique em “Juntar” e escolha a “Etiqueta de destino”: a que fica.",
      "Para tirar uma etiqueta, clique em “Excluir” e confirme.",
    ],
    cuidados: [
      "A tela não tem botão para criar etiqueta. Elas aparecem aqui conforme os agentes, o Inbox e o funil as usam.",
      "Renomear ou juntar corrige também as regras de agente que escrevem aquela etiqueta, na mesma operação.",
      "Excluir tira a etiqueta de todos os registros. Se uma regra de agente ainda escreve essa etiqueta, a regra não é apagada e o agente recria a etiqueta no próximo atendimento.",
      "A tela mostra as 500 primeiras etiquetas, em ordem alfabética.",
      "Só gerente ou administrador abre esta tela.",
    ],
  },

  "/app/settings/tenant": {
    oQueE:
      "Os dados da empresa: nome, razão social, CNPJ, fuso, idioma, moeda, quanto tempo guardar as mídias e o contato do encarregado de dados (DPO). Também tem a exportação dos seus dados, o menu da empresa e a zona de perigo.",
    comoUsar: [
      "Preencha ou corrija “Nome de exibição”, “Razão social”, “CNPJ”, “País”, “Fuso horário”, “Idioma” e “Moeda”.",
      "Em “DPO email” e “URL política de privacidade”, coloque o contato do encarregado de dados e o endereço da política de privacidade, se tiver.",
      "Em “Retenção de mídia (dias)”, informe por quantos dias guardar as mídias (entre 30 e 3650).",
      "Clique em “Salvar”. Aparece “Organização atualizada.”",
      "Para levar seus dados, use “Baixar meus dados” em “Exportar meus dados”: vem um arquivo ZIP com planilhas de contatos, conversas, mensagens, leads, tarefas e agendamentos.",
      "Em “Menu lateral”, escolha as áreas que a empresa mostra e clique em “Aplicar interface”.",
    ],
    cuidados: [
      "Só administrador abre esta tela.",
      "A exportação não inclui fotos, áudios e documentos enviados nas conversas.",
      "Se a assinatura terminar, você recebe por e-mail um link para baixar seus dados por até 30 dias. Esta tela continua aberta mesmo sem assinatura ativa.",
      "A moeda vale para todo preço do catálogo. Produto já cadastrado guarda a moeda com que nasceu.",
      "No “Menu lateral” cada pessoa só pode ter menos áreas do que a empresa, nunca mais, e as áreas essenciais ficam sempre visíveis. As permissões não mudam.",
      "“Zona de perigo”: “Apagar todos os dados de atendimento” apaga de vez mensagens, conversas, negócios, contatos, agendamentos e pedidos. Pede que você digite o nome da organização para confirmar e não tem volta. Equipe, configurações, funis, etapas, agentes de IA e canais de WhatsApp continuam. Serve para recomeçar os testes antes de atender de verdade.",
    ],
  },

  "/app/settings/conversoes": {
    oQueE:
      "Devolve ao anúncio as vendas que ele trouxe: quando um negócio que veio de anúncio é marcado como ganho, o valor volta para a plataforma (Meta ou Google Ads). Isso ensina o anúncio a procurar mais gente parecida com quem comprou. Também marca a origem de quem chega pelo site.",
    comoUsar: [
      "A tela tem quatro abas: “Configuração”, “Histórico de envios”, “Diagnóstico” e “Links rastreáveis”.",
      "Para a Meta, em “Configuração”, preencha “Identificador do destino de conversões” (só números, vem do gerenciador de anúncios) e “Token de acesso”, deixe “Reportar vendas automaticamente” ligado e clique em “Salvar conexão”.",
      "Para testar sem contaminar o anúncio, preencha “Código de teste (opcional)”. As vendas vão marcadas como teste. Apague o código quando terminar de conferir.",
      "Para o Google Ads, clique em “Conectar com Google” e autorize. Depois informe “Conta de anúncios (Customer ID)” e a “Ação de conversão da venda (ID)”, ligue “Enviar conversões para o Google Ads” e salve.",
      "Em “Histórico de envios” você filtra por período, status, evento, plataforma ou nome do negócio e vê o que foi enviado. Em “Diagnóstico” aparece a saúde da integração com o Google Ads.",
      "Em “Conversões que não foram reportadas”, corrija a pendência e use o botão de reprocessamento da linha.",
      "Em “Links rastreáveis”, clique em “Novo link” para criar um link por campanha ou botão, com número de WhatsApp (com código do país), mensagem inicial e nome da campanha. A tela gera o link e o script para instalar no site (“Copiar link”, “Copiar script do site”), e “Verificar instalação” confere o site.",
      "Em “Quem chegou pelo site”, a tela mostra como montar o link do botão de WhatsApp com o código de origem no fim da mensagem.",
    ],
    cuidados: [
      "Só administrador abre esta tela.",
      "O token é guardado criptografado e nunca volta para a tela. Em branco, mantém o que já está salvo. Desligar “Reportar vendas automaticamente” pausa o envio e mantém a credencial.",
      "Aceite da API não confirma atribuição ao anúncio. Confira os diagnósticos no gerenciador da plataforma.",
      "Venda sem valor vai sem valor, nunca como zero. No Google Ads, “Enviar o telefone do contato criptografado” envia dado pessoal (em SHA-256). Ligue só se a sua política de privacidade cobre esse uso.",
      "Se aparecer que enviar conversões para o Google Ads não está disponível nesta instalação, não é erro seu: quem instalou o sistema precisa configurar as credenciais do Google.",
      "“Enviar vendas pelo canal da conversa” vem desligado e envia valor, moeda, telefone do cliente e a conversa ao provedor do canal. Ligue só se a sua política de privacidade cobre isso.",
      "O código de origem do site vale só na primeira mensagem do contato e nunca sobrescreve uma origem já gravada. Nenhum dado pessoal viaja nele.",
      "Só envia conversão de negócio que veio de anúncio.",
    ],
  },

  "/app/settings/meta-ads": {
    oQueE:
      "Conecta a sua conta de anúncios da Meta para o sistema ler o desempenho das campanhas e mostrá-lo em Análise › Meta Ads. A conexão é só de leitura: nada é criado, pausado ou alterado na sua conta de anúncios.",
    comoUsar: [
      "Gere um token de acesso no Meta for Developers, na sua conta de aplicativo. Ele precisa da permissão “ads_read”.",
      "Cole o token em “Token de acesso”.",
      "Se quiser, preencha “Conta padrão (opcional)”, com o formato act_ seguido de números. É a conta que a tela de Meta Ads abre primeiro. Em branco, abre a primeira conta ativa que o token alcançar.",
      "Clique em “Salvar”.",
      "Para trocar só a conta padrão, deixe o campo do token em branco: o token guardado é mantido.",
      "Para desfazer a conexão, clique em “Desconectar”.",
    ],
    cuidados: [
      "Só administrador abre esta tela.",
      "Token gerado sem a permissão “ads_read” conecta e salva normalmente, e só falha na hora de abrir a tabela de campanhas.",
      "O token fica guardado criptografado e nunca é mostrado de volta.",
      "“Desconectar” apaga o token guardado. A tela de Meta Ads volta a pedir conexão, e nenhum dado histórico é perdido, porque nada é armazenado aqui.",
      "Esta conexão é para ler desempenho. Devolver vendas ao anúncio é outra tela, “Conversões”.",
    ],
  },

  "/app/settings/marca": {
    oQueE:
      "Troca o nome, a cor e o logo que a sua empresa mostra para quem trabalha dentro do sistema.",
    comoUsar: [
      "Em “Nome da sua empresa”, escreva o nome que deve aparecer no menu lateral. Em branco, vale o padrão.",
      "Em “Cor da sua marca”, escreva um código de cor (por exemplo, #7a5cd6) ou use “Escolher a cor visualmente”. Em branco, volta à cor que o sistema já usa.",
      "Confira a prévia dos botões nos modos claro e escuro e o bloco “De onde vem cada coisa”, que diz se nome, cor e logo vêm de você, do padrão do sistema ou de quem instalou.",
      "Clique em “Salvar”. Aparece “Marca salva.”",
      "Para o logo, use o campo “Logo” (PNG ou JPG; SVG não é aceito) e, se quiser, “Logo para o tema escuro (opcional)”. Há também o “Ícone da aba”, uma imagem quadrada para o navegador e o aplicativo instalado. Logo e ícone são enviados na hora, sem precisar do “Salvar”.",
    ],
    cuidados: [
      "Só administrador abre esta tela.",
      "Marca própria é recurso a partir do plano Escala. Em plano menor, ao salvar a tela mostra a recusa “Só quem administra esta empresa pode mudar a marca”, mesmo para o administrador.",
      "Se a cor escolhida não tem contraste suficiente, a tela avisa e o sistema continua com a cor que já usa.",
      "O título da aba do navegador continua com o nome do sistema.",
      "A tela de entrada (login) é sempre a do sistema, porque ali ainda não dá para saber de qual empresa a pessoa é.",
      "Os e-mails do sistema (convite da equipe, pedidos de LGPD) já saem com o nome da sua empresa. O aplicativo de verificação em duas etapas continua registrando o nome do sistema.",
    ],
  },

  "/app/settings/billing": {
    oQueE:
      "A tela “Plano e cobrança”: mostra o seu plano, o estado da assinatura, quanto do plano você já usou e leva você à página de planos. É onde se cancela a assinatura.",
    comoUsar: [
      "Em “Assinatura Atual” você vê o nome do plano, o ciclo (Mensal, Trimestral ou Anual), o estado e a data em que a assinatura renova.",
      "O estado aparece numa etiqueta: Ativo, Em Período de Teste, Pagamento Atrasado, Suspenso, Cancelado ou Período encerrado.",
      "Em “Limites do Plano” veja o uso de cada limite: números de WhatsApp, agentes de IA, chatbots ligados, funis e usuários da equipe. Ali o uso de IA aparece como “Sem limite”.",
      "Em “Recursos do plano” veja o que está “Incluído” e o que é “A partir de” Impulso ou Escala.",
      "Para contratar ou trocar de plano, clique em “Ver outros planos”. Abre a página de planos do site chataionline.io em outra aba, já vinculada à sua empresa. Escolha o plano e pague por lá (o pagamento é pelo Asaas, com Pix, boleto ou cartão).",
      "Se houver cobrança em aberto, aparece o botão “Pagar a fatura em aberto”.",
      "Para cancelar, clique em “Cancelar assinatura”. A tela oferece “Falar com o suporte” antes e, se decidir, “Cancelar agora”.",
      "Sem plano nenhum, a tela mostra “Nenhuma assinatura ativa” e o botão “Escolher um plano”.",
    ],
    cuidados: [
      "Só administrador abre esta tela. O assistente não altera plano nem cobrança; quem faz é o administrador, aqui e na página de planos.",
      "Esta tela não troca o plano por dentro do sistema: a troca e o pagamento acontecem na página de planos do site.",
      "Os planos são Essencial, Impulso e Escala. O Escala é sob proposta: o cliente conversa com a equipe, que combina o pacote e ativa o plano manualmente. Ele não passa pelo pagamento do site.",
      "Existe teste grátis de 7 dias, e nele a etiqueta mostra “Em Período de Teste”. Se o teste vence sem pagamento, a etiqueta passa a “Período encerrado”, o uso do sistema é bloqueado e continuam abertas só as telas Plano e cobrança, Organização, Perfil e Segurança. O pedido de pagamento pendente aparece aqui, no botão “Pagar a fatura em aberto”. Os dados ficam preservados.",
      "Se você mudar para um plano menor, nada do que já existe é apagado: só não dá para criar mais até voltar ao limite.",
      'O plano limita os usuários da equipe (os números de cada plano estão na seção Planos; os da conta dele, em "Sobre este cliente"). Convites válidos reservam vaga até serem aceitos, revogados ou expirarem. Agentes de IA não ocupam vaga.',
      "Cancelada a assinatura, a tela mostra “Assinatura cancelada” e, se houver, até quando o acesso vale.",
      "Pedidos de reembolso e dúvidas de cobrança vão para o suporte, porque a tela não faz reembolso.",
    ],
  },

  "/app/lgpd/requests": {
    oQueE:
      "A lista dos pedidos de privacidade ligados à LGPD: exportação de dados de um cliente e anonimização (apagar os dados pessoais) de um cliente ou da empresa. Aqui o administrador acompanha o prazo de cada pedido e aprova.",
    comoUsar: [
      "Use os filtros “Status”, “Tipo” e “SLA” para achar um pedido. “Limpar filtros” volta ao começo.",
      "Os tipos são “Solicitação dados”, “Anonimização cliente” e “Anonimização tenant”. Os status são Recebido, Processando, Concluído, Falhou e Revisão pendente. O prazo aparece em “Vence” e a situação em Vencido, Crítico, Alerta ou OK.",
      "Clique em “Ver” na linha para abrir o pedido. Lá estão a linha do tempo do prazo, os detalhes e a trilha de auditoria.",
      "Para conferir o que seria afetado, clique em “Pré-visualizar dados”. Valores sensíveis aparecem ocultados ou mascarados.",
      "Quando o pedido está em “Recebido”, aparece o botão de aprovar (“Aprovar export” ou “Aprovar anonimização”). Escreva a justificativa, com pelo menos 10 caracteres, e clique em “Confirmar aprovação”. O pedido passa a Processando.",
      "Quando a exportação fica pronta, aparece o botão “Baixar PDF”.",
    ],
    cuidados: [
      "Só administrador abre esta tela.",
      "Anonimização é irreversível: os dados pessoais são anonimizados e o histórico de datas é preservado. Na anonimização da empresa (“tenant”), isso afeta todos os contatos.",
      "O relatório de exportação em PDF expira em 72 horas depois de gerado.",
      "Um aviso no topo aparece quando algum pedido está com prazo vencido ou a menos de 2 dias, ou com mais de 50% do prazo consumido.",
      "Esta tela só lista, mostra e aprova. Não há botão para criar pedido.",
    ],
  },

  "/app/settings/api-tokens": {
    oQueE:
      "Cria e cancela chaves de acesso (tokens) para outro sistema, ou um agente de IA externo, conversar com o seu CRM.",
    comoUsar: [
      "Clique em “Criar token”.",
      "Dê um nome (por exemplo, “Worker de import”).",
      "Marque o que o token pode fazer: ler ou criar e editar contatos, ler ou criar e editar leads, ler ou enviar mensagens, ler o log de auditoria e as permissões de agentes de IA (“podem LER o CRM (MCP)” e “podem AGIR no CRM (MCP)”).",
      "Se quiser, informe “Expira em (dias) — opcional”.",
      "Clique em “Criar”. Aparece “Token criado”: copie com “Copiar para clipboard” e guarde agora, em local seguro.",
      "Para desativar um token, clique em “Revogar” na linha dele. A tabela mostra Nome, Prefixo, Escopos, Expira e se está Ativo ou Revogado.",
    ],
    cuidados: [
      "Só administrador abre esta tela.",
      "O token completo aparece uma única vez, na criação. Depois, só o prefixo fica visível. Se perder, crie outro e revogue o antigo.",
      "É preciso marcar pelo menos um item (“Selecione ao menos um escopo.”). Dê só o que a integração precisa.",
      "O uso da API depende do plano: “API” começa no plano Impulso. Em plano sem esse recurso, a criação do token é recusada.",
      "Para agentes de IA usarem o CRM por MCP, o token precisa de leitura e/ou ação (MCP). Sem isso, as chamadas falham.",
    ],
  },

  "/app/settings/voip-trunk": {
    oQueE:
      "Guarda as credenciais do provedor de telefonia (SIP) usadas nas chamadas de voz por IA. É uma configuração técnica.",
    comoUsar: [
      "Preencha “Host”, “Porta”, “Usuário” e “Senha” com os dados do seu provedor SIP.",
      "Se o provedor pedir, preencha “From-domain (opcional)” e o IP público da VPS.",
      "Deixe “Ativo” marcado para usar este provedor.",
      "Clique em “Salvar”. Logo depois aparece o bloco “Cole em asterisk/pjsip.conf”, que quem cuida do servidor aplica no arquivo indicado.",
      "Para trocar só outro campo, deixe “Senha” em branco: a atual é mantida.",
    ],
    cuidados: [
      "Gerente vê a tela; só administrador consegue salvar.",
      "Aplicar o bloco no servidor ainda é manual (“a aplicação ainda é manual”). Salvar aqui sozinho não coloca a telefonia no ar. Peça a quem cuida da instalação.",
      "O bloco com a configuração completa só aparece logo depois de salvar, porque a senha não é guardada em claro. Copie nessa hora; depois ele não pode ser reconstruído.",
      "Da senha, a tela guarda e mostra só os últimos quatro dígitos.",
    ],
  },

  "/app/extensions": {
    oQueE:
      "Extensões são guias que orientam o trabalho no CRM. Aqui você vê as instaladas, ativa ou desativa para a sua empresa e, quem cuida da instalação, admite um catálogo e instala, atualiza ou remove.",
    comoUsar: [
      "A aba “Instaladas” lista o que já foi instalado na plataforma. A aba “Catálogo” mostra o que está disponível para instalar, com busca por nome ou descrição e filtro por categoria.",
      "Para usar uma extensão instalada, o administrador da empresa liga a chave “Ativa no CRM”. Os guias passam a aparecer no hub do CRM.",
      "Também dá para ajustar a “Densidade dos cards” (Confortável ou Compacta) e “Mostrar descrição nos cards”, e clicar em “Salvar configuração”.",
      "Para ler o guia, clique em “Abrir guia”.",
      "Quem cuida da instalação usa “Admitir catálogo” (arquivo JSON de até 512 KiB, de uma fonte confiável) e depois instala, atualiza, troca de versão, desfaz a última troca ou remove a extensão de todas as organizações.",
    ],
    cuidados: [
      "Extensão aqui é guia: orienta o trabalho, só abre Tarefas e não recebe dados do CRM nem executa código de terceiros.",
      "Instalar, atualizar e remover é do responsável pela instalação da plataforma. O administrador da empresa só ativa e configura.",
      "Se a instalação ainda não tem extensões, a tela diz “Nenhuma extensão instalada”.",
      "Remover é para todas as organizações e não tem desfazer. Reinstalar exige que o catálogo esteja no ar, e cada empresa precisa ativar de novo.",
      "No modo de acompanhamento (suporte), não dá para configurar extensões.",
    ],
  },

  "/app/integracao-dados": {
    oQueE:
      "Conecta um banco de dados de outro sistema (um segundo CRM, um ERP, uma planilha em PostgreSQL) para o agente de IA consultar em tempo real, por exemplo pedido, assinatura, matrícula ou saldo. A conexão é sempre somente leitura.",
    comoUsar: [
      "Clique em “Conectar banco de dados” (ou “Nova conexão”).",
      "Preencha “Nome da conexão”, “Host”, “Porta”, “Banco de dados”, “Usuário” e “Senha”.",
      "Em “Segurança da conexão (TLS)”, deixe “Obrigatório (padrão)” se não souber o que escolher.",
      "Ajuste “Limites de leitura” só se precisar: “Linhas por consulta”, “Filtros por consulta” e “Resposta para a IA (KB)”.",
      "Clique em “Salvar” e depois em “Testar” na linha da conexão. O selo mostra Conectada, Falha no último teste, Não testada ou Desativada.",
      "Clique em “Explorar” para olhar as tabelas e os dados do banco conectado.",
      "Para o agente parar de usar a fonte sem apagar o cadastro, edite e desmarque “Conexão ativa”. Para apagar, “Remover”.",
    ],
    cuidados: [
      "É um módulo opcional da instalação, desligado por padrão. Se quem cuida do servidor não ligou, a tela não existe e dá “página não encontrada”.",
      "Qualquer pessoa da equipe vê a lista e consulta os dados; só administrador cria, edita e remove conexões.",
      "Criar conexão faz parte de “Integrações avançadas”, recurso do plano Escala.",
      "A senha é cifrada antes de gravar e nunca é mostrada de volta. Ao editar, preencha “Senha” só se quiser trocar.",
      "O agente só lê. Nada que ele faz altera o banco de origem. “Remover” apaga só a conexão e a senha guardada aqui.",
      "“Sem TLS (rede local confiável)” só serve para rede interna de confiança.",
    ],
  },
};

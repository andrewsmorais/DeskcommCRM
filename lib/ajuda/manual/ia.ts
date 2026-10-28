import type { ManualDoGrupo } from "@/lib/ajuda/manual/tipos";

/**
 * Manual do grupo "ia" do menu (Agente de IA).
 *
 * Cada texto abaixo foi conferido contra a tela: os nomes entre aspas são os
 * que aparecem para o cliente. Limites de plano vêm de `lib/billing/catalogo.ts`
 * (agentes e chatbots: números na tabela de Planos do prompt, vinda do catálogo).
 */
export const MANUAL_IA: ManualDoGrupo = {
  "/app/ai/agents": {
    oQueE:
      "Aqui você cria e cuida dos agentes de IA: assistentes que conversam com seus clientes no WhatsApp, entendem o que a pessoa quer e respondem sozinhos, seguindo as instruções que você escreve.",
    comoUsar: [
      "Clique em “Novo agente”. Se quiser um ponto de partida, escolha em “Qual é o objetivo deste agente?” entre Atendimento, Vendas, Suporte ou Agendamento e clique em “Aplicar modelo inicial”. Ele preenche nome, instruções e capacidades, e você revisa tudo antes de salvar.",
      "Em “Quem é este agente”, preencha o “Nome” (obrigatório) e, se quiser, a “Descrição”. A “Ordem de preferência (0 a 1000)” só importa se mais de um agente puder atender a mesma conversa: o de número maior tenta primeiro. Com um agente só, deixe como está.",
      "Em “As instruções dele”, escreva como o agente deve atender: quem ele é, o que o negócio vende, o tom de voz e quando chamar uma pessoa. Precisa de pelo menos uma frase e cabe até 20.000 caracteres (o contador aparece ao lado).",
      "Em “Estilo de resposta”, ligue “Responder em várias mensagens curtas (como uma pessoa digita)” se quiser que a resposta saia em vários balões em vez de um bloco só. Dá para definir o “Tamanho máximo por bolha (80–4000)”.",
      "Em “O que o agente pode fazer”, ligue as capacidades por pacotes, como “Atender e responder”, “Vender e mover o funil”, “Não perder o cliente” e “Passar para um humano”. As capacidades de efeito que não dá para desfazer não ligam com o pacote: precisam ser ligadas uma a uma. Quem prefere detalhar usa “Escolher uma a uma (modo avançado)”.",
      "Em “Quando ele entra em ação”, decida o que faz o agente responder: dá para marcar “Não responder em grupos”, “Só atender em horário de funcionamento” (com fuso, início, fim e dias) e “Só responder quando a mensagem falar de algo específico (opcional)”.",
      "Em “O que ele consulta antes de responder”, marque os materiais que o agente pode ler (eles são cadastrados em IA › Conhecimento). Em “Por qual número ele atende”, escolha o “Número conectado”. Em “Passar para uma pessoa” e “Pedir ajuda sem sair da conversa” você decide quando ele chama a equipe.",
      "Clique em “Criar agente” (na primeira vez) ou em “Salvar rascunho” (nas próximas). O que você salva fica como rascunho: ainda não atende cliente.",
      "Abra a aba “Teste”, escreva uma mensagem em “Mensagem do cliente (sample)” e clique em “Executar teste”. Você vê a resposta, as ferramentas que o agente usaria e as verificações da resposta. Nenhuma mensagem é enviada ao WhatsApp. A aba só fica disponível depois que existe uma versão salva.",
      "Quando estiver satisfeito, clique em “Publicar” (ele mostra o número da versão, como “Publicar v1”) e confirme. A versão publicada é a que atende de verdade. Um selo na lista mostra “Publicado” ou “Rascunho”.",
      "Para ele responder de verdade, o número precisa estar conectado: se o botão de publicar estiver bloqueado, a tela escreve o motivo logo abaixo (por exemplo, falta escolher o número ou o número está desconectado). Conecte o número em Conexões e volte aqui.",
      "Na lista de agentes, o menu de três pontinhos de cada cartão permite “Editar”, “Duplicar”, “Renomear”, “Pausar” (ou “Despausar”) e “Arquivar”. Na página do agente, “Operação do agente” escolhe entre “Assistido: revisar antes de enviar” (a IA só sugere e uma pessoa aprova o envio) e “Automático: responder com as regras do agente”. O botão “Pausar automático” para as respostas automáticas sem perder a versão publicada.",
      "As outras abas da página do agente ajudam a acompanhar: “Capacidades” (o que ele já usou), “Execuções” (cada atendimento que ele fez), “Histórico” (todas as versões, com “Diff” para comparar e “Reverter” para voltar a uma anterior) e “Propostas” (melhorias que o assistente sugere para si mesmo).",
    ],
    cuidados: [
      "Agente de IA é diferente de chatbot. O agente conversa de forma livre, entende o que o cliente escreve e responde com as próprias palavras, e por isso tem custo de IA (aparece em IA › Uso e orçamento). O chatbot (menu Chatbots) segue um fluxo de passos que você desenha, sem IA e sem custo de IA.",
      'O limite de agentes depende do plano (os números de cada plano estão na seção Planos; os da conta dele, em "Sobre este cliente"). Agentes arquivados não contam. Ao atingir o limite, criar ou duplicar mostra o aviso para mudar de plano (Configurações › Plano e cobrança) ou arquivar um agente.',
      "Quem é gerente consegue abrir e ver os agentes (o botão aparece como “Visualizar”), mas criar, editar, publicar, pausar e arquivar é só para administrador.",
      "Neste sistema a empresa de IA, o modelo e a chave de acesso são da plataforma, então os campos “A inteligência que ele usa” e “Freios de segurança” não aparecem para o cliente. Se a tela avisar que “A inteligência artificial ainda não está pronta nesta conta”, o caminho é falar com o suporte.",
      "O pacote “Organizar a operação” (agente que organiza o CRM sozinho) é do plano Impulso em diante. No Essencial, o agente só usa as capacidades desse pacote que também servem para vender e atender.",
      "Há um teto de 27 capacidades ligadas por agente. Acima disso o agente erra na hora de escolher o que usar.",
      "Agente arquivado não responde mais e a tela não oferece desarquivar. O agente padrão da organização não pode ser arquivado.",
      "Sem número escolhido, o rascunho salva, mas o agente não atende. Se o agente é acionado por um roteador (IA › Roteadores), o campo de número não se aplica.",
      "Os fluxos de follow-up só funcionam para esse agente se, na seção “Follow-up”, estiver ligado “Habilitar gatilhos automáticos de follow-up” e os fluxos publicados estiverem escolhidos. Follow-up automático é do plano Impulso em diante.",
    ],
  },

  "/app/ai/followups": {
    oQueE:
      "Follow-up é uma sequência automática de mensagens para retomar quem parou de responder, para nenhum interessado sumir sem ninguém perceber. Aqui você monta os fluxos e acompanha quem está na fila.",
    comoUsar: [
      "Na aba “Fluxos”, clique em “Novo fluxo”, dê um nome (por exemplo, “Recuperação de carrinho abandonado”) e crie. O fluxo nasce como rascunho e abre no editor visual.",
      "Se preferir não começar do zero, clique em “Começar de um modelo”. Em “Modelos prontos” você vê quantas mensagens o modelo manda, por quanto tempo acompanha e quando dispara. Alguns pedem a “Etapa do funil que dispara”. Clique em “Instalar”.",
      "No editor, o painel “Adicionar nó” traz as peças: Gatilho, Aguardar, Condição, Classificar (IA), Resposta (texto), Repetir, Ação, Lembrete interno e Fim. Clique na peça (ou arraste) e ligue uma na outra, do Gatilho até o Fim.",
      "Clique no botão do gatilho no topo para escolher o “Tipo de gatilho”: Manual, Silêncio, Etapa do funil, Falta confirmada pela equipe, Agente pediu ajuda, Cliente voltou, Lead criado ou Automação (Webhooks). Preencha o que ele pedir (por exemplo, os minutos de silêncio) e clique em “Salvar gatilho”.",
      "Para mandar mensagem, use o nó “Ação”. Em “Como escrever a mensagem” escolha entre “Texto fixo”, “Mensagem escrita pela IA” e “Modelo de mensagem pronto”. Passadas 24 horas sem resposta do cliente, só chega um modelo aprovado no WhatsApp.",
      "Use “Aguardar” para dar um tempo entre as mensagens e “Condição” para seguir por caminhos diferentes. Em “Política de handoff” escolha o que acontece quando uma pessoa assume a conversa: pausar, cancelar ou permitir.",
      "Clique em “Salvar” e depois em “Publicar”. Se o fluxo for reprovado na validação, a tela destaca os nós que precisam de correção. Fluxo que não foi publicado não roda.",
      "Para o agente usar o fluxo, abra o agente (IA › Agentes), vá na seção “Follow-up”, ligue “Habilitar gatilhos automáticos de follow-up” e escolha o fluxo em “Fluxos publicados”. Depois publique o agente.",
      "Na aba “Fila” você vê quem está esperando: contato, fluxo, em que passo está, o “Próximo disparo” e o status. Dá para buscar pelo contato, filtrar por status e por fluxo, e cancelar um follow-up ou um retorno prometido pela IA com o botão “Cancelar”.",
    ],
    cuidados: [
      "Follow-up automático é do plano Impulso em diante. No Essencial, a tela avisa que o recurso não está no plano.",
      "A tela é para gerentes e administradores.",
      "Cancelar um follow-up na fila não tem como desfazer: a pessoa não recebe mais as mensagens daquele fluxo. Cancelar um retorno prometido avisa o agente de que você desmarcou.",
      "“Excluir” um fluxo apaga também as inscrições e as versões dele, sem volta. No menu de cada fluxo existem ainda “Renomear” e “Duplicar”.",
      "O gatilho por etapa do funil não é instantâneo: a entrada na fila leva poucos minutos. O gatilho “Agente pediu ajuda” pede que o fluxo comece por uma espera, para o cliente não receber duas mensagens ao mesmo tempo.",
      "O botão “Desativar” para o fluxo e “Rollback” volta para a versão publicada anterior, quando existe.",
    ],
  },

  "/app/ai/atendimento": {
    oQueE:
      "Fluxos de atendimento são roteiros de perguntas que a IA faz durante a conversa, uma por vez e em ordem, guardando cada resposta na ficha do cliente.",
    comoUsar: [
      "Clique em “Novo fluxo de atendimento” e dê um nome. Ele nasce como rascunho e você cadastra as perguntas e a finalização no editor.",
      "No Início, escreva as palavras-gatilho: quando a mensagem do cliente tiver uma delas, o roteiro começa sozinho. Ele também pode começar por uma intenção configurada em IA › Roteadores.",
      "Adicione uma “Pergunta” para cada dado que quer coletar. Preencha a pergunta, a chave do campo (minúsculas e sem espaço, como cidade), o “Tipo da resposta” (texto livre, número, data, sim ou não, escolha numa lista ou CPF), se é “Obrigatória” e se vai “Permitir correção”.",
      "Se quiser, adicione uma “Skill”, um procedimento da empresa que a IA usa naquele passo. Só dá para escolher entre as skills já instaladas em IA › Skills.",
      "Ligue as caixas em linha, do Início ao “Fim”. No Fim, em “Ao concluir, o que fazer”, escolha o que acontece quando o cliente responde tudo.",
      "Salve e publique. As respostas ficam nos campos do cliente e aparecem na ficha dele e na conversa.",
    ],
    cuidados: [
      "Este recurso é um módulo opcional, desligado por padrão. Se a tela não aparece para você, ele não foi ligado nesta instalação. Peça ao suporte.",
      "A IA só grava uma resposta que esteja escrita na mensagem do cliente. Se o cliente já disse o dado antes da pergunta, ela registra sem perguntar. O que o cliente já respondeu não é perguntado de novo.",
      "O roteiro para quando uma pessoa assume a conversa, quando o cliente pede para parar e depois do prazo sem resposta (72 horas, se você não mudar).",
      "Roteiro de atendimento só aceita as peças Pergunta, Skill e Fim. Para mandar mensagens de retomada, use IA › Follow-ups.",
    ],
  },

  "/app/ai/routers": {
    oQueE:
      "O roteador entende o que o cliente quer e entrega a conversa para o agente certo. Só faz sentido quando você tem mais de um agente atendendo o mesmo número de WhatsApp.",
    comoUsar: [
      "Clique em “Novo roteador” (ou “Criar meu primeiro roteador”), dê um nome e escolha o “Número de WhatsApp”. Clique em “Criar roteador”.",
      "Na página do roteador, clique em “Intenção” (o botão com sinal de mais) para cada coisa que o cliente pode querer. Em cada intenção, preencha o “Nome da intenção” (por exemplo, quer comprar), o “Agente que atende”, e em “Quando escolher esta intenção” descreva em palavras simples quando ela vale.",
      "Em “Frases de exemplo (opcional)”, digite frases reais que o cliente costuma mandar e aperte Enter. Quanto mais exemplos, mais o roteador acerta.",
      "Em “Se nenhuma intenção casar”, escolha o “Agente de fallback”. Sem fallback, a conversa cai no atendimento padrão.",
      "Em “Modelo que identifica a intenção” pode deixar “Automático”.",
      "Ligue a chave de ativo (“Ativo — está roteando as conversas deste número”) e clique em “Salvar”.",
      "Use o cartão “Testar classificação”: escreva uma frase de cliente e veja qual intenção foi escolhida, com que confiança e qual agente atenderia. O teste só funciona com o roteador ativo.",
    ],
    cuidados: [
      "Só é possível ter um roteador ativo por número. O número não pode ser trocado depois de criado: para outro número, crie outro roteador.",
      "Gerentes conseguem ver os roteadores. Criar, editar, ativar e excluir é só para administrador.",
      "Cada intenção precisa de agente, nome e descrição, e dois nomes de intenção não podem ser iguais. A tela marca o que falta antes de deixar salvar.",
      "Se a confiança da escolha ficar abaixo do mínimo, a conversa cai no atendimento padrão (o teste mostra isso).",
      "Se um agente é acionado por roteador, o campo de número na tela do agente deixa de valer.",
      "Com um agente só, você não precisa de roteador.",
    ],
  },

  "/app/ai/credentials": {
    oQueE:
      "Lista as chaves de acesso a empresas de inteligência artificial (como OpenAI ou Claude) que a sua conta cadastrou. A chave fica guardada com segurança e nunca mais aparece na tela depois de salva.",
    comoUsar: [
      "Clique em “Adicionar credencial”.",
      "Escolha o “Provedor”, cole a “Chave” e, se quiser, dê um “Nome” (por exemplo, Chave da clínica). O link “Onde pegar a chave” explica onde gerar. Alguns provedores pedem também o “Endereço (base URL)”.",
      "Clique em “Salvar e validar”. A conferência com o provedor acontece em segundo plano e o cartão mostra se a chave foi validada e quantos modelos ela libera.",
      "No cartão da chave, use os ícones para “Editar credencial” (trocar o nome ou colar uma “Nova chave (opcional)”; em branco mantém a atual), “Revalidar credencial” e “Excluir credencial”.",
    ],
    cuidados: [
      "Neste sistema a chave de IA dos agentes é da plataforma, configurada pelo dono da instalação. Você não precisa cadastrar chave aqui para os seus agentes funcionarem, e na tela do agente a escolha de empresa, modelo e chave nem aparece para o cliente.",
      "A tela aparece para gerentes e administradores, mas só o administrador adiciona, edita ou exclui chaves.",
      "Uma chave em uso por versões de agente não pode ser excluída. Para trocar a chave, use “Editar credencial”.",
      "Se tiver dúvida sobre qual chave usar, fale com o suporte antes de mexer: chave errada ou inválida pode impedir um agente de responder.",
    ],
  },

  "/app/ai/providers": {
    oQueE:
      "Mostra em quantos lugares o sistema usa inteligência artificial e qual modelo atende cada um. É uma tela técnica, para quem administra a conta.",
    comoUsar: [
      "Veja o quadro “Provedores de IA”: ele lista os lugares onde a IA é usada e o modelo em uso em cada um.",
      "Em “Modelo padrão”, escolha o “Provedor” e o “Modelo” e clique em “Salvar padrão” para trocar de uma vez todos os pontos que você não configurou individualmente.",
      "Para ajustar um ponto específico, abra “Configuração avançada” do grupo, escolha o provedor, o modelo e a chave, e clique em “Salvar”.",
      "Pontos marcados com “precisa de ferramentas” só aceitam modelos que usam ferramentas.",
    ],
    cuidados: [
      "Esta tela aparece para gerentes e administradores, mas só o administrador salva mudanças. Se você não sabe o que trocar, deixe como está: neste sistema a inteligência dos agentes é definida pela plataforma.",
      "O modelo de cada agente do cliente não é escolhido aqui: o ponto de atendimento usa o modelo definido na versão publicada do agente.",
      "Se a tela avisar que você ainda não cadastrou a chave da sua IA principal, o atendimento continua usando a chave que veio na instalação.",
      "Trocar o modelo padrão muda todos os pontos de uma vez. Prefira não mexer sem orientação do suporte.",
    ],
  },

  "/app/ai/knowledge/sources": {
    oQueE:
      "É o acervo do que o agente sabe sobre o seu negócio: perguntas e respostas, políticas, tabelas de preço. O agente consulta esse material antes de responder, em vez de inventar.",
    comoUsar: [
      "Clique em “Adicionar material”.",
      "Em “Que tipo de material é”, escolha “Perguntas e respostas” (as dúvidas que se repetem, com a resposta pronta) ou “Documento” (política de troca, tabela de preços, manual).",
      "Dê o “Nome do material”. Em Perguntas e respostas, escreva com uma linha “## Pergunta:” e uma linha “## Resposta:” por item, com uma linha em branco entre eles. Em Documento, envie um arquivo (PDF, Markdown, CSV ou texto, até 20 MB) ou cole o texto.",
      "Clique em “Adicionar ao acervo”. O sistema prepara o material em segundo plano; quando fica pronto, o cartão mostra os “Trechos que o agente encontra”.",
      "No cartão do material, use “Ver o que ele aprendeu”, “Preparar de novo” (se você mudou algo) ou “Arquivar” o que não vale mais. Se o material não foi aproveitado, “Por que não entrou” explica o motivo.",
      "Depois, vá em IA › Agentes, abra o agente e, em “O que ele consulta antes de responder”, marque os materiais que ele pode usar. Salve e publique o agente.",
      "O botão “Preparar tudo de novo” refaz o preparo de todos os materiais.",
    ],
    cuidados: [
      "Cadastrar o material não basta: cada agente só lê o que foi marcado na tela dele.",
      "PDF só de imagens escaneadas não tem letra para ler. Envie uma versão com texto selecionável. Planilha do Excel precisa ser salva como CSV antes.",
      "Os tipos “Conversas anteriores” e “Catálogo de produtos” entram sozinhos pelo sistema e não são preenchidos aqui.",
      "Se aparecer o aviso “Falta uma chave de embedding para o agente aprender o seu material”, o material fica esperando e não é preparado. Fale com o suporte.",
      "Material arquivado não é consultado por nenhum agente, mas não é apagado.",
      "Mantenha o texto atualizado: o agente responde com o que está no material.",
    ],
  },

  "/app/ai/memory": {
    oQueE:
      "A memória guarda regras e aprendizados que todos os agentes da sua empresa seguem em qualquer conversa, como horário de atendimento e como tratar o cliente. Não é configuração de um agente só.",
    comoUsar: [
      "Em “Documento da organização”, escreva as regras gerais, por exemplo: nunca prometa desconto sem confirmar com um humano, horário de atendimento, chamar o cliente pelo primeiro nome.",
      "Clique em “Publicar versão”. Ela passa a valer para todos os agentes e a anterior fica guardada em “Histórico de versões”.",
      "Para voltar a um texto antigo, clique numa versão do histórico e em “Restaurar como nova versão”; depois publique.",
      "Em “Aprendizados”, clique em “Novo aprendizado” para registrar um fato ou uma correção pontual: um “Título” e o texto em “O que o agente deve saber”. Clique em “Salvar aprendizado”.",
      "Os aprendizados aparecem com a origem (manual, anotado pelo agente ou aprendido automaticamente). Use “Arquivar” para tirar um da lista de ativos e “Reativar” para trazê-lo de volta.",
    ],
    cuidados: [
      "Só administrador publica nova versão do documento. Gerente consegue ver a tela.",
      "A memória vale para todos os agentes: não escreva nela o que só vale para um agente. Isso vai nas instruções do próprio agente.",
      "Preços, prazos e políticas detalhadas ficam melhor no Conhecimento do que na memória.",
    ],
  },

  "/app/ai/skills": {
    oQueE:
      "Skills são habilidades especializadas que os agentes carregam só quando a conversa pede, como um procedimento de agendamento ou de resposta a objeção de preço. Você instala as prontas do catálogo ou envia a sua.",
    comoUsar: [
      "Em “Catálogo”, veja as skills prontas e clique em “Instalar” na que quiser. Ela passa a valer para os agentes da organização.",
      "Em “Skills instaladas”, veja o que já está ativo. O selo mostra se veio “do catálogo” ou se é “manual”.",
      "Para adaptar uma skill, clique em “Editar”. Preencha a “Descrição (aparece no índice do agente)”, as “Palavras-chave de ativação (separe por vírgula)” e o “Corpo (o procedimento que o agente segue)”. A skill é carregada quando o cliente escreve uma dessas palavras.",
      "Salve. Se errar, abra o “Histórico de versões” da skill e use “Restaurar” numa versão anterior.",
      "Para usar uma skill sua, clique em “Enviar skill (.zip)”.",
      "“Desinstalar” tira a skill dos agentes.",
    ],
    cuidados: [
      "Skills são do plano Impulso em diante. No Essencial, instalar, enviar e editar são bloqueados.",
      "A tela é para gerentes e administradores.",
      "O corpo da skill tem um limite de linhas, mostrado no contador do editor, e não pode ficar vazio. A skill precisa de pelo menos uma palavra-chave e de uma descrição.",
      "Mudou a skill, mudou para todos os agentes: ela vale para toda a organização.",
    ],
  },

  "/app/ai/cases": {
    oQueE:
      "Quando a IA esbarra em algo que só uma pessoa resolve, como aprovar um desconto, ela abre um caso aqui e continua conversando com o cliente enquanto espera a sua resposta.",
    comoUsar: [
      "Na aba “Abertos” estão os casos que esperam alguém; em “Concluídos”, os que já foram resolvidos, cancelados ou repassados. O número ao lado de “Abertos” mostra quantos esperam.",
      "Clique num caso à esquerda. À direita aparecem o contato, “O que o cliente precisa”, “Por que a IA travou” e a “Linha do tempo”.",
      "Em “O que você quer fazer?”, escolha: “Concluí” (a IA avisa o cliente e encerra o assunto), “Preciso de info do cliente” (a IA pergunta ao cliente e o caso volta para você quando ele responder) ou “Não consigo — passar pra humano” (a conversa vira atendimento humano de verdade).",
      "Escreva a resposta para a IA e clique em “Enviar”.",
      "Se precisar entender melhor antes de decidir, use “Conversar sobre o caso” e “Pergunte antes de decidir” para fazer perguntas à IA sobre aquele caso.",
    ],
    cuidados: [
      "Só dá para responder quando o caso está “Aguardando você”. Nos outros estados (“Aguardando o cliente”, “Concluído”, “Virou atendimento humano”, “Cancelado”) o painel fica desabilitado e explica o motivo.",
      "O agente só abre caso se, na tela dele, estiver ligado “Deixar o agente pedir uma tarefa a alguém e seguir conversando”.",
      "Caso não é passar a conversa para uma pessoa: o agente continua atendendo. Quem precisa que o agente largue a conversa usa a opção de passar para uma pessoa na tela do agente.",
      "Para receber aviso no WhatsApp quando um caso abrir, o administrador configura em IA › Aviso no WhatsApp.",
    ],
  },

  "/app/ai/inbox": {
    oQueE:
      "É a Central de avisos: tudo o que o assistente precisou escalar para a equipe, como conexões caídas, tarefas que falharam e atendimentos passados para humanos. No menu o nome é “Alertas”.",
    comoUsar: [
      "Na aba “Abertos” veja o que espera por você. Os mais graves vêm primeiro; entre iguais, os mais recentes. Cada aviso tem uma marca: informativo, atenção ou crítico.",
      "Leia o título, o texto e a orientação do aviso. Quando existe um botão ou link logo abaixo, ele leva direto para onde resolver.",
      "Depois de resolver, clique em “Marcar resolvido”. Ele passa para a aba “Resolvidos”, onde dá para usar “Reabrir” se precisar.",
      "Para limpar tudo de uma vez, clique em “Marcar todos resolvidos”.",
    ],
    cuidados: [
      "Quem só pode visualizar enxerga os avisos, mas não consegue marcá-los como resolvidos. Isso é para atendentes, gerentes e administradores.",
      "Marcar como resolvido não corrige o problema: só tira o aviso da fila. Resolva a causa primeiro.",
    ],
  },

  "/app/ai/cases/avisos": {
    oQueE:
      "Configura um número de WhatsApp da equipe para receber uma mensagem toda vez que o assistente abrir um caso e precisar de uma pessoa.",
    comoUsar: [
      "Em “Conexão que envia os avisos”, escolha um dos seus números conectados. Só aparecem aqui os números que conseguem mandar mensagem a qualquer hora.",
      "Em “Número que recebe os avisos”, digite o celular de quem vai receber, começando pelo código do país. Exemplo do Brasil: +55, DDD e o número.",
      "Se quiser, em “Como chamar esse número (opcional)” escreva um nome, como Plantão da Ana.",
      "Ligue “Receber avisos no WhatsApp” e clique em “Salvar”.",
      "Clique em “Enviar aviso de teste” e confira se chegou no WhatsApp desse número.",
      "Mais abaixo, “Últimos avisos enviados” mostra o que já foi mandado, e a seção “O aviso está adiantando o atendimento?” compara os casos em que o aviso chegou com os que ficaram sem.",
    ],
    cuidados: [
      "A tela é só para administradores.",
      "Mande o aviso por um número diferente do que recebe. A tela mostra o limite de mensagens do dia do número e se ele está em aquecimento.",
      "O aviso é sobre casos abertos pela IA. Para outros alertas do sistema, olhe IA › Alertas.",
    ],
  },

  "/app/ai/proposals": {
    oQueE:
      "Lista os próximos passos que o assistente sugeriu para negócios do seu funil e que esperam a sua decisão. Aprovar e ignorar ficam registrados no negócio.",
    comoUsar: [
      "Na aba “Aguardando decisão” cada linha mostra o negócio, o contato, a etapa do funil, há quanto tempo a proposta foi feita e o texto da sugestão.",
      "Leia a sugestão e clique em “Aprovar” ou “Ignorar”.",
      "Na aba “Já decididas” aparece o histórico: o que foi aprovado ou ignorado, por quem e quando.",
    ],
    cuidados: [
      "Esta tela só registra a sua decisão no negócio. Ela não envia mensagem nem muda etapa sozinha: o passo sugerido continua sendo feito por você ou pela equipe.",
      "Ignorar é uma decisão, não falta de decisão: fica registrado para o assistente não repetir a mesma sugestão.",
      "Se a sugestão mudou enquanto você olhava, a tela avisa e pede para você ler a nova antes de decidir.",
      "Só atendentes, gerentes e administradores decidem; quem só visualiza lê a lista.",
      "Não confunda com a aba “Propostas” dentro de cada agente, que trata de sugestões de melhoria para o próprio agente.",
    ],
  },

  "/app/ai/runs": {
    oQueE:
      "Mostra o que a IA fez e, quando algo falhou, o que aconteceu e o que fazer. Serve para descobrir por que um agente parou de responder.",
    comoUsar: [
      "No topo, veja o resumo: “Nenhuma falha” nas últimas execuções, ou quantas falharam.",
      "Clique em “Ver só as falhas” para esconder as execuções que deram certo. Para voltar, clique em “Mostrando só as falhas”.",
      "Em cada execução que falhou, leia “O que aconteceu” e “O que fazer”. A “Mensagem técnica do provedor” traz o texto bruto para o suporte, se precisar.",
      "Para ver por agente, abra o agente e use a aba “Execuções”.",
    ],
    cuidados: [
      "A tela é para gerentes e administradores.",
      "Se a falha não tiver uma ação que você mesmo possa fazer, envie ao suporte o texto de “O que aconteceu”.",
    ],
  },

  "/app/ai/usage": {
    oQueE:
      "Mostra quanto a IA custou, quantos atendimentos fez, quanto demorou para responder e quantas vezes precisou chamar uma pessoa. Também define o orçamento mensal de IA.",
    comoUsar: [
      "No topo, o cartão “Orçamento mensal de IA” mostra o gasto do mês atual contra o limite, quando há um. Os valores são em dólar.",
      "Logo abaixo ficam os números dos últimos 30 dias: “Custo no período”, “Atendimentos com IA”, “Passaram para uma pessoa” e “Tempo de resposta”, seguidos de gráficos.",
      "Use os filtros “Agente”, “Tipo de uso”, “De” e “Até” para olhar um agente ou um período específico.",
      "Para definir o limite, o administrador clica em “Editar limite” e escolhe: “Só acompanhar” (a IA nunca para por gasto), “Me avisar ao passar de” uma porcentagem (aparece um aviso na Central de avisos e a IA continua respondendo) ou “Parar a IA ao chegar em” o valor.",
      "Preencha o “Limite mensal (US$)” e, se quiser aviso, o “Avisar ao chegar em (% do limite)”. Clique em “Salvar”.",
    ],
    cuidados: [
      "Só administrador edita o limite. Gerente vê os números.",
      "Se você escolher “Parar a IA ao chegar em”, quando o gasto chegar lá a IA para de responder, e a conversa fica sem atendimento automático.",
      "A parada começa a valer 72 horas depois de salvar, para você ver o aviso antes de alguma conversa parar. Existe a opção “Começar a valer agora, sem esperar as 72 horas”.",
    ],
  },

  "/app/ai/chatbots": {
    oQueE:
      "Chatbot é um fluxo automático de passos que você desenha no editor visual: mensagens, menus, perguntas, horários, transferência para a equipe. Responde no WhatsApp sem IA e sem custo de IA, bom para triagem e perguntas frequentes.",
    comoUsar: [
      "Clique em “Novo chatbot” (ou “Criar primeiro chatbot”), dê um nome, escreva uma descrição se quiser e clique em “Criar e editar”.",
      "O editor abre com um passo “Iniciar por um canal”. Clique nele e, em “Número de WhatsApp”, escolha o número (ou “Qualquer número da empresa”). Em “Quando começar”, escolha “Em toda conversa nova” ou “Só quando a mensagem tiver uma palavra-chave” e digite as palavras.",
      "Clique no botão de adicionar passo (“Adicionar passo”), ou arraste da lista, e escolha o que o fluxo faz em seguida. Tem busca em “Pesquisar passo”. Ligue um passo no outro puxando a linha de um ao outro.",
      "Clique em cada passo para configurar no painel lateral. Os grupos de passos são: Início (por canal, automação ou manual), Condição (horários, dias da semana, mensagem contém, etiquetas, primeira conversa e outras), Ação (enviar mensagem, enviar mídia, pedir para escolher, pedir para digitar, agendar horário, negócio no funil, transferir para a equipe ou para um atendente, editar etiquetas, campo do contato, criar nota, pedir avaliação, notificar atendente, entre outros), Finalização (finalizar conversa), Integrações (webhook) e Utilitários (bloco de notas).",
      "Clique em “Salvar” (ou Ctrl+S). Há “Desfazer” e “Refazer”, e o selo mostra “Alterações não salvas” ou “Tudo salvo”.",
      "Clique em “Testar” para simular o fluxo: escreva a primeira mensagem como se fosse o cliente, clique em “Começar” e converse. “Recomeçar” reinicia o teste.",
      "Quando estiver bom, ligue o botão “Desligado” no topo para “Ligado”. Se houver alterações, a tela salva antes. Aparece “Fluxo ligado: ele já responde no WhatsApp”. Para parar, desligue o mesmo botão.",
      "Na lista, cada cartão mostra o status (Rascunho, Ativo ou Arquivado), se está Ligado ou Desligado e, quando houver, a nota média de satisfação dos últimos 30 dias.",
    ],
    cuidados: [
      "Chatbot é diferente de agente de IA. O chatbot só segue o caminho que você desenhou, sem entender texto livre, e por isso não gasta IA. O agente de IA conversa livremente e tem custo de IA.",
      'O limite de chatbots ligados depende do plano (os números de cada plano estão na seção Planos; os da conta dele, em "Sobre este cliente"). Dá para ter mais fluxos criados do que ligados.',
      "Passos básicos (mensagem, mídia, menu, perguntar, horário, transferir, etiqueta, agendar, mover no funil, avaliação e finalizar) estão em todos os planos. O chatbot avançado é do plano Impulso em diante: webhook, condições da conversa, aguardar, distribuir fluxo, bloquear e excluir contato, acionar outro fluxo, iniciar follow-up e iniciar por automação. Na lista de passos eles aparecem com o selo “Plano Impulso”, e o fluxo que os usa não grava no Essencial.",
      "Cada número só tem um chatbot de entrada ligado. Se você liga um que atende o mesmo número (ou “Qualquer número da empresa”) de outro já ligado, o outro é desligado.",
      "Depois de terminar, o fluxo só recomeça na mesma conversa 6 horas depois.",
      "No teste nada é enviado ao cliente. O webhook não é chamado: você escolhe se ele “Deu certo” ou “Falhou”, e as esperas podem ser puladas.",
      "A tela é para gerentes e administradores.",
    ],
  },
};

import type { ManualDoGrupo } from "@/lib/ajuda/manual/tipos";

export const MANUAL_ATENDIMENTO: ManualDoGrupo = {
  "/app/inbox": {
    oQueE:
      "É onde você vê e responde as conversas de WhatsApp. A IA e a equipe atendem na mesma tela, e cada conversa mostra quem está no comando: uma pessoa, o automático ou ninguém.",
    comoUsar: [
      'Na coluna da esquerda, escolha a aba: "Fila" (conversas que a IA passou para a equipe e esperam uma pessoa), "Minhas", "Todas", "Fechadas", "Arquivadas" ou "Automático" (o que a IA está conduzindo). O número ao lado do nome da aba diz quantas conversas há ali.',
      'Para achar uma conversa, use o campo "Buscar por nome, telefone ou última mensagem…". Ao lado dele ficam os botões "Não lidos" e "Grupos". Se a empresa tiver 2 ou mais números, aparece também um filtro por número de WhatsApp; se houver tags, um filtro por tag.',
      'Clique na conversa para abri-la. Para você mesmo responder, clique em "Assumir": você passa a responder e o atendimento automático (a IA) para naquela conversa.',
      'Escreva em "Escreva uma mensagem…". Enter envia e Shift+Enter quebra a linha. O botão de anexar tem "Fotos e vídeos", "Documento" e "Contato". Com o campo vazio, o botão de microfone grava um áudio. Se você digitar "/" no começo, aparece a lista de respostas rápidas salvas.',
      'Para anotar algo que o cliente não deve ver, troque "Responder" por "Nota interna" acima do campo. A nota fica no histórico da conversa e só o time vê.',
      'O botão "Sugerir resposta" pede um rascunho ao agente de IA. O texto aparece para você revisar e editar; nada é enviado até você clicar em "Aprovar e enviar". "Rejeitar" descarta, e o comentário que você escrever em "Feedback para a próxima sugestão" é usado na sugestão seguinte.',
      'Para passar a conversa a outra pessoa, clique em "Transferir", escolha o atendente em "Transferir para" e, se quiser, escreva o motivo. A troca é imediata e fica registrada no histórico. A aba "Número" dessa janela serve para continuar a conversa por outro número de WhatsApp da empresa.',
      'Para devolver à IA, use "Devolver ao automático". "Liberar" solta a conversa que estava com você, deixando-a sem responsável. "Pausar o automático" aparece quando a conversa já tem dono e a IA ainda está ativa: ela para, e o dono continua o mesmo.',
    ],
    cuidados: [
      'Assumir e devolver são botões diferentes: enquanto a conversa estiver com uma pessoa, a IA fica pausada. Para a IA voltar a atender, use "Devolver ao automático". Esse botão só aparece quando há algo a devolver.',
      'Quando o selo diz "Automático pausado para este cliente", o botão "Devolver ao automático" religa a IA para todas as conversas desse cliente, não só para a atual.',
      '"Lembrar" (1 hora, 3 horas ou 24 horas) cria um lembrete interno para a equipe. Nada é enviado ao cliente.',
      '"Fechar" encerra o atendimento e "Arquivar" encerra e guarda no histórico. Se o cliente escrever de novo, a conversa volta. Em conversa fechada, o botão "Reabrir" a reativa.',
      'O menu "Opções da mensagem" (no balão) permite "Responder a esta mensagem". Nas mensagens que a equipe enviou, permite "Editar mensagem", só nos primeiros 15 minutos e só para texto, e "Apagar para todos". Nas mensagens do cliente, permite "Ocultar no CRM", que esconde só dentro do CRM e não apaga no WhatsApp dele.',
      "A busca da lista só enxerga o nome, o telefone e a última mensagem de cada conversa. Ela não encontra palavras ditas no meio do histórico.",
      'Contato bloqueado ou anonimizado: o envio fica desabilitado, com um aviso no lugar do campo de escrever. Se o cliente pediu para não receber mensagens, a conversa mostra "Cliente pediu para não receber mensagens".',
      'Se o número daquela conversa estiver desconectado, aparece "O número desta conversa não está conectado." Só há o botão "Responder por outro número" se a empresa tiver outro número conectado. Para reconectar o número, vá em Conexões.',
      'Grupos de WhatsApp só aparecem aqui se estiverem ligados em Conexões, no botão "Grupos". A IA nunca responde em grupo.',
      "Janela de 24 horas: só vale para canais oficiais da Meta. Nesses canais, depois de 24 horas sem resposta do cliente, só sai um modelo aprovado. Número conectado por QR não tem essa regra.",
      'A aba "Todas" some para atendentes quando a empresa limita cada atendente às próprias conversas. Quem vê o quê também depende do papel de cada pessoa.',
      'Atalhos de teclado: "j" e "k" trocam de conversa, "r" foca a resposta, "a" assume, "e" fecha e "?" mostra a lista.',
    ],
  },

  "/app/radar": {
    oQueE:
      "Mostra as demandas abertas que esfriaram e podem morrer sem resposta. A tela não envia nada: serve para você decidir em quais conversas agir primeiro.",
    comoUsar: [
      'No alto, as três contagens mostram quantas demandas estão em cada nível: "crítico", "em risco" e "em voo".',
      'Cada linha mostra o selo do nível ("Crítico", "Em risco" ou "Em voo"), o título, o nome do contato, há quanto tempo está parada ("parado há 5h" ou "parado há 3d") e quem é o dono: "Com atendente", "Agente: nome", "Assistente na conversa" ou "Sem dono".',
      'Na linha, "Assistente retorna em…" significa que a IA já tem um retorno agendado. "Sem próximo passo agendado" significa que nada foi combinado com aquele cliente e vale agir.',
      "Clique na linha para abrir a conversa. Se a demanda não tem conversa, o clique abre o funil.",
      'O botão "Assumir" da linha tira a conversa da IA e passa a você, sem precisar abrir. Ele só aparece quando existe conversa e ainda não há um atendente humano como dono.',
      'Quando a demanda tem um compromisso na agenda, a linha mostra "Ver compromisso", que abre a Agenda naquele horário.',
      'Nas caixas amarelas do alto aparecem "demandas abertas sem próximo passo". Se a empresa usa propostas, também aparecem "propostas vencidas sem retomada" e "propostas esperando revisão".',
    ],
    cuidados: [
      'Quando tudo está em dia, a tela mostra "Nenhuma demanda em risco".',
      '"Em voo" não é problema: quer dizer que a IA já agendou um retorno.',
      "Esta tela só avisa. Para falar com o cliente, abra a conversa em Conversas.",
    ],
  },

  "/app/agenda": {
    oQueE:
      "Mostra o que está marcado, com quem e quem atende, para você e para a equipe. Dá para marcar, remarcar, cancelar e registrar se o cliente compareceu. Agendamentos fazem parte de todos os planos, a partir do Essencial.",
    comoUsar: [
      'Troque a visão com os botões "Dia", "Semana" e "Mês". As setas mudam o período e "Hoje" volta ao dia de hoje. O filtro de pessoas mostra só a agenda de um colega, e "Todos" volta a mostrar todos.',
      'Para marcar, clique em "Novo agendamento" (ou num horário livre da grade). Primeiro escolha "Quem será atendido" (um cliente da base). Se o horário for só seu, escolha o compromisso pessoal, sem cliente.',
      'Se houver mais de um "Tipo de agendamento", escolha o tipo (cada um mostra a duração em minutos). Preencha, se quiser, "E-mail do convidado" e "Observação" (os dois são opcionais; a observação aparece na descrição do compromisso).',
      'Escolha o dia no calendário e o horário livre na lista, e clique em "Confirmar". A tela responde "Marcado." e oferece "Ver na agenda" e "Marcar outro". Se precisar de um horário fora dos publicados, use o campo "Outro horário" e o botão "Usar": a agenda só recusa se o horário já estiver ocupado.',
      'Para ver ou mudar um compromisso, clique nele. Ali você confirma ("Confirmar horário"), cancela e registra o resultado com "Compareceu" ou "Faltou". Esses dois botões só ficam ativos depois do horário marcado.',
      'Para cancelar, escreva o motivo em "Motivo do cancelamento" e clique em "Cancelar agendamento". Sem o motivo, o botão fica desativado. Também dá para cancelar pelo histórico da agenda.',
      'O histórico da agenda tem as abas "Próximos", "Aguardando confirmação", "Passados" e "Cancelados". Os itens têm botões como "Confirmar", "Remarcar" e "Cancelar".',
      'Para ver nesta agenda também os compromissos do Google, use "Conectar Google" no cartão da agenda. Os horários já ocupados no Google aparecem como "Ocupado".',
    ],
    cuidados: [
      'Só marca quem tem papel de atendente ou superior. Quem só visualiza vê a agenda, sem o botão "Novo agendamento".',
      'Sem nenhum tipo de agendamento cadastrado o botão fica desativado, com o aviso "Cadastre um tipo de agendamento para começar". Os tipos são criados em Configurações, na tela "Tipos de agendamento".',
      'Se aparecer "Você ainda não publicou seus horários de atendimento", ninguém consegue marcar com você, nem o agente de IA. Os horários são configurados em Equipe, na aba "Atendimento" (o aviso tem o link "Configurar meus horários de atendimento").',
      "A ligação com o Google depende de a instalação ter as credenciais do Google cadastradas. Se não tiverem, a tela avisa que a agenda funciona normalmente, só não troca compromissos com o Google. Quem instalou o sistema é quem resolve isso.",
      "Se o cliente pediu para não receber mensagens, a tela avisa que o agendamento fica sem lembrete automático e que é preciso combinar por outro meio.",
    ],
  },

  "/app/templates": {
    oQueE:
      "Aqui ficam as respostas prontas que você usa nas conversas, pessoais ou compartilhadas com a equipe. Na tela elas se chamam templates.",
    comoUsar: [
      'Clique em "Novo template".',
      'Preencha "Título" (até 80 caracteres) e "Mensagem" (até 4096 caracteres). Em "Atalho (opcional)" você escolhe uma palavra curta para achar a resposta depois.',
      "Para personalizar com o nome do cliente, escreva {{nome}} (nome completo) ou {{primeiro_nome}} na mensagem. Eles são trocados pelo nome do contato na hora de usar.",
      'Gerentes e administradores veem a opção "Compartilhar com a equipe". Marcada, a resposta fica disponível para todos. Sem marcar, ela é só sua.',
      'Clique em "Criar template" (ou "Salvar" ao editar). Na lista, o selo mostra se a resposta é "Pessoal" ou "Compartilhado".',
      'Para usar, abra uma conversa em Conversas e digite "/" no campo de mensagem. Aparece a lista; escreva parte do título ou do atalho para filtrar e clique na resposta. O texto entra no campo para você revisar e enviar.',
      "Para mudar ou apagar, use os ícones de editar e excluir da linha. A exclusão pede confirmação e não pode ser desfeita.",
    ],
    cuidados: [
      "A resposta rápida só preenche o campo de mensagem. Nada é enviado até você apertar Enter ou o botão de enviar.",
      "Se o contato não tem nome, o {{nome}} fica escrito como está. Confira antes de enviar.",
      "Cada pessoa edita e exclui as próprias respostas. As compartilhadas só podem ser mudadas por gerente ou administrador.",
      'Não confunda com os "Templates da Meta", que existem em Conexões, na aba "API Oficial (Meta)". Aquilo são modelos aprovados pela Meta para canais oficiais; esta tela é só de respostas rápidas.',
    ],
  },
};

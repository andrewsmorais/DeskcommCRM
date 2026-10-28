import type { ManualDoGrupo } from "@/lib/ajuda/manual/tipos";

export const MANUAL_CANAIS: ManualDoGrupo = {
  "/app/connections": {
    oQueE:
      'É onde você liga os números de WhatsApp da empresa ao CRM e vê se cada um está funcionando. O caminho normal para quem não é técnico é a aba "Números por QR": você escaneia um QR Code com o celular, como no WhatsApp Web.',
    comoUsar: [
      'Abra Conexões (a aba "Números por QR" já vem aberta) e clique em "Conectar novo WhatsApp". Abre uma janela com o título "Conectar novo WhatsApp". Enquanto o código é preparado, ela mostra "Preparando o código…".',
      'Na janela há duas formas: "QR Code" e "Conectar por código". Com o QR, no celular abra o WhatsApp, vá em "Aparelhos conectados", toque em "Conectar um aparelho" e aponte a câmera para o QR da tela.',
      'Pelo código, escreva o telefone com código do país e DDD e clique em "Gerar código". No celular, vá em WhatsApp, "Aparelhos conectados", "Conectar um aparelho" e "Conectar com número de telefone", e digite o código mostrado. Se essa opção não aparecer no celular, use o QR Code.',
      'Quando der certo, aparece "Conectado!" e a mensagem "WhatsApp conectado!". O número entra na lista com o selo "Conectado".',
      'Se o QR expirar: o QR se renova sozinho enquanto a janela está aberta, então basta escanear o que estiver na tela. Se nada acontecer, feche a janela e abra de novo com "Reconectar" no cartão do número. Se o código de pareamento expirar, clique em "Gerar outro código" (há uma pequena espera entre um e outro).',
      'Se o número cair (selo "Caiu" ou "Parado"), clique em "Reconectar" no cartão dele: o sistema tenta voltar sem pedir QR. Se a tela disser "Este número foi desvinculado do WhatsApp. Para usá-lo de novo é preciso parear outra vez.", clique em "Gerar novo QR" e escaneie de novo. O botão "Atualizar saúde" confere na hora o estado de todos os números.',
      'O botão "Grupos" do cartão abre a lista de grupos do número. Cada grupo tem uma chave: ligada, o grupo aparece em Conversas para a equipe responder. Há campo "Buscar grupo", "Ligar todos" e "Desligar todos". Se o número saiu de um grupo, a lista avisa.',
      'O botão "Configurar acesso da IA" de cada cartão define quando a IA pode responder naquele número (modo de teste com uma lista de telefones, IA pausada ou aberta ao público). O botão "Proteção de envio" ajusta os limites que protegem o número.',
    ],
    cuidados: [
      "Só administradores abrem esta tela.",
      'Quantos números o plano permite: Essencial, 2; Impulso, 4; Escala, 6 (no Escala o número pode ser maior, se a proposta da empresa previr). Ao passar do limite, aparece "O plano não permite adicionar outro WhatsApp. Confira Plano e cobrança."',
      'Número ligado por QR usa uma conexão não oficial com o WhatsApp, e por isso o WhatsApp pode bloquear o número, principalmente se ele mandar muita mensagem de uma vez ou para quem não conhece a empresa. A "Proteção de envio" existe para reduzir esse risco (ritmo entre envios, teto diário, janela de horário e aquecimento de número novo), mas não elimina. Não prometa ao cliente que o número nunca será bloqueado.',
      'Não existe API oficial da Meta pronta para o cliente comum. A aba "API Oficial (Meta)" pede uma conta própria na Meta e dados técnicos (ID da conta do WhatsApp Business, ID do número, token de acesso). Não a apresente como alternativa simples: para o dia a dia, o caminho é "Números por QR". As abas "Provedor parceiro", "Telefone", "Redes sociais" e "Chamada de voz" são canais à parte, que dependem do que a instalação tem ligado.',
      'Canal novo começa em modo de teste: a IA não responde automaticamente até você autorizar telefones ou liberar o público em "Configurar acesso da IA". As mensagens continuam chegando em Conversas para a equipe. Se a IA não responde num número novo, confira o selo do cartão ("IA pausada", "IA em modo de teste", "IA aberta ao público").',
      'Liberar a IA para o público pede uma confirmação ("Liberar a IA para o público?"), porque a lista de teste deixa de limitar as respostas.',
      "Não compartilhe a mesma sessão com outro CRM. Para ligar o mesmo número em outro sistema, crie uma conexão separada por QR. Dois aparelhos vinculados recebem as mesmas mensagens e, se os dois tiverem atendimento automático, o cliente pode receber resposta em dobro.",
      'Grupos: a IA nunca responde em grupo. Ao ligar grupos, o número passa a mandar ao sistema as mensagens de todos os grupos; só os ligados aparecem em Conversas e os outros são descartados. "Ligar todos" também liga grupos pessoais e de família, então prefira filtrar pela busca antes.',
      "Excluir um número (ícone da lixeira) o desconecta do WhatsApp e tira da lista. A janela mostra o que está ligado a ele; conversas e histórico continuam guardados quando existirem. Para usar o número de novo é preciso conectar outra vez.",
      'Se a tela avisar "O serviço do WhatsApp não está configurado", conectar, reconectar e excluir ficam desativados. Isso é da instalação, não do usuário: quem instalou o sistema precisa resolver.',
      'Quem recebe as conversas de cada número é definido pelo link "Configurar responsáveis por número", no fim do cabeçalho da lista.',
    ],
  },

  "/app/integrations/nuvemshop": {
    oQueE:
      "Liga a loja da Nuvemshop ao CRM. Segundo a tela, a integração sincroniza pedidos, produtos e clientes, usando a autorização da própria Nuvemshop.",
    comoUsar: [
      'Abra Nuvemshop (ela não aparece no menu lateral; use a busca do sistema, Ctrl+K ou ⌘K, e digite "Nuvemshop").',
      'Quando ainda não está conectada, clique em "Conectar com Nuvemshop". Você é levado ao site da Nuvemshop para autorizar o aplicativo na sua loja.',
      'Ao voltar, aparece "Nuvemshop conectada com sucesso." e a tela passa a mostrar "Conectado", o número da loja, a data da última sincronização, os "Escopos" (o que o CRM pode ler) e "Webhooks registrados" (por exemplo, 8 / 8).',
      'Para desligar a integração, clique em "Desconectar".',
    ],
    cuidados: [
      "Só administradores conectam ou desconectam. Para os demais, o botão fica desativado, com o aviso de que só administradores podem conectar integrações.",
      'Se a tela mostrar "Integração não configurada", o aplicativo da Nuvemshop ainda não foi cadastrado na instalação. Isso é feito por quem instalou o sistema (com as credenciais do portal de parceiros da Nuvemshop), não pelo usuário.',
      'Mensagens de erro na volta da autorização, como "Sessão de autorização expirou. Tente novamente.", pedem que você clique em "Conectar com Nuvemshop" de novo.',
      "A tela só conecta e mostra o estado da ligação. Não explica o que acontece com cada pedido depois de sincronizado; para isso, não afirme além do que está aqui.",
    ],
  },

  "/app/webhooks": {
    oQueE:
      'Serve para duas coisas: receber contatos de fora (landing pages e formulários, que viram leads no funil) e criar automações que agem sozinhas quando algo acontece. As abas são "Receber dados", "Leads recebidos", "Automações" e "Atividade".',
    comoUsar: [
      'Na aba "Receber dados", clique em "Criar primeira fonte" (ou "Nova fonte"). Dê um "Nome", escolha o "Funil de entrada" e o "Estágio de entrada" e, se quiser, uma "URL de obrigado" para onde a pessoa vai depois de preencher o formulário. Clique em "Criar fonte".',
      'Abra a fonte criada. Copie o "Endereço da fonte" ou o "Formulário pronto para colar no seu site" ("Copiar formulário") e cole no seu site. Cada envio vira um lead no funil. A seção "Como conectar no seu caso" explica WordPress/Elementor, Zapier/n8n e formulário próprio.',
      'Para testar, use "Enviar lead de teste". Se funcionar, aparece "Funcionou! Um lead de teste entrou no seu funil." e há o atalho "Ver no Kanban".',
      'A aba "Leads recebidos" lista o que chegou, com filtros por fonte, resultado e período, e a busca por nome, telefone ou e-mail.',
      'Na aba "Automações", clique em "Nova automação". Escolha o "QUANDO" (por exemplo, contato novo, lead mudou de etapa, mensagem recebida, horário marcado, aniversário, dias sem mensagem), as condições opcionais em "SE" e, em "ENTÃO", uma ou mais ações (enviar mensagem de WhatsApp, mensagem escrita pela IA, adicionar tag, atribuir a um atendente, criar tarefa interna, avisar outro sistema, entre outras).',
      'Salve com "Criar automação". Ela nasce pausada: revise e use "Ligar" quando estiver pronta. "Pausar" interrompe na hora.',
      'A aba "Atividade" mostra o que cada automação fez, com resultados como "Sucesso", "Parcial" e "Falhou". Quando uma execução falha, há o botão "Reenviar".',
    ],
    cuidados: [
      "Disponível para gerentes e administradores. Quem tem papel menor é levado de volta para Conversas.",
      "Webhooks fazem parte do plano Impulso ou superior. Em plano abaixo disso, os envios para o endereço da fonte são recusados.",
      'Fonte pausada deixa de aceitar novos envios. Reative com a chave "Fonte ativa".',
      "Mensagens de automação respeitam a janela de envio e o limite diário configurados para o número em Conexões. Fora da janela, a mensagem espera o próximo horário. Números desconectados aparecem desabilitados na escolha.",
      'A ação "Mensagem escrita pela IA" só deixa escolher agentes publicados. As ações de follow-up e de chatbot dependem de ter um fluxo publicado e ligado.',
      'Excluir uma fonte ou uma automação não pode ser desfeito, e a automação excluída para de rodar na hora. Se só quiser parar por um tempo, use "Pausar".',
    ],
  },
};

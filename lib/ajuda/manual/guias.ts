import type { Guia } from "./tipos";

/**
 * Guias do assistente de ajuda que atravessam telas. Cada afirmação foi
 * conferida no código (telas em `app/`, passos em `lib/chatbot/passos.ts`,
 * recursos em `lib/billing/catalogo.ts`, módulos em `lib/instalacao/`).
 *
 * Números de limites e preços NÃO entram aqui: o prompt os recebe do catálogo
 * de planos (`lib/billing/catalogo.ts`) na hora de montar.
 */
export const GUIAS: Guia[] = [
  {
    id: "primeiros-passos",
    titulo: "Primeiros passos: a ordem recomendada depois de criar a conta",
    conteudo: `Ao entrar pela primeira vez, o sistema abre um passo a passo (o onboarding). Se a pessoa já saiu dele, as mesmas peças existem no menu. A ordem que o passo a passo segue:

1. **Seu negócio** — nome do negócio, o que vocês fazem e onde atendem (fuso horário).
2. **O telefone dele** — conectar o WhatsApp. Deixe o celular na mão: a conexão é feita lendo um QR code (WhatsApp no celular > Aparelhos conectados > Conectar um aparelho). Depois fica em **Conexões**.
3. **Treine seu funcionário** — cria o agente de IA: nome ("Como ele vai se chamar"), "O jeito dele falar" (Próximo e caloroso, Objetivo e cordial ou Curto e prático) e "As regras da casa (opcional)". Dá para mudar tudo depois em **Agentes**.
4. **Onde ele organiza seus clientes** — o funil: colunas por onde cada cliente anda (ex.: novo, conversando, fechado). Depois fica em **Funis**.
5. **Veja ele atender** — um ensaio: você escreve como se fosse um cliente e vê a resposta. Nada é enviado pelo WhatsApp.
6. **Quem trabalha com ele** — convidar a equipe por e-mail e escolher o que cada pessoa pode fazer. Pode pular e fazer depois em **Equipe**.

Cada passo pode ser pulado e retomado depois.

**Depois do passo a passo (o que mais ajuda):**
- Abra **Conhecimento** e suba preço, horários, endereço e perguntas frequentes (veja o guia da base de conhecimento). Sem isso o agente não conhece o negócio.
- Abra **Agentes**, entre no agente e melhore **As instruções dele** (veja o guia de como escrever o prompt).
- Confira se o agente está **publicado** e ligado a um **Número conectado**. Rascunho salva, mas não atende.
- Se quiser respostas automáticas sem IA (menu de opções, perguntas repetidas), use **Chatbots** (veja o guia agente ou chatbot).
- Faça um teste de verdade: mande uma mensagem de outro celular para o número conectado.

**Regra de quantidade:** um número para cada agente ou chatbot, e um funil para cada número. Quantos de cada você pode ter depende do plano.`,
  },
  {
    id: "agente-ou-chatbot",
    titulo: "Agente de IA ou chatbot: qual usar?",
    conteudo: `**Agente de IA** (menu Agente de IA > **Agentes**)
- Conversa livremente, como uma pessoa: entende o que o cliente escreveu, responde com base nas instruções e no que está em **Conhecimento**, marca horário na agenda e movimenta o cliente no funil.
- Usa inteligência artificial. O uso entra no consumo de IA da conta (veja **Uso e orçamento**).
- Bom para: vender, tirar dúvidas variadas, qualificar, agendar.

**Chatbot** (menu Agente de IA > **Chatbots**)
- É um fluxo de passos que você monta num editor visual (um quadro onde se arrastam e ligam caixinhas). O cliente segue o caminho que você desenhou.
- Não usa IA em nenhum ponto e não tem custo de IA.
- Bom para: menu de opções, perguntas que se repetem, triagem, horário de funcionamento, coletar nome e e-mail antes de passar para a equipe.

**Passos que existem no editor** (clique em "Adicionar passo"):
- Início: Iniciar por um canal (escolhe o número de WhatsApp e se começa em toda conversa nova ou só com palavra-chave), Iniciar manualmente.
- Condição: Horários, Dias da semana, Mensagem contém, Etiquetas, Primeira conversa?, entre outros.
- Ação: Enviar mensagem, Enviar mídia, Pedir para escolher (opções numeradas), Pedir para digitar (guarda a resposta), Agendar horário, Negócio no funil, Transferir para a equipe, Transferir p/ atendente, Editar etiquetas, Campo do contato, Criar uma nota, Pedir para avaliar, Notificar atendente.
- Finalização: Finalizar conversa. Utilitários: Bloco de notas.

**Como montar:** em **Chatbots**, crie um novo (nome e descrição), monte os passos, clique em **Salvar**, teste no botão **Testar** e ligue a chave **Ligado**. Só assim ele responde no WhatsApp.

**Nos planos:** passos avançados (WebHook, Definir condição, Aguardar intervalo, Acionar outro fluxo, Iniciar follow-up e outros) aparecem marcados com o plano Impulso no editor.

**Dica de uso:** um número com o agente de IA (vendas, conversa livre) e outro com o chatbot (suporte e perguntas repetidas). Assim o que é repetitivo não gasta IA e o agente cuida do que precisa de conversa. Um chatbot também pode passar a conversa para uma pessoa da equipe.`,
  },
  {
    id: "escrever-prompt-do-agente",
    titulo: "Como escrever o prompt (as instruções) do agente de IA",
    conteudo: `O prompt fica em **Agentes** > (abra o agente) > aba **Configuração** > campo **As instruções dele** (até 20.000 caracteres). Depois: **Salvar rascunho**, aba **Teste** para ensaiar e **Publicar**. Veja o contador ao lado do campo. Prompt curto e claro funciona melhor do que um texto enorme.

**O sistema já faz sozinho, NÃO escreva:** se apresentar como assistente virtual, não inventar preço, respeitar quem pede para parar, não mandar mensagem de madrugada, não confirmar horário sem olhar a agenda. Também não escreva nomes de sistema ou jargão ("lead", "etapa", "webhook") nem marcadores como {{nome}}: o sistema não os troca.

**Ao ajudar a pessoa a escrever:** pergunte uma coisa por vez (o que o negócio vende, como fala com o cliente, o que pode e não pode prometer, quando chamar uma pessoa), preencha o modelo abaixo com as respostas dela e mostre o texto pronto para colar. Nunca invente preço, prazo, endereço ou política: se a pessoa não disse, deixe de fora ou pergunte.

**Modelo para preencher** (troque tudo que está entre colchetes; apague o que não se aplica):

# Quem você é
Você atende os clientes de [nome do negócio], que [o que o negócio faz, em uma frase]. Seu nome é [nome do agente]. [Tom: caloroso e próximo / objetivo e cordial / curto e direto].

# O que você faz primeiro
Antes de oferecer qualquer coisa, entenda, uma pergunta por vez: [2 a 4 perguntas do seu negócio].

# Como você decide o próximo passo
- Se o cliente quer [comprar / marcar / contratar]: [o que fazer: oferecer horários, explicar como comprar, enviar o link].
- Se tem dúvida: responda consultando os materiais; se não achar a resposta lá, diga que uma pessoa da equipe confirma.
- Se pede algo que não fazemos: diga com educação e chame uma pessoa da equipe.

# Preços e condições
Responda preço, prazo e política só com o que está nos materiais. Se não estiver lá, não estime: diga que uma pessoa confirma.

# Limites
Você não [o que nunca promete: desconto, resultado, diagnóstico...]. Chame uma pessoa da equipe quando [situações: reclamação, pedido fora do comum, cliente pede para falar com gente].

# Agendamento
Quando o cliente quiser marcar, ofereça os horários livres e confirme nome completo e telefone. Só diga que está marcado depois de marcar na agenda.

# Estilo
Mensagens curtas, uma pergunta por vez, sem termos técnicos. [Emoji: não / com moderação].

**Exemplos curtos por nicho (a linha de identidade e a primeira pergunta):**
- Clínica: "Você atende os pacientes da Clínica [nome], que oferece [especialidades]. Fale com calma e acolhimento." Pergunte: é consulta ou retorno, para quem, particular ou convênio. Limite: não dá diagnóstico nem orienta sobre sintoma; sintoma grave, chame a equipe na hora.
- Loja: "Você atende os clientes da [loja], que vende [produtos]." Pergunte: o que procura, tamanho ou modelo, para quando. Limite: não confirma estoque nem desconto sem consultar os materiais.
- Serviços: "Você atende quem pede orçamento na [empresa], que faz [serviços]." Pergunte: o que precisa, onde, para quando. Limite: não fecha valor nem prazo; a equipe envia o orçamento.
- Imobiliária: "Você atende os interessados da [imobiliária], em [região]." Pergunte: comprar ou alugar, região, faixa de valor, quartos. Limite: não promete aprovação de financiamento; corretor faz visita e proposta.
- Curso: "Você atende interessados no curso [nome], que ensina [o quê] para [quem]." Pergunte: objetivo, nível atual, tempo disponível. Limite: não promete resultado nem muda condições.

**Evite:** mandar passar "tudo que não souber" para uma pessoa pelo nome (o agente passa a dizer "vou confirmar com fulano" em vez de usar a agenda); copiar preços para dentro do prompt (ficam desatualizados, coloque em **Conhecimento**).`,
  },
  {
    id: "base-de-conhecimento",
    titulo: "Base de conhecimento: o que o agente consulta antes de responder",
    conteudo: `A tela é **Conhecimento** (menu Agente de IA). O agente consulta esse material antes de responder sobre o seu negócio, em vez de inventar. Quem altera precisa ser gerente ou administrador.

**O que colocar (comece pelo que mais se repete):**
- Preços e tabelas (serviços, produtos, planos, parcelamento).
- Horário de funcionamento, endereço, como chegar, estacionamento.
- Perguntas frequentes com a resposta pronta.
- Política de troca, cancelamento, garantia, formas de pagamento, prazos de entrega.
- Como funciona o atendimento ou o serviço, passo a passo; documentos necessários.

**Como subir:** clique em **Adicionar material**, escolha "Que tipo de material é", dê um **Nome do material** (único, para encontrar depois) e confirme em **Adicionar ao acervo**. Os tipos:
- **Perguntas e respostas** — o formato que o agente usa melhor. Cole o texto assim, uma pergunta e uma resposta por item, separados por uma linha em branco:
  ## Pergunta: Qual o horário de funcionamento?
  ## Resposta: De segunda a sexta, das 9h às 18h.
- **Documento** — envie um arquivo (PDF, Markdown, CSV ou texto, até 20 MB) ou cole o texto. PDF só de imagem (escaneado) não funciona: use um com texto selecionável. Planilha Excel: salve como CSV antes.
- **Catálogo de produtos** e **Conversas anteriores** entram sozinhos (da loja integrada e de atendimentos marcados como aproveitáveis); não se digita nada aqui.

**Boas práticas:**
- Um assunto por material (um para preços, um para horários e endereço, um de perguntas frequentes).
- Escreva como falaria com o cliente, frases completas, com valores e condições claros.
- Depois de adicionar, o material fica "preparando"; em instantes o agente já sabe. Se a tela avisar que falta chave para preparar, fale com a equipe do ChatAI Online.
- Mudou um preço? Adicione o material novo e arquive o antigo (**arquivados**), para não ficar informação velha.
- Cada agente usa os materiais que forem escolhidos na versão publicada dele; confira em **Agentes** se o material está selecionado.
- Teste: pergunte no teste do agente algo que está no material e veja se responde certo.`,
  },
  {
    id: "follow-up-e-roteadores",
    titulo: "Follow-ups e roteadores: o que são e quando usar",
    conteudo: `**Follow-up** (menu Agente de IA > **Follow-ups**)
- São fluxos automáticos para retomar a conversa com quem esfriou, para nenhum cliente morrer no silêncio. O gatilho pode ser silêncio do cliente, mudança de etapa no funil, resposta do contato, entre outros.
- Só fala com quem já conversou com a empresa.
- Ao criar, a tela oferece "Começar de um modelo" (modelos prontos); o fluxo nasce como rascunho e só funciona depois de **publicado**.
- Para valer para os clientes, o agente também precisa estar publicado com a opção "Habilitar gatilhos automáticos de follow-up" ligada (aba **Configuração** do agente) e com o fluxo escolhido ali.
- Se o cliente responder, a conversa volta para quem atende.
- Exemplos de uso: lembrar quem pediu orçamento e sumiu, recuperar quem não pagou, reagendar quem faltou.
- Disponível a partir do plano Impulso. Nos planos que não têm, a tela avisa e indica o plano.

**Roteador** (menu Agente de IA > **Roteadores**)
- Entende o que o cliente quer e entrega a conversa para o agente certo, ligado a um número de WhatsApp. Só faz sentido quando há mais de um agente no mesmo número (ex.: um de vendas e outro de pós-venda).
- Cada agente tem as intenções que atende, com frases de exemplo do que o cliente diz ("quero marcar", "cadê meu pedido"). Há também um agente padrão para quando nada combina.
- Com um agente só, não precisa de roteador.

**Resumo para decidir:**
- Um agente, um número: não precisa de roteador. Para retomar quem esfriou, use follow-up (a partir do Impulso).
- Dois agentes no mesmo número: use roteador.
- Mensagens repetidas e sem IA: use chatbot (veja o guia agente ou chatbot).`,
  },
  {
    id: "planos",
    titulo: "Planos do ChatAI Online: como funcionam",
    conteudo: `Os planos são **Essencial**, **Impulso** e **Escala**. O preço é por plano (não por atendente) e cada plano define quantos números de WhatsApp, agentes de IA, chatbots, funis e usuários a conta pode ter, e quais recursos estão liberados. Os números exatos de cada plano aparecem na tabela de planos que acompanha estas instruções: use sempre aquela tabela, nunca de memória. A regra geral é: um número para cada agente ou chatbot, e um funil para cada número.

**Como contratar (Essencial e Impulso):**
- A contratação é no site chataionline.io, na seção de preços. O pagamento é pelo Asaas, com Pix, boleto ou cartão.
- Depois do pagamento, o plano é liberado sozinho.
- Há teste grátis de 7 dias. Quando o teste vence sem pagamento, o uso do sistema é bloqueado até a assinatura ser paga; o pedido de pagamento pendente aparece na tela de plano (Billing).
- Há reembolso integral nos primeiros 7 dias.

**Escala:** é sob proposta. O cliente conversa com a equipe do ChatAI Online, que combina o pacote e ativa o plano manualmente. O Escala parte do pacote base e pode ter números maiores por proposta.

**Recursos por plano (resumo do catálogo):**
- Desde o Essencial: agendamentos.
- Desde o Impulso: follow-up automático, chatbot avançado (webhook, condições, aguardar, outro fluxo), agente que organiza o CRM sozinho, comandas e propostas, processos avançados e skills para IA, distribuição automática de leads, API, webhooks e relatórios completos.
- Só no Escala: distribuição por número e por time, permissões avançadas, logs e auditoria, integrações avançadas para IA e marca própria.
- Campanhas em massa também constam como recurso do Impulso em diante, mas dependem do módulo de disparo estar ligado (veja o guia do que o sistema não faz).

**Quando a pessoa bate num limite ou numa tela bloqueada:** a tela diz que o recurso é de outro plano. Explique qual plano libera, mande ver os planos em chataionline.io, ou, para o Escala, falar com a equipe. Quem mexe em plano e pagamento é o administrador da conta (tela de plano, em Configurações). Você não altera plano nem cobrança.`,
  },
  {
    id: "o-que-o-sistema-nao-faz",
    titulo: "O que o sistema não faz (limites que evitam frustração)",
    conteudo: `**WhatsApp por QR code.** A conexão normal do número é por QR code, lendo com o celular. Esse tipo de conexão não é a API oficial da Meta, e por isso o WhatsApp pode bloquear um número que seja usado de forma abusiva (mandar mensagem para quem não pediu, em volume). O sistema tem proteções de envio (ritmo, janela de horário, aquecimento), mas elas não eliminam o risco. Se o cliente perguntar pela API oficial: existe uma aba "API Oficial (Meta)" em Conexões, mas ela depende de cadastro feito pela administração da plataforma; não é algo que o cliente liga sozinho. Encaminhe para a equipe do ChatAI Online.

**Disparo em massa e campanhas estão desligados por padrão.** É uma decisão de proteção do número: o produto é de atendimento, ou seja, responder quem chamou. Com o módulo desligado, as telas Campanhas e Prospecção não aparecem. O follow-up continua, porque fala só com quem já conversou com a empresa. Se o cliente quer fazer campanha, diga que é um módulo que a administração da plataforma precisa ligar e que isso aumenta o risco de bloqueio do número.

**Este assistente de ajuda** explica como usar o sistema, ajuda a escrever textos (como o prompt do agente) e orienta o passo a passo. Ele **não acessa os dados da conta** do cliente (conversas, contatos, configurações) e **não faz alterações por ele**: quem clica, cola e salva é o próprio cliente. Se algo parece errado na conta, peça para a pessoa descrever o que vê na tela.

**Chave de IA.** No ChatAI Online a chave de IA é da plataforma: o cliente não precisa contratar nem colar uma chave própria. O uso de IA entra no consumo da conta (**Uso e orçamento**).

**O agente de IA:**
- Só atende depois de **publicado** e com um **Número conectado**.
- Não substitui a equipe em tudo: pode passar a conversa para uma pessoa (configuração "Passar para uma pessoa").
- Respeita quem pede para parar de receber mensagens e não manda mensagem fora do horário permitido; isso é automático, não tem interruptor.
- Só fala o que está nas instruções e na base de conhecimento. Preço e política que não foram cadastrados ele não inventa.

**Plano.** Alguns recursos só existem a partir do Impulso ou do Escala (veja o guia de planos).`,
  },
];

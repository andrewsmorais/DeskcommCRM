# Grupo 4 — correções do produto original que faltam trazer

Gerado em 15/11/2026. Cada linha é um commit de correção do produto original (`produto/main`) que **não encaixou sozinho** no código daqui e precisa ser refeito à mão. Os de segurança, o lote 1 e o lote 2 já entraram (ver MAPA).

- **refazer-a-mao**: todos os arquivos existem aqui, mas o texto mudou — reescrever a correção.
- **parcial**: parte dos arquivos não existe aqui — avaliar se o recurso existe.
- **nada-existe-aqui** e **so-teste-ou-doc**: só a contagem; em geral não se aplicam.

### Medição de 16/11/2026 (o que "refazer à mão" realmente esconde)

Para cada commit, contei quantas linhas de código que ele ACRESCENTA já existem
no arquivo daqui. Nas 504 de "refazer-a-mao": 59 já estão aqui (≥80% das linhas),
72 não têm código (comentário/teste), 34 estão pela metade e 339 faltam. Abrindo
uma a uma as da caixa de mensagens, a maioria das que "faltam" corrige um recurso
que este fork NÃO TEM (devolver ao automático ao fechar, custo de mídia,
motivo_codigo da passagem, embeddings do Gemini, restrição comercial…): não há
o que consertar sem antes trazer o recurso inteiro.

Já trazidas nesta rodada: 12 sem conflito de código, 21 só de espanhol no
dicionário, e à mão: busca da conversa sem acento (c534a034f), foco volta ao
campo depois do envio (957e7d519), setinha de opções com 44px no toque
(5db82b344), "Excluir nota" visível no toque e no teclado (3c0a0511e).
Desfeitas por quebrar teste daqui: 3e14e4395 (pausa da IA no atendimento
manual), 41c5ed287 (credencial reserva do canal oficial).

## refazer-a-mao (504)

### #3023 (1)
- [ ] `de75e5569` 2026-10-30 — fix(#3023): auditoria e super-admin ficam fora da regua de atendente

### #3283 (1)
- [ ] `76d03fdc7` 2026-10-22 — fix(#3283): captura automatica de telefone emite contact.phone_added

### #3310 (3)
- [ ] `bfe02adae` 2026-10-22 — fix(#3310): o reason do tool MCP ensina a mandar requested_human
- [ ] `01c0c9ab7` 2026-10-22 — fix(#3310): a pausa por handoff fecha a entrega da agenda como blocked:force_human
- [ ] `27e6dc83b` 2026-10-22 — fix(#3310): o motivo ausente vira low_confidence também na spec e na descrição do tool

### 4138 (1)
- [ ] `f847fb4f7` 2026-11-07 — fix(4138): numero diferente nao contradiz o nome — o par de fixo e celular continua sugerido

### 9078 (1)
- [ ] `9f9df2a96` 2026-11-01 — fix(9078): o baseline volta a ter UMA fn_definir_aviso_de_caso, e a main nao perde linha (#3803)

### EPIC-00 (3)
- [ ] `54e835d92` 2026-10-26 — fix(EPIC-00): confira os arquivos antes de restaurar o backup
- [ ] `bb138875a` 2026-11-07 — fix(EPIC-00): recuse backup sem a pasta de anexos
- [ ] `8a95b4cf9` 2026-11-07 — fix(EPIC-00): encontre as sessões ao lado do dump

### EPIC-03 (1)
- [ ] `4bb798239` 2026-10-28 — fix(EPIC-03): pode a menção apagada contida em outro nome

### EPIC-06 (1)
- [ ] `04781786b` 2026-10-22 — fix(EPIC-06): recuse estoque inválido na importação do catálogo

### EPIC-12 (2)
- [ ] `6ca6c2874` 2026-10-26 — fix(EPIC-12): respeite o prazo de retry entre drenos
- [ ] `32d0251f2` 2026-10-28 — fix(EPIC-12): retente a mídia após falha ao consultar a sessão

### EPIC-13 (2)
- [ ] `006bff3f8` 2026-10-29 — fix(EPIC-13): follow-up de silêncio após uma hora
- [ ] `5a1b29ba4` 2026-11-07 — fix(EPIC-13): carimbe a agenda só ao gravar a página

### admin (3)
- [ ] `396c9b7c7` 2026-10-27 — fix(admin): a tela de sistema não tem telefonia de organização a ler (#1290)
- [ ] `2c1274144` 2026-10-30 — fix(admin): busca conta pela lista do menu e comentarios acompanham a barra nova
- [ ] `3ab6ccc8d` 2026-11-10 — fix(admin): o interruptor do link de pagamento volta para dentro do cartão no celular

### agenda (19)
- [ ] `f47a9f7de` 2026-10-21 — fix(agenda): a FK redundante só cai quando a composta existe (#3219)
- [ ] `f1898f386` 2026-10-21 — fix(agenda): use reservas persistidas na revisão de confirmações
- [ ] `e1cac08fd` 2026-10-30 — fix(agenda): a abertura pergunta pelo resto da janela, não pelo instante (#3774)
- [ ] `4ac21a965` 2026-10-30 — fix(agenda): mudar de mes pelas setas decide a abertura pendente
- [ ] `dc54556a9` 2026-10-30 — fix(agenda): a ajuda do titulo livre diz que ele chega ao cliente (#3766)
- [ ] `0cae75bec` 2026-10-30 — fix(agenda): a resposta sem jornada não gasta a decisão de abrir no mês seguinte
- [ ] `0daf3fdc4` 2026-10-30 — fix(agenda): a decisão de abertura usa o id do tipo e não ricocheteia quem voltou à mão
- [ ] `8bd5812f0` 2026-10-30 — fix(agenda): trocar de tipo refaz a abertura do calendario no fim do mes
- [ ] `0f1b1b4d0` 2026-10-30 — fix(agenda): serviço marcado pela tela não leva a duração escolhida (#3709)
- [ ] `88ac31341` 2026-11-01 — fix(agenda): o pulo no corte do envio tira a linha da fila antes de relançar
- [ ] `db3ca09d8` 2026-11-03 — fix(agenda): os seletores do lembrete cabem na tela do celular
- [ ] `dfa8e643f` 2026-11-05 — fix(agenda): convidado marcado usa um token de superficie que o tema declara
- [ ] `cf0f25871` 2026-11-05 — fix(agenda): a ferramenta de marcar do agente nao escolhe pessoas da equipe
- [ ] `2d135137d` 2026-11-05 — fix(agenda): editar convidado de evento ja publicado volta a funcionar
- [ ] `1f71bde21` 2026-11-05 — fix(agenda): so publica extendedProperties quando ha lista de equipe a registrar ou apagar
- [ ] `83306fd80` 2026-11-06 — fix(agenda): chave duplicada no dicionário e a guarda de contato aceita o ctx inteiro
- [ ] `7af31e49b` 2026-11-06 — fix(agenda): bloco de compromissos mostra o local da reserva
- [ ] `a849fe6ab` 2026-11-07 — fix(agenda): a janela da camada são os dias que a grade desenha
- [ ] `30e0953b1` 2026-11-12 — fix(agenda): falha de rede do banco não vira guarda permanente (#4448)

### agent (1)
- [ ] `e743bd62c` 2026-11-06 — fix(agent): o fallback do roteador le o publico como `agentConfig.publico` (#3722)

### agent-engine (4)
- [ ] `c14537508` 2026-10-24 — fix(agent-engine): a liberação de jobs retidos solta o cliente COM erro (#2624)
- [ ] `22e421171` 2026-10-26 — fix(agent-engine): a retenção do claim pula linhas já travadas
- [ ] `d7b7c7b5d` 2026-10-26 — fix(agent-engine): o claim retém e preserva o espaçamento antes do tick
- [ ] `8ac3bf211` 2026-10-26 — fix(agent-engine): o claim respeita o hold entre ticks do watchdog

### agente (8)
- [ ] `6e242ac2d` 2026-10-21 — fix(agente): o turno adiado pela janela do agente não grava a decisão duas vezes
- [ ] `1ee2ca9c4` 2026-10-22 — fix(agente): a prévia separa falha de decisão também na correção e no veto
- [ ] `87aca5224` 2026-11-03 — fix(agente): o histórico do agente traz o último modelo aprovado que o cliente recebeu
- [ ] `a39677d71` 2026-11-03 — fix(agente): conecte a prova da reserva ao revisor do turno
- [ ] `2879ca2c2` 2026-11-04 — fix(agente): a pausa entre respostas vale também para a mensagem que chega durante um turno
- [ ] `0aed628a1` 2026-11-08 — fix(agente): mantém `const system = blocosResidentes.join(...)` e traduz os blocos no lugar
- [ ] `6083cac05` 2026-11-11 — fix(agente): a leitura remota embrulhada no turno mantém a marca da prévia
- [ ] `7ec3dcb79` 2026-11-14 — fix(agente): no Testar, open_human_case passa a contar para a trava de promessa

### agentes (4)
- [ ] `8613aa5af` 2026-11-04 — fix(agentes): cópia simultânea tenta o próximo nome, e o corte não parte emoji
- [ ] `077a43603` 2026-11-04 — fix(agentes): revisão do público por origem — sem afirmar que a origem não muda, constante compartilhada e lead de anúncio
- [ ] `8ee9d74d0` 2026-11-04 — fix(agentes): duplicar duas vezes escolhe o proximo nome livre
- [ ] `d16442414` 2026-11-11 — fix(agentes): o cartão de voz não escreve estado depois do desmonte

### ai (3)
- [ ] `3e0f2c084` 2026-10-23 — fix(ai): a confirmação da remoção diz o que mais para de sair
- [ ] `199a8562b` 2026-10-26 — fix(ai): material do acervo não mente mais no PATCH, e as cinco rotas auditam
- [ ] `5b1eb9695` 2026-10-29 — fix(ai): calculate Terra cache and context pricing per request

### ai-voz (4)
- [ ] `165c22e0b` 2026-10-29 — fix(ai-voz): três achados da revisão de código, antes da Fase 7
- [ ] `dd84a03cd` 2026-10-30 — fix(ai-voz): lint:channels — comentário de sintetizar.ts nomeava o provider do canal
- [ ] `ac82eb198` 2026-10-30 — fix(ai-voz): quatro achados da segunda revisão de código
- [ ] `8f9e46164` 2026-10-31 — fix(ai-voz): a prévia de voz passa a contar no orçamento de IA da organização

### ai/agentes (1)
- [ ] `6046b7556` 2026-11-08 — fix(ai/agentes): lista acompanha duplicar/renomear sem F5 e a cópia anuncia o modelo da versão

### ajuda (1)
- [ ] `25f307455` 2026-10-30 — fix(ajuda): o link da Ajuda pede prefetch por intencao e cabe em 900px

### api (2)
- [ ] `87b497c31` 2026-10-21 — fix(api): reenvio so muda a hora da mensagem quando o canal aceita
- [ ] `c91a47b6d` 2026-11-05 — fix(api): sob /api/ o X-Request-Id da resposta é o que a rota grava no log

### assinatura (2)
- [ ] `652fbaddf` 2026-10-27 — fix(assinatura): o aviso da assinatura também fala espanhol (#3371)
- [ ] `41d797826` 2026-10-27 — fix(assinatura): tipa a tentativa do seam para o retry único compilar (#3371)

### atendentes (3)
- [ ] `99ed9c586` 2026-11-05 — fix(atendentes): metricas por atendente e webhook de saida tambem so nomeiam membros
- [ ] `4155d71df` 2026-11-05 — fix(atendentes): ferramentas da IA e dossie do follow-up tambem so nomeiam membros
- [ ] `db306022e` 2026-11-05 — fix(atendentes): histórico, decisões e relatório também só nomeiam membros

### atendimento (1)
- [ ] `fb5591f16` 2026-11-05 — fix(atendimento): modo do setor só com o módulo de setores ligado, e com a aba Todas

### atualizacao (3)
- [ ] `f66649bf6` 2026-10-22 — fix(atualizacao): "voltou sozinho" exige run nascido fechado, não só sem autor
- [ ] `ef7962407` 2026-10-23 — fix(atualizacao): a volta automática leva o desfecho, e o painel para de tratar os dois casos iguais
- [ ] `604a25898` 2026-10-26 — fix(atualizacao): orienta conexão no retrato antigo sem antecipar comando manual

### audio (3)
- [ ] `7b7dab384` 2026-10-21 — fix(audio): conversao em curso espera o toque e teto de conversoes deixa tentar de novo
- [ ] `f024924a8` 2026-10-21 — fix(audio): midia quebrada em navegador que toca ogg volta a dizer indisponivel
- [ ] `b16e28078` 2026-10-21 — fix(audio): o player nasce sem src ate saber se o aparelho toca

### auditoria (1)
- [ ] `9ddd78da1` 2026-11-12 — fix(auditoria): conserve os eventos ao exportar durante novas entradas

### auth (12)
- [ ] `4961dadae` 2026-10-21 — fix(auth): o atalho de plataforma decide pela organização-ALVO, não pelo cookie
- [ ] `88ae386ca` 2026-10-23 — fix(auth): hash do código de recuperação com o segredo da instalação
- [ ] `41e3f958b` 2026-10-23 — fix(auth): o código de recuperação é gravado na forma em que é buscado
- [ ] `8f83a9dd1` 2026-10-23 — fix(auth): a Atualização do sistema leva ao código antes de abrir
- [ ] `10acf360f` 2026-10-23 — fix(auth): códigos de recuperação gravados só pelo client de serviço
- [ ] `41a645b49` 2026-10-23 — fix(auth): emitir códigos de recuperação exige o fator provado na sessão
- [ ] `6a6a543f2` 2026-10-29 — fix(auth): a identidade alcanca todas as sessoes no cache curto e o acompanhamento ativo e sempre relido
- [ ] `e63ae9079` 2026-10-29 — fix(auth): o menu da empresa nao pode ficar velho no cache de 30 s
- [ ] `8244a0d43` 2026-10-29 — fix(auth): Entrar com Google não para na tela quando o Supabase está no domínio do app
- [ ] `d316466d1` 2026-10-30 — fix(auth): entrar de novo derruba o cache curto de autorizacao da pessoa
- [ ] `a74cf3409` 2026-11-02 — fix(auth): o limite de tentativas do segundo fator vale nas duas telas que conferem o código
- [ ] `1930eef00` 2026-11-02 — fix(auth): enforce server-side MFA/TOTP failure lockout in verifyMfa (GHSA-vgq7-h88j-vqrq)

### automacao (7)
- [ ] `570f4046e` 2026-10-23 — fix(automacao): sem passagem para a equipe, a aba Atividade nao a afirma (#3274)
- [ ] `4420ddca3` 2026-10-23 — fix(automacao): a mensagem escrita pela IA passa pela restrição comercial
- [ ] `3e9c8f234` 2026-10-31 — fix(automacao): o tipo da condição de horário pode conter "|" (#3821)
- [ ] `a0547da3c` 2026-11-01 — fix(automacao): congela o "nao enviar" em vez de adiar so parte das regras
- [ ] `4a39b7e28` 2026-11-01 — fix(automacao): regra "nao enviar" nao envia quando outra regra do mesmo gatilho adia
- [ ] `3c37d6c51` 2026-11-11 — fix(automacao): a reescrita usa a origem de motivo já declarada na guarda
- [ ] `fce074fd6` 2026-11-11 — fix(automacao): mensagem da IA barrada por valores reescreve uma vez e não passa à equipe

### automacoes (4)
- [ ] `a2d3954a9` 2026-10-27 — fix(automacoes): a falha de conversa também chega ao detalhe técnico (#3514)
- [ ] `ad2b0241e` 2026-10-31 — fix(automacoes): os textos das duas caixas dizem o que a carteira já leva desde a #3642 (#3514)
- [ ] `673807c90` 2026-10-31 — fix(automacoes): a opção de conversas conta só o que a atribuição gravou (#3514)
- [ ] `d911f2b3a` 2026-11-01 — fix(automacoes): a Atividade do destino dinâmico fala o idioma de quem lê

### automation (2)
- [ ] `b7672cbd5` 2026-10-30 — fix(automation): frases dos motivos da ação de data do atendimento e chave duplicada no dicionário (#3741)
- [ ] `5d5a2da45` 2026-11-12 — fix(automation): a espera pela janela não engole o contato que a guarda barra

### avatar (1)
- [ ] `192985d43` 2026-11-04 — fix(avatar): confira o acesso humano antes de assinar a foto

### avisos (3)
- [ ] `49402f3d2` 2026-10-23 — fix(avisos): remover o destinatário devolve o número ao Inbox (#3338)
- [ ] `8b0ec6877` 2026-11-01 — fix(avisos): sobrecargas antigas fora do baseline e comandos só no número da empresa (#3803)
- [ ] `e540c8f31` 2026-11-12 — fix(avisos): quem desligou o aparelho antes de cada tipo ter o seu Push segue sem aviso

### backup (2)
- [ ] `da61f7d9d` 2026-11-07 — fix(backup): trava por pasta de destino impede dois backups de corromperem o dump (#4222)
- [ ] `39b8f2776` 2026-11-10 — fix(backup): entra só a trava do backup; a metade do workflow de release fica fora

### banco-externo (3)
- [ ] `3e331d6f4` 2026-10-21 — fix(banco-externo): espanhol das chaves curtas da tela de tabela direta
- [ ] `cd8b01b0d` 2026-11-02 — fix(banco-externo): a foto volta a ser marcada numa linha só, como antes do rebase
- [ ] `8c7d328ad` 2026-11-10 — fix(banco-externo): a foto por link leva kind 'image' como a main exige

### baseline (16)
- [ ] `b7754ea6d` 2026-10-22 — fix(baseline): o bloco de RBAC de canais deixa de recriar a regra for all que a 0707 divide
- [ ] `66e5777c1` 2026-10-24 — fix(baseline): o apendice do 0762 fica ANTES da varredura anon (a casa quer a ordem)
- [ ] `da565eb19` 2026-10-24 — fix(baseline): conversations_select tem UMA criacao so — a solta sai, o DO fica
- [ ] `8d28e3762` 2026-10-26 — fix(baseline): conversations_select volta a ter UMA criacao apos o merge do #2542
- [ ] `5e220e4d9` 2026-10-31 — fix(baseline): apêndice da 9055 acima da varredura de anon
- [ ] `ee6f32af1` 2026-11-01 — fix(baseline): reconstruido a partir da main de agora + 9078 (#3803)
- [ ] `3c1d531bc` 2026-11-03 — fix(baseline): o bloco da busca sem acento entra ANTES da varredura de anon
- [ ] `d1fbe7e38` 2026-11-03 — fix(baseline): a chave (organization_id, id) de meta_templates nasce num bloco so
- [ ] `84eeff4ae` 2026-11-05 — fix(baseline): apêndice 9222 antes da varredura anon; uma reconstrução só das constraints da entrega
- [ ] `39eca26db` 2026-11-05 — fix(baseline): o bloco da 9212 entra antes da varredura de anon
- [ ] `e6932ff04` 2026-11-05 — fix(baseline): conversations_select passa a ter um único bloco no fim do arquivo
- [ ] `e76f25147` 2026-11-11 — fix(baseline): espelho da 9343 antes do bloco da 9243, fora da janela da cerca
- [ ] `e85b86286` 2026-11-11 — fix(baseline): apendice antes do bloco da 9243, fora da janela da cerca
- [ ] `c34b94db0` 2026-11-11 — fix(baseline): um bloco só para a constraint do voz_quando (#4345)
- [ ] `2cff29442` 2026-11-11 — fix(baseline): o espelho da 9322 mora acima do bloco da 9243
- [ ] `98b6e2126` 2026-11-11 — fix(baseline): o bloco da 9333 sai de dentro do trecho que o invariante da 9243 compara

### board (1)
- [ ] `f47e8bb42` 2026-11-10 — fix(board): pagina a leitura dos negócios e filtra pela organização (#4321)

### busca (1)
- [ ] `f2f883266` 2026-11-06 — fix(busca): quatro listas ignoram acento com a régua do Inbox

### cadastro (2)
- [ ] `6d3a589ef` 2026-10-26 — fix(cadastro): preserve o rascunho ao criar contato intermediário
- [ ] `e72632eb8` 2026-11-10 — fix(cadastro): o vínculo único da empresa reservada é lido sem índice solto

### cadencias (1)
- [ ] `0d66b7ecf` 2026-11-08 — fix(cadencias): o bloco 9249 do baseline já instala as policies na forma final

### campanhas (2)
- [ ] `b06411bb6` 2026-10-23 — fix(campanhas): o ajudante dos números aceita o desfecho de qualquer modo da campanha
- [ ] `61d9810d5` 2026-11-14 — fix(campanhas): a varredura continua de onde parou no tique seguinte (#4495)

### campos (2)
- [ ] `613989532` 2026-10-22 — fix(campos): valor único já gravado vira lista de um no modo múltiplo (#3249)
- [ ] `5f6be6260` 2026-10-25 — fix(campos): grave a moeda ao enviar com Enter

### canais (4)
- [ ] `cb0819f60` 2026-10-27 — fix(canais): a faixa de conexão caída lê pela régua do atendente (#3088)
- [ ] `5cdc9b3a6` 2026-11-03 — fix(canais): o modelo aprovado segue o número, não a linha da conexão
- [ ] `d719b7e4d` 2026-11-03 — fix(canais): o pisco da verificação não vira queda, e a mensagem que esperou a conexão voltar não fica parada em silêncio
- [ ] `b07abe261` 2026-11-05 — fix(canais): a limpeza dos modelos vem depois de a conexão gravar

### canal (4)
- [ ] `a55bb24e9` 2026-11-06 — fix(canal): o aviso de mensagem sem atendimento deixa de afirmar um pedido de sair
- [ ] `ca275291a` 2026-11-06 — fix(canal): sonda que não informa não fecha o defeito aberto do número
- [ ] `06bbbb4d4` 2026-11-14 — fix(canal): o arquivo do webhook não guarda o segredo do robô do Telegram
- [ ] `7508dfe96` 2026-11-14 — fix(canal): o robô do Telegram declara que não reporta conversão

### canal-oficial (1)
- [ ] `41c5ed287` 2026-11-03 — fix(canal-oficial): a credencial reserva do .env vale só para o número dela

### captacao (1)
- [ ] `4bb0a64c3` 2026-10-22 — fix(captacao): no reuso do card aberto a etapa só anda para a frente e o título do Respondi fica (#3101)

### caso (2)
- [ ] `2ccc1a255` 2026-11-04 — fix(caso): snapshotDoCaso aceita contato sem nome e teste corrige import
- [ ] `eab9accc5` 2026-11-04 — fix(caso): a hora de cada fala do caso humano não é a da abertura

### casos (2)
- [ ] `905ff4192` 2026-10-21 — fix(casos): o registro no caso aberto fica condicional e a frase ao cliente verdadeira
- [ ] `2748108d1` 2026-11-06 — fix(casos): a fronteira do atendimento decide o aviso, nao o registro da resposta

### catalogo (5)
- [ ] `3e312bde1` 2026-10-31 — fix(catalogo): o modelo da planilha importa limpo como vem
- [ ] `78b1053a2` 2026-11-07 — fix(catalogo): envio retomado sai em nome do agente do snapshot
- [ ] `5aa4f6f2b` 2026-11-07 — fix(catalogo): apresentação feita na correção do turno mudo encerra o turno
- [ ] `43823d299` 2026-11-11 — fix(catalogo): o dicionário em espanhol não repete as frases do cartão Catálogo
- [ ] `231ce885e` 2026-11-13 — fix(catalogo): conte só os produtos gravados na importação

### celular (9)
- [ ] `47f6b3dcf` 2026-10-23 — fix(celular): a spec semeia o que a aba Execuções lê e mede o «Ver conversa»
- [ ] `cb9522198` 2026-10-23 — fix(celular): palavra longa quebra, Por canal semeado e limpeza que acusa sobra
- [ ] `282034f5b` 2026-10-23 — fix(celular): interruptor empilhado nao rouba o toque do vizinho
- [ ] `f2121e546` 2026-10-23 — fix(celular): a revisão do PR de equipe e organização
- [ ] `f4fd175ae` 2026-10-23 — fix(celular): ajustes da revisão no PR de vendas e dinheiro
- [ ] `229a7b0aa` 2026-10-23 — fix(celular): pausar agente, abrir aviso da Central e acompanhar a IA pelo celular
- [ ] `e1945462f` 2026-10-23 — fix(celular): conexões, radar, propostas, faturamento e Meta Ads sem botão fora da tela
- [ ] `f7f3c1f7a` 2026-10-23 — fix(celular): equipe e plantão pelo celular, e as ações de etiqueta deixam de ser cortadas
- [ ] `ef08212e5` 2026-10-23 — fix(celular): interruptores, menus, abas, gaveta e avisos da casca com alvo de dedo

### central (1)
- [ ] `d09dc7041` 2026-11-08 — fix(central): aviso de apresentação interrompida abre a conversa

### cobranca (3)
- [ ] `724ff6620` 2026-11-10 — fix(cobranca): leitura da intenção que falha não derruba o cadastro
- [ ] `e323e9eb3` 2026-11-10 — fix(cobranca): o retry do cadastro retoma a empresa já criada pela intenção
- [ ] `65862953c` 2026-11-10 — fix(cobranca): leitura do primeiro pagamento que falha não derruba o hub da conta suspensa

### cold-call (3)
- [ ] `054e71726` 2026-11-03 — fix(cold-call): a fila só leva os dados de contato de quem pode receber ligação
- [ ] `b0497eef1` 2026-11-03 — fix(cold-call): a fila relê depois de importar, lixeira de 44 px e resultado travado para quem não recebe ligação (#3933)
- [ ] `abf490776` 2026-11-03 — fix(cold-call): usa o nome canônico do contato e registra a evidência

### contato (4)
- [ ] `bd66a95aa` 2026-11-05 — fix(contato): o cadastro não quebra quando o funil padrão vem sem pipeline
- [ ] `c21f3ddba` 2026-11-05 — fix(contato): criar pelo negócio segue a ficha manual e grava na timeline
- [ ] `6b8a93913` 2026-11-05 — fix(contato): permissão de criar vem do dossiê por prop
- [ ] `5f897be28` 2026-11-05 — fix(contato): o cadastro não quebra quando o funil padrão vem sem pipeline

### contatos (12)
- [ ] `e2de67724` 2026-10-21 — fix(contatos): o PATCH com o telefone do próprio contato não vira 409 de telefone
- [ ] `f081a5b20` 2026-10-22 — fix(contatos): numero com + mantem o DDI e o lote ganha PAIS_PADRAO no duble (#3301)
- [ ] `cc9eea0bb` 2026-10-22 — fix(contatos): o contato novo não perde a etiqueta digitada sem Enter (#3235)
- [ ] `8f09097a7` 2026-10-22 — fix(contatos): ações com o tamanho de sempre no computador, e a régua mede o <main>
- [ ] `a10f1810e` 2026-10-26 — fix(contatos): validar o documento no campo, não no rodapé
- [ ] `9e83e73ac` 2026-10-28 — fix(contatos): o CPF inválido também impede o envio
- [ ] `00a7cfc23` 2026-10-29 — fix(contatos): esvaziar um campo do endereço apaga o valor gravado
- [ ] `49acbebf3` 2026-10-29 — fix(contatos): a busca nos telefones extras só roda para termo com cara de número
- [ ] `2ed871266` 2026-11-02 — fix(contatos): o baseline volta a subir o banco, com 56 linhas que o rebase colou
- [ ] `f83ae225a` 2026-11-07 — fix(contatos): a conversa do contato novo abre pelo cliente de serviço
- [ ] `d563ebb76` 2026-11-07 — fix(contatos): a comparação por CPF passa a ser feita no servidor
- [ ] `fa60a31b4` 2026-11-12 — fix(contatos): alcance os contatos sem atividade ao paginar

### contrib (2)
- [ ] `8037a4283` 2026-11-04 — fix(contrib): preserve varredura anon após apêndices
- [ ] `bab5e931e` 2026-11-04 — fix(contrib): preserve varredura anon após apêndices

### conversa (1)
- [ ] `9b2fced66` 2026-11-05 — fix(conversa): abrir sem canal escolhido pula o canal desligado (#4092)

### conversas (1)
- [ ] `b968cbfea` 2026-11-05 — fix(conversas): abrir a conversa do cadastro só no canal que pode enviar (#3483)

### conversations (2)
- [ ] `4d587a642` 2026-10-26 — fix(conversations): devolver ao automático não tira a conversa de outro atendente (#3436)
- [ ] `13633bdf1` 2026-11-04 — fix(conversations): a recusa de devolver ao automático a conversa de outro atendente chega em espanhol (#3436)

### conversoes (1)
- [ ] `764de6b61` 2026-11-13 — fix(conversoes): canal social não herda a ponte de venda do WhatsApp

### crm (1)
- [ ] `9db861546` 2026-10-29 — fix(crm): typecheck da fatia 2a #3669 — falha dos negocios entra na varredura

### crm-b2b (2)
- [ ] `b53296aff` 2026-11-09 — fix(crm-b2b): aplica a revisão da webtecnica no #4299
- [ ] `1d2e0c13b` 2026-11-09 — fix(crm-b2b): cita as evidências e usa nomeDoContato no nome sugerido

### custo-ia (1)
- [ ] `8cb06761a` 2026-10-24 — fix(custo-ia): o custo do turno do agente é fracionário, não 1 centavo por chamada

### db (4)
- [ ] `24356d67a` 2026-10-22 — fix(db): o apêndice da 0741 sobe para antes da varredura de anon
- [ ] `7e28bddd6` 2026-10-23 — fix(db): o bloco da 0711 vem depois do bloco da 0710 no baseline
- [ ] `8866339a9` 2026-10-26 — fix(db): preserve a policy final e os consumidores dos tipos reais
- [ ] `4b719579f` 2026-10-26 — fix(db): mantenha a varredura anon após o novo ciclo de casos

### deps (1)
- [ ] `7613d28ce` 2026-10-26 — fix(deps): atualize body-parser para a versão corrigida

### duplicados (1)
- [ ] `041f43276` 2026-11-05 — fix(duplicados): traduz o texto novo da dispensa e credita a autora

### escalacao (3)
- [ ] `1d4befcdd` 2026-10-22 — fix(escalacao): a pausa da IA no atendimento manual para de mentir (#534)
- [ ] `674ec9e34` 2026-11-08 — fix(escalacao): pausa da IA GARANTIDA no atendimento manual (#534)
- [ ] `2d7ad2e69` 2026-11-10 — fix(escalacao): quem pede para parar le a confirmacao de saida mesmo com frase propria

### event-log (1)
- [ ] `4831ce63e` 2026-10-29 — fix(event-log): o laço recua de 10s a 60s e volta ao piso quando acha trabalho (#3693)

### experiência (1)
- [ ] `7d995717a` 2026-11-06 — fix(experiência): fecha as quatro falhas medidas do CI (#4118 #4102 #4083)

### fila (1)
- [ ] `6c81e7e68` 2026-10-29 — fix(fila): recuo exponencial na fila vazia, de 2 s a 60 s (#3688)

### financeiro (1)
- [ ] `782b8fe46` 2026-10-29 — fix(financeiro): a comissão do item vai para quem atendeu, não para quem fatura

### follow-up (1)
- [ ] `c23ee6fb3` 2026-11-11 — fix(follow-up): texto barrado pela trava comercial sem cliente esperando só não sai

### followup (13)
- [ ] `85bea4fad` 2026-10-21 — fix(followup): teste do #3109 lê as conexões da matriz e a prosa não nomeia provider
- [ ] `366eae242` 2026-10-22 — fix(followup): card fechado não liga a porta da etapa, e o turno lê os roteiros ativos uma vez (#2630)
- [ ] `9155db9fe` 2026-10-22 — fix(followup): a etapa do funil vale uma vez por ENTRADA do card, não por turno (#2630)
- [ ] `74860e6cf` 2026-10-24 — fix(followup): traduz o destino da resposta e tira "contato" da varredura de wire (#3363)
- [ ] `0da4e0dc8` 2026-10-24 — fix(followup): a entrada gasta compara o milissegundo, e não só o segundo (#3253)
- [ ] `681b9f6c2` 2026-10-28 — fix(followup): o toque armado pela etapa morre quando o negócio sai dela, sem cancelar a si mesmo (#3603)
- [ ] `a06c73e12` 2026-10-29 — fix(followup): nó edit_lead_tag não carimba caused_by_rule na tag aplicada
- [ ] `948107ef5` 2026-10-31 — fix(followup): depois do retorno, o silêncio espera o gatilho do fluxo, com piso de 4 h
- [ ] `6ae77655e` 2026-10-31 — fix(followup): a saida da etapa roda antes do gatilho da etapa de destino
- [ ] `ee3a90b3a` 2026-11-04 — fix(followup): especialista de roteador atende pelo número do roteador (#3928)
- [ ] `280ffa9dc` 2026-11-05 — fix(followup): o editor reabre com a opcao send_when_assigned como esta no banco
- [ ] `422a9c3b9` 2026-11-10 — fix(followup): o cache de conversas do silencio vale so dentro da varredura (#4311)
- [ ] `8d64c4472` 2026-11-10 — fix(followup): uma leitura de conversas por organizacao na varredura de silencio (#4311)

### followups (4)
- [ ] `87dbb3a92` 2026-10-26 — fix(followups): atualiza o dossiê ao cancelar e completa notas do lote
- [ ] `54c52d5fc` 2026-10-26 — fix(followups): dossiê oferece cancelar para a espera longa e o roteiro (#3434)
- [ ] `d93ba4dab` 2026-11-14 — fix(followups): o negócio barrado pelo filtro aparece no detalhe do gatilho
- [ ] `967e62f04` 2026-11-14 — fix(followups): gatilho de negócio criado aceita filtro por funil e etiqueta (#4587)

### funil (9)
- [ ] `59c9c770d` 2026-10-21 — fix(funil): negócio reaberto não leva o motivo da perda antiga para a nova
- [ ] `10b1ff284` 2026-10-22 — fix(funil): o escritor de participantes grava na trilha de auditoria
- [ ] `7530ddfe9` 2026-10-23 — fix(funil): aba Lista abre sem a leitura do quadro (#3172)
- [ ] `b39ad61b1` 2026-10-30 — fix(funil): o funil arquivado aberto com ?visao=lista carrega o quadro
- [ ] `2207e165d` 2026-10-30 — fix(funil): trocar a etiqueta do filtro não soma mais as duas
- [ ] `6c2fa1ae4` 2026-10-30 — fix(funil): o quadro arquivado nao abre dossie por link e nao pisca escrita ao carregar
- [ ] `b842fbed5` 2026-10-30 — fix(funil): o funil arquivado abre em leitura, sem três escritas para olhar (#1298)
- [ ] `25256a9a1` 2026-10-31 — fix(funil): coluna do quadro usa a superfície que existe no tema (#3791)
- [ ] `9e24a6e96` 2026-11-04 — fix(funil): preserve o prazo da releitura entre renders

### funis (6)
- [ ] `637dc28b8` 2026-10-21 — fix(funis): recolher o editor do funil só esconde, sem perder a edição
- [ ] `2f490d567` 2026-10-21 — fix(funis): a tela também conta só os campos do negócio na cota (#3111)
- [ ] `73029aa14` 2026-10-24 — fix(funis): o seletor da entrada do Inbox só aparece no funil que o servidor lê
- [ ] `c0fbca88f` 2026-10-24 — fix(funis): a linha do campo só vira colunas a partir de lg (#3340)
- [ ] `e1fee2a06` 2026-11-06 — fix(funis): ancora so na chegada e recusa de nome a vista (#4083)
- [ ] `e1b9509dd` 2026-11-07 — fix(funis): chegar por ancora leva ate a secao, quando ela passa a existir (#4083)

### ghcr (1)
- [ ] `867cd21b4` 2026-11-07 — fix(ghcr): promover-stable roda com o build cancelado e falha alto sem imagem (#568)

### grupos (1)
- [ ] `425ebb634` 2026-11-04 — fix(grupos): a prévia da lista da Inbox mostra o nome do mencionado (#3566)

### guardrails (5)
- [ ] `8bcc775ad` 2026-10-30 — fix(guardrails): isencao de consentimento tolera so abertura de lista fechada (#3725)
- [ ] `3df638252` 2026-10-30 — fix(guardrails): oferta de humano não é promessa de humano (#3725)
- [ ] `f3e784ebb` 2026-10-31 — fix(guardrails): erro de ensino do case_promise nao manda open_human_case para a familia de retorno (#3725)
- [ ] `026e04440` 2026-11-02 — fix(guardrails): verifica o retorno do assistente com os casos desligados (#2916)
- [ ] `a9b3f1631` 2026-11-10 — fix(guardrails): o caminho quente volta a usar os padroes compilados no load

### health (2)
- [ ] `3f10b8983` 2026-10-29 — fix(health): leitura do corpo que falha não rebatiza a resposta de timeout
- [ ] `2af698ee0` 2026-10-29 — fix(health): importa afterEach no teste e usa corpoDoPostgrest no ramo 200 (#3677)

### historico (3)
- [ ] `addeee5e1` 2026-10-26 — fix(historico): ignore chats sem telefone válido na importação
- [ ] `9734c4f7f` 2026-10-28 — fix(historico): cercas e revisão da Spec 32 — telefones só dígitos, ficha guardada na retomada, aviso só sem resposta ao vivo, erro resumido, fechador paginado
- [ ] `51bbef84a` 2026-10-30 — fix(historico): a mensagem recuperada de uma queda não acorda follow-up nem manda texto, e o carimbo da conversa só anda para a frente (revisão do #3650)

### i18n (21)
- [ ] `a4fc07a99` 2026-10-21 — fix(i18n): espanhol dos textos novos e tipagem do teste (#3182)
- [ ] `d2f1115f3` 2026-10-21 — fix(i18n): remove a chave duplicada do dicionário (Importar CSV já existia)
- [ ] `14fca01a5` 2026-10-21 — fix(i18n): três traduções da receita repetidas saem do dicionário
- [ ] `5aa5903b3` 2026-10-22 — fix(i18n): tira a chave "Primeira mensagem" repetida no dicionário
- [ ] `b54c9af1a` 2026-10-22 — fix(i18n): espanhol das 2 frases do aviso de volta automática (#2757)
- [ ] `3f324ad0b` 2026-10-22 — fix(i18n): espanhol das últimas compras (#3242)
- [ ] `18bfe13f7` 2026-10-22 — fix(i18n): a descricao da Meta de vendas tambem tem espanhol
- [ ] `30a86bcae` 2026-10-28 — fix(i18n): "Guardar e iniciar conversación" no botão de salvar e abrir a conversa
- [ ] `61721b890` 2026-10-28 — fix(i18n): "Accesos de la tarjeta" no titulo dos atalhos do card
- [ ] `fe985870f` 2026-10-28 — fix(i18n): inclui as traduções do roteamento por remetente
- [ ] `187a4cd3d` 2026-10-28 — fix(i18n): coloca traduções do roteamento dentro do dicionário
- [ ] `0c72bc2a4` 2026-10-30 — fix(i18n): tira a chave "Abrir a conversa" repetida no dicionário (#3765)
- [ ] `0ab8d0c27` 2026-10-30 — fix(i18n): tira a chave duplicada "Abrir a conversa" do dicionário (#3732)
- [ ] `23d2fbfc2` 2026-10-30 — fix(i18n): "sem prazo" estava duas vezes no dicionário e derrubava o typecheck
- [ ] `dac427609` 2026-11-02 — fix(i18n): a chave /mês já existia desde o card da fatia 1 (#3602)
- [ ] `f927c98d3` 2026-11-04 — fix(i18n): complete as mensagens da contribuição
- [ ] `b5792c717` 2026-11-04 — fix(i18n): traduza as mensagens novas da contribuição
- [ ] `f0634a41c` 2026-11-04 — fix(i18n): traduza as mensagens novas da contribuição
- [ ] `e401dfed6` 2026-11-05 — fix(i18n): título do gráfico de custo em espanhol mantém o texto que o curso procura
- [ ] `a2490e146` 2026-11-06 — fix(i18n): não duplicar a frase da conexão que já existia no dicionário
- [ ] `09dc64208` 2026-11-15 — fix(i18n): o espanhol das três frases novas do #4630

### i18n,followup (1)
- [ ] `403f8f0d8` 2026-11-05 — fix(i18n,followup): chave duplicada no dicionario e assinatura do mock que o tsc recusava (#3974)

### ia (21)
- [ ] `16c8a680a` 2026-10-21 — fix(ia): a chave da instalacao nao herda o provedor configurado no registro de uso (#3185)
- [ ] `016ac4fc9` 2026-10-21 — fix(ia): a mídia grava o provedor pela MESMA régua do log de invocação (#3098)
- [ ] `d059087a4` 2026-10-21 — fix(ia): llm_calls grava o provedor efetivo do binding, não o palpite por barra (#3098)
- [ ] `95454af2c` 2026-10-22 — fix(ia): avisar o cliente nas duas passagens da restricao comercial
- [ ] `fa0072f63` 2026-10-29 — fix(ia): nome do campo de duração do turno e a metodologia da #1099 alinhada à issue
- [ ] `3740696e0` 2026-10-30 — fix(ia): o seletor de serviço do ponto com menu abre na opção padrão
- [ ] `b877c4f9d` 2026-10-30 — fix(ia): descartar alterações volta o campo de etiquetas do público
- [ ] `c079494f3` 2026-10-30 — fix(ia): campo de etiquetas do publico aceita virgula e espaco ao digitar
- [ ] `68f64f48e` 2026-10-30 — fix(ia): erro na escolha do agente volta a subir quando o classificador falha
- [ ] `daf6b492b` 2026-10-30 — fix(ia): publico do agente lido na selecao, fora da config do turno
- [ ] `e2bf33ef5` 2026-10-30 — fix(ia): o veto de registro afirmado sem efeito ganha causa, com espanhol
- [ ] `a54e04b25` 2026-10-31 — fix(ia): so recusa de login abre o aviso de conta desconectada (#3371)
- [ ] `3ccad1e89` 2026-11-02 — fix(ia): motivo do veto de retorno sem casos reaproveita o texto traduzido
- [ ] `50074300c` 2026-11-03 — fix(ia): revise confirmações com comprovantes da agenda
- [ ] `be263e2e0` 2026-11-04 — fix(ia): resposta barrada de novo na correção abre caso, em vez de calar o turno (#4038)
- [ ] `22d66add9` 2026-11-04 — fix(ia): o agente confere o que o cliente atribui à empresa antes de confirmar (#3964)
- [ ] `3061aacf4` 2026-11-05 — fix(ia): falha do banco no teste do agente responde 502, que o cliente não repete
- [ ] `bb4b1bdb0` 2026-11-11 — fix(ia): voz do agente ignora a resposta que chega depois de desmontar
- [ ] `1c8f402f3` 2026-11-12 — fix(ia): a execução de teste leva as ações propostas ao trace
- [ ] `a717727cc` 2026-11-14 — fix(ia): o rótulo "em nome de" do histórico segue a mesma guarda da tela
- [ ] `036bf0cfc` 2026-11-14 — fix(ia): o provedor personalizado pede JSON também no ensaio e nos workers

### importacao (1)
- [ ] `a9e778aaa` 2026-11-12 — fix(importacao): confirme o vínculo entre empresa e pessoa

### inbox (47)
- [ ] `48eac1c7f` 2026-10-21 — fix(inbox): estreita o rascunho antes de ler o id do aviso
- [ ] `f2e31432d` 2026-10-21 — fix(inbox): o aviso do reenvio recusado le o status dentro de data
- [ ] `43e40ddd4` 2026-10-21 — fix(inbox): quem so le nao ve o botao de reenvio, e a rota prova o portao
- [ ] `4e178684a` 2026-10-21 — fix(inbox): sem botao de reenvio para midia fora da pasta da conversa
- [ ] `69d80a97a` 2026-10-21 — fix(inbox): chave de idempotencia do composer so vale logo depois do erro
- [ ] `ce900bc43` 2026-10-21 — fix(inbox): recusa do reenvio recarrega a bolha e abre a confirmacao
- [ ] `5db82b344` 2026-10-21 — fix(inbox): a setinha de opcoes da mensagem tem 44px de area no toque
- [ ] `bfe52c864` 2026-10-22 — fix(inbox): compositor bloqueado nao consulta o rascunho assistido
- [ ] `df6ddfda4` 2026-10-22 — fix(inbox): o menu e a trava ate assumir param de se sobrescrever (#3012)
- [ ] `4183078bb` 2026-10-22 — fix(inbox): seção de follow-up reconhece quem ocupa a vaga e cobra manager (#3247)
- [ ] `8b1cc9302` 2026-10-23 — fix(inbox): devolve ao automático ANTES de fechar; sem atendimento fantasma (#3313)
- [ ] `0d046ac74` 2026-10-23 — fix(inbox): o desfecho do parceiro com código sem frase mostra a explicação
- [ ] `43951cc65` 2026-10-23 — fix(inbox): a recusa do modelo diz a causa, e o #2835 revisto diz o que mede
- [ ] `4e4487aee` 2026-10-23 — fix(inbox): o texto cru do canal sai da tela, e as frases nossas voltam
- [ ] `05c2932e7` 2026-10-23 — fix(inbox): o motivo da falha é a mesma frase no tooltip, na linha e nos toasts
- [ ] `e4c0d54a6` 2026-10-24 — fix(inbox): o Parar alcança a inscrição dormente na seção de follow-up (#3375)
- [ ] `2e043f462` 2026-10-26 — fix(inbox): preserva preferências durante a troca e prepara provas dos textos compartilhados
- [ ] `953229bc2` 2026-10-26 — fix(inbox): reconheça MIME pelo mapa canônico e preserve o gate de canais
- [ ] `c647ace50` 2026-10-26 — fix(inbox): respeitar o ramo de leitura já separado no cabeçalho
- [ ] `c2b2780b1` 2026-10-26 — fix(inbox): a barra de respostas rápidas não apaga mais o rascunho do campo (#3354)
- [ ] `20e366d6f` 2026-10-27 — fix(inbox): mantenha o formato do documento legível no toque
- [ ] `f1f958002` 2026-10-27 — fix(inbox): separe o download do menu no toque
- [ ] `b22e247ab` 2026-10-29 — fix(inbox): proprio ABERTO vence o relacionado no painel, e a falha do vinculo sobe
- [ ] `d811a7ef8` 2026-10-29 — fix(inbox): ferramenta desconhecida na prévia não vira "versão barrada"
- [ ] `dccd19744` 2026-10-29 — fix(inbox): o balão lê só o nome gravado pelo servidor e mantém IA traduzível
- [ ] `c0f0699cc` 2026-10-29 — fix(inbox): o nome do agente é lido uma vez e serve à assinatura e ao balão
- [ ] `0f77045bc` 2026-10-30 — fix(inbox): o motivo da mídia apagada por retenção aparece escrito na tela (#3756)
- [ ] `13bcdf9e3` 2026-10-30 — fix(inbox): sugestão de resposta fala na voz do atendente, não na do agente (#3757)
- [ ] `a376bdbb8` 2026-10-30 — fix(inbox): o aviso do Transferir rotula o numero pela regra do canal
- [ ] `727f85edf` 2026-10-31 — fix(inbox): fechar com devolução segue a mesma regra de dono do botão Devolver
- [ ] `6fa9d160b` 2026-11-01 — fix(inbox): a bolha pulada pela agenda não leva a moldura de erro
- [ ] `c8c9b6abc` 2026-11-05 — fix(inbox): canal desconhecido segue com o balao sobre o avatar
- [ ] `957e7d519` 2026-11-06 — fix(inbox): campo de mensagem volta ao foco depois do envio (#4148)
- [ ] `610d58958` 2026-11-08 — fix(inbox): filtro de etiqueta distingue "ainda não sei" de "vazio" e não some com filtro aplicado (#1336)
- [ ] `ffa402dc9` 2026-11-10 — fix(inbox): o seletor de "Mais emojis" cabe no modal a 375px
- [ ] `fd4428e48` 2026-11-10 — fix(inbox): o tique do canal oficial lê delivered_at/read_at (#4316)
- [ ] `cfbf8b78a` 2026-11-10 — fix(inbox): reação respeita opt-out, pessoal, grupo e auditoria (#4194)
- [ ] `f0a6aaef9` 2026-11-11 — fix(inbox): o envio de mídia espera o servidor, e a tela não convida a reenviar
- [ ] `bb8ca53cd` 2026-11-13 — fix(inbox): o trecho citado leva até a mensagem original (#4575)
- [ ] `3c0a0511e` 2026-11-13 — fix(inbox): o botão "Excluir nota" aparece com o foco do teclado (#4562)
- [ ] `a4d694ca1` 2026-11-13 — fix(inbox): corrige tipagem e assercao do teste e frontmatter do fragmento
- [ ] `48e87beaa` 2026-11-13 — fix(inbox): exibe o nome salvo na agenda do contato no painel Nova conversa
- [ ] `c534a034f` 2026-11-14 — fix(inbox): a busca da conversa e a do seletor ignoram acento
- [ ] `c3372896e` 2026-11-14 — fix(inbox): a citação vira texto onde não há fio rolável (#4575)
- [ ] `5abc9fa27` 2026-11-15 — fix(inbox): o trecho citado chega ao leitor de tela como descrição do botão
- [ ] `830f743d0` 2026-11-15 — fix(inbox): o endereço na citação clicável sai como texto, não como link
- [ ] `fa38fe94b` 2026-11-15 — fix(inbox): devolve ao cabeçalho e ao painel o que o PR apagou sem querer

### instalação (3)
- [ ] `fe03381a1` 2026-10-21 — fix(instalação): a instalação atrás de Traefik volta a provar a rota pública do Supabase
- [ ] `2f318c414` 2026-10-22 — fix(instalação): o aviso da rota do Supabase não manda rodar de novo
- [ ] `e698d06e6` 2026-10-22 — fix(instalação): o 307 do CRM também denuncia a rota pública do Supabase

### kanban (4)
- [ ] `75db3be14` 2026-10-29 — fix(kanban): busca pelo telefone principal, com ou sem mascara
- [ ] `071fa0c5b` 2026-10-30 — fix(kanban): o order da entrada declara o ascending (#3461)
- [ ] `888f326d5` 2026-11-02 — fix(kanban): os botões novos do vínculo do contato têm alvo de toque no celular
- [ ] `41d2bfff3` 2026-11-02 — fix(kanban): desvincular alcança também o contato que não carrega (#852)

### kit (4)
- [ ] `8fc2fb2e8` 2026-10-22 — fix(kit): restore usa a MESMA conta da atualização (o dono) (#2381)
- [ ] `680677f4c` 2026-10-26 — fix(kit): confira tar descompactado antes do restore
- [ ] `c3945c125` 2026-11-05 — fix(kit): o veredito de saúde corta a resposta sem abrir pipe
- [ ] `0d9ce65f2` 2026-11-05 — fix(kit): healthcheck diz "saudável" só com status geral healthy (#4087)

### leads (4)
- [ ] `ffba81b8b` 2026-10-26 — fix(leads): a criação não cobra o campo de arquivo da etapa (#3433)
- [ ] `4fe5c078e` 2026-10-28 — fix(leads): edição parcial do valor recorrente preserva o que já está gravado
- [ ] `6e7c8fdad` 2026-10-29 — fix(leads): Novo Lead nasce sem a mensalidade do anterior, e apagar a mensalidade leva a duracao (#3610)
- [ ] `04c138f6c` 2026-11-15 — fix(leads): o INSERT do clone volta para a sessão; só o vínculo vai pelo serviço

### legal (5)
- [ ] `b169d2efc` 2026-11-13 — fix(legal): a cláusula 9 lista também o Jev e o serviço de voz (#4520)
- [ ] `f51ca1519` 2026-11-13 — fix(legal): cláusula de transferência internacional lista os países dos provedores ativos (#4520)
- [ ] `d2e0ccd6b` 2026-11-14 — fix(legal): separar a sede do provedor do país que ele declara na cláusula 9
- [ ] `d1e2ecaf1` 2026-11-15 — fix(legal): o parágrafo da data não diz "declaração do provedor" para todos
- [ ] `de802c3c6` 2026-11-15 — fix(legal): a linha da sede só afirma sobre a região o que o catálogo registra

### lgpd (4)
- [ ] `f6f49f740` 2026-10-26 — fix(lgpd): aceite módulo opcional ausente no PostgREST
- [ ] `1715432b7` 2026-10-27 — fix(lgpd): isola anexos e prepara prova real do pacote manual
- [ ] `81a69c138` 2026-10-29 — fix(lgpd): o acesso do titular leva o endereço da pessoa física
- [ ] `52ea9af6e` 2026-11-07 — fix(lgpd): o mes legal do art. 12.o n.o 3 vale ate o FIM do dia

### llm (1)
- [ ] `de09acb33` 2026-11-14 — fix(llm): a queda da assinatura guarda o erro original ao lado do erro da reserva (#4610)

### lote (10)
- [ ] `dbee3592b` 2026-11-10 — fix(lote): ajuste do #4132 — a troca das constraints do lembrete vai num bloco DO no baseline
- [ ] `2b394ebc4` 2026-11-10 — fix(lote): ajuste do #4272 — falhasDeLeitura é opcional: quem não informa falha não tem falha
- [ ] `e73316fdb` 2026-11-10 — fix(lote): ajuste do #4347 — dica do {{campo|data}} nas telas de automação e follow-up
- [ ] `2700a4d17` 2026-11-10 — fix(lote): ajuste do #4348 — o rastro do número sem roteador não vira lacuna falsa no painel
- [ ] `2f2d7d249` 2026-11-10 — fix(lote): ajuste do #4277 — o bloco MODO ASSISTIDO vai inteiro para o espanhol
- [ ] `e5c434618` 2026-11-10 — fix(lote): ajuste do #4272 — o aviso de falha de leitura cede depois de uma releitura bem-sucedida
- [ ] `7046d79af` 2026-11-10 — fix(lote): ajuste do #4287 — o painel do dia só aparece para quem tem turma
- [ ] `be24c2f70` 2026-11-10 — fix(lote): ajuste do #4274 — o zoom de 2x ancora no canto superior esquerdo
- [ ] `e59d207fe` 2026-11-10 — fix(lote): ajuste do #4122 — tira a chave "Abrir o agente" repetida do dicionário
- [ ] `80456957a` 2026-11-11 — fix(lote): ajuste do #4117 — a chave Recebida já veio pela main

### mcp (1)
- [ ] `ccab7e614` 2026-11-10 — fix(mcp): recusa sem efeito deixa de ser auditada como success:true (#4343)

### memoria (2)
- [ ] `eb2d22fb0` 2026-10-31 — fix(memoria): o "Vale até" grava ao sair do campo, não a cada tecla
- [ ] `1c91db0de` 2026-11-08 — fix(memoria): leitura que falha nao tem mais a cara de memoria vazia

### mensagens (1)
- [ ] `015f43fae` 2026-11-04 — fix(mensagens): ocultar, editar e apagar comparam a prévia com a mesma régua que a grava

### menu (1)
- [ ] `91676d733` 2026-11-12 — fix(menu): o rodape fixo carrega a classe do grupo organizacao e a dos seus destinos

### messaging (1)
- [ ] `c9673605c` 2026-10-26 — fix(messaging): conferir organização da mídia na leitura

### meta (1)
- [ ] `9317df009` 2026-10-26 — fix(meta): contato apagado a pedido não volta pela agenda do app (#3432)

### mfa (1)
- [ ] `acaf54b3b` 2026-10-21 — fix(mfa): a falha do cadastro e da confirmação do fator fica no log do servidor

### midia (4)
- [ ] `619a653f9` 2026-10-21 — fix(midia): o ffmpeg so le os formatos de audio que o conversor espera
- [ ] `5dd6c0fdf` 2026-10-21 — fix(midia): uma organizacao nao ocupa sozinha as vagas de conversao de audio
- [ ] `376d89183` 2026-10-22 — fix(midia): comentarios sem nome de provider e doc do passo com os tipos novos
- [ ] `10af3851e` 2026-11-11 — fix(midia): o proxy repassa a rota o corpo inteiro do anexo ate o teto de midia

### moeda (2)
- [ ] `9a232cf6c` 2026-10-23 — fix(moeda): o valor digitado em comandas, faturamento, honorários, agenda e recorrências é lido pela moeda da organização (#3367)
- [ ] `d2da56cee` 2026-10-23 — fix(moeda): sinal repetido é sempre milhar, em qualquer moeda (#3331)

### nav (2)
- [ ] `4bfe30d1d` 2026-10-27 — fix(nav): Chamadas só aparece no menu com a telefonia em uso na organização (#1290)
- [ ] `5e0f30986` 2026-10-31 — fix(nav): o sinal de telefonia enxerga todas as fontes reais, e não conta ligação de WhatsApp

### negocio (1)
- [ ] `286ffdc32` 2026-11-04 — fix(negocio): identifique o card na confirmação de perda

### nota (2)
- [ ] `f4836b6df` 2026-10-31 — fix(nota): menção guardada pela posição respeita a mesma fronteira de palavra
- [ ] `53f6943a5` 2026-10-31 — fix(nota): menção apagada sai da lista e deixa de avisar (#2463)

### notificacoes (3)
- [ ] `8be4df8a8` 2026-10-21 — fix(notificacoes): os motivos do push ignorado dizem qual caminho não inscreveu
- [ ] `dc4153342` 2026-10-22 — fix(notificacoes): sem VAPID ou sem service worker o interruptor de Push continua ligado (#3157)
- [ ] `2cc02f08c` 2026-11-05 — fix(notificacoes): aviso de etapa com destinatario segue sem valor; teste do dublê de push

### notifications (1)
- [ ] `adb1af1ee` 2026-10-26 — fix(notifications): o aviso de nova mensagem ignora o historico importado (#3427)

### novo-lead (1)
- [ ] `88b63b6c7` 2026-10-21 — fix(novo-lead): formulário exibe os campos que a etapa exige (#3038)

### nuvemshop (3)
- [ ] `ff90ed8ed` 2026-10-21 — fix(nuvemshop): o catálogo da loja nunca chega ao acervo do agente
- [ ] `fe5775905` 2026-10-22 — fix(nuvemshop): o nome do evento de produto sai da variavel eventLogType
- [ ] `12b21c0df` 2026-10-31 — fix(nuvemshop): o catálogo da loja volta a entrar na base do agente

### obs (1)
- [ ] `9c909682e` 2026-11-11 — fix(obs): razão de cache e aviso só com chamadas cacheáveis (#4362)

### onboarding (2)
- [ ] `8884c8371` 2026-11-04 — fix(onboarding): exija o destino explícito do formulário
- [ ] `c5e0a860a` 2026-11-05 — fix(onboarding): o convite do passo 6 vira linha em team_invites

### operador (2)
- [ ] `b627efba4` 2026-11-10 — fix(operador): no assistido a mão do Operador não tem ferramenta de saída
- [ ] `eeb007b92` 2026-11-11 — fix(operador): no assistido, a agenda sai da mão do Operador (doc 327 = A)

### opt-out (3)
- [ ] `cb3bf3824` 2026-10-21 — fix(opt-out): a assinatura da atendente e so o negrito com dois pontos (#3078)
- [ ] `764fdc1c9` 2026-11-13 — fix(opt-out): "cancelar" sozinho, inscrição e boleto não descadastram
- [ ] `5c41790c1` 2026-11-14 — fix(opt-out): "envios" e material promocional seguem sendo pedido de saída

### outros (6)
- [ ] `674a81a23` 2026-10-26 — fix: descartar avisos de contexto ou responsável vencido
- [ ] `6f43171d1` 2026-10-26 — fix: porte a guarda de importação e prepare as provas conjuntas do lote
- [ ] `0f5ba0329` 2026-10-26 — fix: preserve SMTP password when database read fails
- [ ] `dd20c4e79` 2026-10-31 — fix: marca da organização mostra o logo escuro na prévia e deixa removê-lo
- [ ] `4b4c7a86d` 2026-11-07 — fix: atender invariantes de canais, marca e tradução das reações
- [ ] `dc56d7f93` 2026-11-11 — fix: o follow-up vetado pela trava de repetição diz qual trava segurou (#4428)

### ouvidoria (1)
- [ ] `df226f4c1` 2026-11-10 — fix(ouvidoria): a parte 1 entra sem aparecer em Modulos (#3625)

### pacing (1)
- [ ] `a1f375b08` 2026-10-30 — fix(pacing): prospeccao prevalece sobre resposta; testes da contagem do dia (9050)

### painel (1)
- [ ] `a6fdbcb50` 2026-11-07 — fix(painel): conversa passada pelo motor entra em Aguardando, e o cartao rola dentro da coluna

### pipelines (1)
- [ ] `69d749d6b` 2026-10-24 — fix(pipelines): estado do recorte antes do da entrada do Inbox no editor

### pos-entrada (1)
- [ ] `46f12a424` 2026-10-22 — fix(pos-entrada): opt-out encerra as demandas abertas do contato (#3288)

### previsao (3)
- [ ] `be8fc0feb` 2026-11-06 — fix(previsao): ordenação por moeda genérica e descrição da tool no teto de tokens (#3602)
- [ ] `84e3ec96b` 2026-11-11 — fix(previsao): ordena a leitura so por id, ajusta dubles e descricao da ferramenta (#4322)
- [ ] `40304b926` 2026-11-11 — fix(previsao): pagina a leitura do funil e avisa quando a carteira passa do teto (#4322)

### promessa (1)
- [ ] `e85f7bcb3` 2026-10-31 — fix(promessa): repasse alegado sem objeto conta como promessa de humano

### prospeccao (5)
- [ ] `eb3edbc6c` 2026-10-26 — fix(prospeccao): o aviso de etiqueta da campanha explica por que vai sem origem de atendimento
- [ ] `50fc3e917` 2026-11-05 — fix(prospeccao): o prazo do tick vale entre as campanhas da mesma organização
- [ ] `a39792ade` 2026-11-07 — fix(prospeccao): campanha só de site não ganha a linha das ofertas
- [ ] `31ec92203` 2026-11-11 — fix(prospeccao): a prévia da saída cita o texto que o envio leva (#4370)
- [ ] `ed32ac310` 2026-11-14 — fix(prospeccao): card da campanha nasce com as etiquetas do ramo (#4586)

### prospecting (3)
- [ ] `368870720` 2026-10-24 — fix(prospecting): a tela reconhece o local-http como configurado (#2942)
- [ ] `ccec36fcb` 2026-11-14 — fix(prospecting): a empresa vetada não gasta a vaga do número e o motivo tem espanhol
- [ ] `e9ffd0057` 2026-11-14 — fix(prospecting): a guarda veta ficha pessoal, sempre humano e contato da equipe sem pausar a campanha

### prospecção (6)
- [ ] `ae9b30973` 2026-10-28 — fix(prospecção): ficha que já existe só recebe links pelo botão
- [ ] `6ab11a8ef` 2026-10-29 — fix(prospecção): etiqueta limitada a 40 caracteres na API e comentários da junção dizem o que o código faz (revisão do #3468)
- [ ] `db2a79637` 2026-10-29 — fix(prospecção): o logger importado uma vez só depois do merge com a main
- [ ] `3df481068` 2026-10-30 — fix(prospecção): os dois botões da planilha empilham na coluna estreita do computador
- [ ] `d865e3860` 2026-11-03 — fix(prospecção): o contador do WhatsApp só aparece quando há veredito
- [ ] `286dfc7d5` 2026-11-06 — fix(prospecção): o campo de etiquetas aparece nos dois modos e o nicho só preenche quando cabe

### provedores (1)
- [ ] `e9b3e931f` 2026-11-04 — fix(provedores): cabeçalho do cartão usa a largura toda no celular

### radar (2)
- [ ] `e2e60c9b4` 2026-11-04 — fix(radar): negocio aberto fora do teto de 500 segue na revisao
- [ ] `e71893250` 2026-11-04 — fix(radar): retire propostas de negócios fora do conjunto aberto

### rebase (1)
- [ ] `27de5de8b` 2026-10-29 — fix(rebase): restaura a união dos seis resgates sobre a main atual

### request-id (1)
- [ ] `f4c05934f` 2026-11-08 — fix(request-id): o helper nao derruba resposta quando o duble nao tem headers

### retencao (1)
- [ ] `ec1498519` 2026-11-12 — fix(retencao): o expurgo do texto vencido chega inteiro ao kit e a cerca mede a cadeia

### rodizio (1)
- [ ] `71b7c9f8d` 2026-11-03 — fix(rodizio): contato do tipo fornecedor não entra na distribuição automática (#3937)

### roteador (3)
- [ ] `d52bf1e76` 2026-11-06 — fix(roteador): destino gravado aparece na primeira renderização, com o seletor de etapa (#2569)
- [ ] `833256e55` 2026-11-12 — fix(roteador): os fatos do CRM saem para o Jev pelo scrub (#3917)
- [ ] `35892e274` 2026-11-12 — fix(roteador): a tela recarrega o aviso depois de mover o roteador (#4340)

### schema (1)
- [ ] `364adabdb` 2026-11-01 — fix(schema): o corpo do baseline já traz a ACL das funções de gatilho de motivo

### single-server (1)
- [ ] `f3e5f9ee5` 2026-10-24 — fix(single-server): o Auth reaproveita as conexões com o Postgres

### tags (1)
- [ ] `682980ae4` 2026-10-22 — fix(tags): juntar so leva para etiqueta que existe, em qualquer pagina

### tarefas (3)
- [ ] `1a7d2885f` 2026-10-21 — fix(tarefas): tarefa nova em "Minhas" nasce da pessoa, e o endereço do lembrete fica preso à página
- [ ] `06f6ae956` 2026-10-22 — fix(tarefas): botões voltam ao tamanho de sempre no computador
- [ ] `1a9bb4246` 2026-11-13 — fix(tarefas): recuse edição sem ler o estado anterior

### templates (2)
- [ ] `93864f087` 2026-10-22 — fix(templates): a resposta rapida nova nasce no topo, sem empate
- [ ] `4b59e9b22` 2026-10-22 — fix(templates): reordenar confere a escrita e recusa a renumeracao antes de escrever

### test (1)
- [ ] `a0c39b558` 2026-10-23 — fix(test): declara as colunas de atividade e traduz o recorte para espanhol (#2995)

### tipos (1)
- [ ] `e800242dd` 2026-11-08 — fix(tipos): chave duplicada no dicionario e uniao de midia no teste da retomada

### turno (1)
- [ ] `f5c51f146` 2026-11-01 — fix(turno): a reanotação depois da espera só vale quando a mídia derivou (#3836)

### types (1)
- [ ] `1bfe5a1a7` 2026-10-28 — fix(types): a periodicidade é "monthly", não string

### ui (6)
- [ ] `f98de8055` 2026-10-22 — fix(ui): caixa de detalhe dos gráficos de uso da instalação ganha o fundo do tema
- [ ] `e3967f768` 2026-10-22 — fix(ui): gráficos de uso apontam para tokens de cor que existem
- [ ] `746e636b3` 2026-10-28 — fix(ui): o título do modal quebra identificador longo em vez de sair cortado
- [ ] `c402eacdf` 2026-10-28 — fix(ui): exemplo de telefone segue o país da org no editor do roteador
- [ ] `d11effda0` 2026-10-29 — fix(ui): comentário do título do modal deixa de nomear o provedor
- [ ] `8b41f2a32` 2026-10-29 — fix(ui): o X da gaveta fica acima de faixa sticky do conteudo (#3585)

### uploads (1)
- [ ] `c7aa3db45` 2026-11-08 — fix(uploads): envio sem content-length passa, com o teto garantido pela contagem

### uso (1)
- [ ] `beac6fefb` 2026-11-04 — fix(uso): distinga dólar de reais e chamadas sem preço

### variaveis (4)
- [ ] `70e55b174` 2026-11-11 — fix(variaveis): a reserva do nome volta a cobrir a falta no Inbox (#3687)
- [ ] `b58378cdc` 2026-11-11 — fix(variaveis): useId sai do ?? e o fragmento ganha o bloco de atencao
- [ ] `fc263de6d` 2026-11-12 — fix(variaveis): curinga do seletor vira dica e {{lead.title}} volta a um clique
- [ ] `7a244c5e8` 2026-11-13 — fix(variaveis): a busca do seletor acha a variável com ou sem acento

### voz (7)
- [ ] `542273db3` 2026-10-30 — fix(voz): o que nao cabe em audio sai em texto, inteiro
- [ ] `c6074ab27` 2026-10-31 — fix(voz): a voz do agente obedece ao interruptor de orçamento da tela de admin
- [ ] `12d2a2245` 2026-11-03 — fix(voz): na ligação recebida o agente fala primeiro
- [ ] `34b2217ed` 2026-11-04 — fix(voz): o atendimento da IA só vale sobre ligação que ainda toca
- [ ] `1658b087c` 2026-11-04 — fix(voz): recusar ligação SIP pela tela encerra a ligação de verdade
- [ ] `5d4e23342` 2026-11-04 — fix(voz): a ligação recebida que cai antes da IA não fica tocando para sempre
- [ ] `9b3256404` 2026-11-14 — fix(voz): rótulo curto em 'Quando falar' e a cerca da conversa no turno

### waha (3)
- [ ] `0ef5a2f1b` 2026-10-21 — fix(waha): a lista de ids do eco tolera payload sem id
- [ ] `27efd013c` 2026-10-21 — fix(waha): eco do reenvio e reconhecido como envio nosso
- [ ] `fae694066` 2026-10-22 — fix(waha): o eco de um apagar feito pela tela não vira trilha de celular (#3279)

### webhooks (4)
- [ ] `4a1840412` 2026-10-24 — fix(webhooks): o portão de um id só vale para envio com id, e o card que já é deste id é adotado
- [ ] `996b70fa9` 2026-10-31 — fix(webhooks): captação não completa contato fora da operação
- [ ] `8d6190286` 2026-11-05 — fix(webhooks): a grade de fontes não transborda no celular; e2e espera a lista e a revelação
- [ ] `63a1ee968` 2026-11-12 — fix(webhooks): add accessible names to copy buttons

### whatsapp (6)
- [ ] `87ab492aa` 2026-10-23 — fix(whatsapp): a importação do histórico confere todas as identidades da conversa (#999)
- [ ] `ab6da1aab` 2026-10-23 — fix(whatsapp): a importação do histórico pula quem foi apagado a pedido (#999, doc 186)
- [ ] `9cc1141f6` 2026-10-24 — fix(whatsapp): a importação do histórico confere a conversa inteira antes de gravar
- [ ] `b70389bd6` 2026-10-26 — fix(whatsapp): preserva a recuperação por confirmação de entrega
- [ ] `99bf8c73f` 2026-10-26 — fix(whatsapp): mensagem marcada como falha não ganha hora de entrega por aviso atrasado
- [ ] `f10a3753a` 2026-11-03 — fix(whatsapp): o pino que chega ou sai pelo número pareado entra como localização

### worker (2)
- [ ] `6fe7e7689` 2026-11-04 — fix(worker): a parada durante o start ainda grava o espelho da sessão
- [ ] `e8514c9a8` 2026-11-04 — fix(worker): respeite a parada durante a reconciliação

## parcial (540)

### #3015 (1)
- [ ] `72c1ae19a` 2026-10-24 — fix(#3015): a 0767 nasce do corpo da 0764 — o ramo de grupo nao podia sumir

### #3023 (1)
- [ ] `20317fc08` 2026-10-30 — fix(#3023): uma regua de rotulo de membro, e nunca o uuid na tela

### #3310 (1)
- [ ] `272058d0c` 2026-10-22 — fix(#3310): passagem para humano não se anuncia como opt-out

### #3315 (2)
- [ ] `71f452151` 2026-10-22 — fix(#3315): a junção de contatos não emite contact.phone_added
- [ ] `67ebf01de` 2026-10-22 — fix(#3315): os quatro caminhos que preenchiam telefone sem avisar agora emitem

### #3379 (1)
- [ ] `c7769050d` 2026-10-26 — fix(#3379): lançamento manual, recorrência, conta e parcela de honorários nascem na moeda da organização

### #3495 (1)
- [ ] `348461ec5` 2026-10-31 — fix(#3495): o cadastro de empresa aceita o CNPJ alfanumérico da Receita

### #3926 (1)
- [ ] `9a9aad7b5` 2026-11-04 — fix(#3926): atribuição do próprio turno não revoga o turno

### 1982 (1)
- [ ] `be7b351c2` 2026-11-07 — fix(1982): o botao de exportar sai daqui — o #4207 ja entrega essa tela

### 3534 (2)
- [ ] `bab2da035` 2026-11-04 — fix(3534): a etiqueta da equipe não abre o canal
- [ ] `775c2d714` 2026-11-04 — fix(3534): medidor de clima não passa o contato da equipe

### 4012 (2)
- [ ] `56f93c863` 2026-11-06 — fix(4012): wrapper le o bit da linha e a regua resolve o contato por dentro (#2739)
- [ ] `0dd2e1c11` 2026-11-06 — fix(4012): a regua e interna (revoke de authenticated) e a cerca conta TODA subconsulta em contacts (#4012)

### 4074 (1)
- [ ] `cbedbe8c5` 2026-11-07 — fix(4074): a migration vai para 9248 e a cerca do canal conhece a coluna nova

### 4242 (1)
- [ ] `60f178d62` 2026-11-07 — fix(4242): renumera a migration do rotulo para 9245 — 9242 ja e do #4238

### 4597 (1)
- [ ] `d3f88f786` 2026-11-14 — fix(4597): cabeçalho com caminho de volta em todas as subtelas de Configurações

### acervo (1)
- [ ] `7c5a3faeb` 2026-11-07 — fix(acervo): o trecho leva ao material de origem e o erro diz o motivo

### admin (3)
- [ ] `55f09b44b` 2026-10-30 — fix(admin): erro de banco vira frase do operador no toast (#3747)
- [ ] `88509e164` 2026-11-04 — fix(admin): explicite a relação direta entre empresa e conversa
- [ ] `7dddd149b` 2026-11-04 — fix(admin): some o período completo no painel de uso

### agenda (22)
- [ ] `9a1b7950c` 2026-10-21 — fix(agenda): remove FK redundante em calendar_service_professionals (#3219)
- [ ] `ba5e85c11` 2026-10-26 — fix(agenda): cancelamento por destino e o grupo conferido no servidor
- [ ] `f6e81c9ad` 2026-10-29 — fix(agenda): a preferência de canal do lembrete só desempata entre os elegíveis
- [ ] `bf95c442b` 2026-10-30 — fix(agenda): editar o título de um compromisso existente (#3776)
- [ ] `5d5e20f17` 2026-10-30 — fix(agenda): a lista de espera nasce com as três travas do suporte e o grant (#3414)
- [ ] `de1586e1f` 2026-10-31 — fix(agenda): o motivo do pulo tem frase na tela e no recibo (#3813)
- [ ] `d4f21adc4` 2026-11-02 — fix(agenda): querystring no schema canonico e data de calendario impossivel (#3221)
- [ ] `9cb98c15d` 2026-11-03 — fix(agenda): confira recibos das operações do turno
- [ ] `7e3998330` 2026-11-05 — fix(agenda): serviço fica fora da equipe e a lista editada chega ao evento
- [ ] `9f0371dac` 2026-11-05 — fix(agenda): a equipe editada e a chave do tipo voltam como foram gravadas
- [ ] `fd29b98d1` 2026-11-05 — fix(agenda): o convidado do checkpoint continua reconhecido quando ha lista de equipe
- [ ] `2121d70ee` 2026-11-05 — fix(agenda): o bloco do negocio no evento do Google nasce desligado e ganha chave na tela do tipo
- [ ] `ae641462e` 2026-11-06 — fix(agenda): a lista de convidados conta só identificador válido
- [ ] `70be4cdf5` 2026-11-06 — fix(agenda): o gatilho da agenda respeita a vaga segurada de serviço
- [ ] `03725874e` 2026-11-06 — fix(agenda): empresa suspensa não oferece vaga, e a porta da lista mora no hub do CRM
- [ ] `c100ceed2` 2026-11-06 — fix(agenda): o encaixe passa a ter prazos da organização, aviso real e fila que anda
- [ ] `c063b61ed` 2026-11-06 — fix(agenda): revisor de promessas le a reserva feita em turno anterior
- [ ] `3638ba612` 2026-11-07 — fix(agenda): a expiração de pendentes grava cancelled_at e deixa de dar 500
- [ ] `94c36530d` 2026-11-11 — fix(agenda): agenda do Google indisponível vira estado terminal no claim (#4448)
- [ ] `eb332142c` 2026-11-12 — fix(agenda): a fila do push do Google drena (#4448, segunda porta)
- [ ] `dffef7c81` 2026-11-12 — fix(agenda): a frase da agenda indisponível pede a ação que existe (#4448)
- [ ] `c06913347` 2026-11-13 — fix(agenda): a fila do push ganha view própria (#4448)

### agent (1)
- [ ] `62b25a9bc` 2026-10-27 — fix(agent): preservar recuperação única da prévia assistida

### agent-engine (1)
- [ ] `66a56855d` 2026-10-27 — fix(agent-engine): prévia assistida propõe texto quando o turno automático calaria (#3281)

### agente (15)
- [ ] `43ba4fb55` 2026-10-21 — fix(agente): o filtro de palavra-chave decide a entrada da conversa, não cada mensagem (#3142)
- [ ] `6a4569175` 2026-10-21 — fix(agente): a prévia de resposta separa decisão de falha da geração
- [ ] `ea5dd5daa` 2026-10-22 — fix(agente): a âncora do "já respondeu" é a outbound do agente, não o sticky (#3142)
- [ ] `c0856ddf4` 2026-10-26 — fix(agente): a fala so afirma o registro depois que ele existe (#3333)
- [ ] `413f3b875` 2026-10-27 — fix(agente): ligue a conferência de registro ao envio real
- [ ] `c2a37539c` 2026-10-27 — fix(agente): gate horario_da_agenda — só sai horário que a agenda devolveu
- [ ] `10a3b5081` 2026-10-27 — fix(agente): a prévia libera só a remota que o runtime classificou como leitura
- [ ] `39fcc22f1` 2026-10-28 — fix(agente): remarcar nao duplica, handoff de saude sai e turno mudo se corrige
- [ ] `f4c7ec116` 2026-10-31 — fix(agente): horario_da_agenda colhe a lista horarios[] de toda tool de agenda, so do topo
- [ ] `1c64c8268` 2026-11-06 — fix(agente): handoff de conversa encerrada deixa de calar as outras do contato (#4146)
- [ ] `3f2892317` 2026-11-08 — fix(agente): a fila cobre a chamada inteira, todas as ferramentas que falam com o cliente e a prévia
- [ ] `6e0568651` 2026-11-08 — fix(agente): as bolhas de um passo saem na ordem em que o modelo as escreveu
- [ ] `e5e9d70e7` 2026-11-08 — fix(agente): tira fatosDaOrganizacao de fuso-da-org e restaura a forma dos blocos
- [ ] `be2eb97f5` 2026-11-08 — fix(agente): prosa do turno fala o idioma da organização (#4260)
- [ ] `1a6043780` 2026-11-10 — fix(agente): recusa { erro, mensagem } deixa de contar como sucesso no traço e no gate (#4342)

### agentes (2)
- [ ] `1fef11757` 2026-11-04 — fix(agentes): a frase do Salvar rascunho com nome repetido sai no idioma de quem usa
- [ ] `bebd41658` 2026-11-04 — fix(agentes): nome repetido vira 409 com a frase no campo de nome

### ai (5)
- [ ] `9ba134ff0` 2026-10-22 — fix(ai): publish router members without direct channel (V1CRED draft)
- [ ] `04df8a2f8` 2026-10-28 — fix(ai): o editor avisa que a marca escrita nao roda na conversa, e a remota conta no teto (#3586)
- [ ] `4cd52aa2b` 2026-10-28 — fix(ai): editor do agente lista e marca as ferramentas do servidor MCP externo (#3586)
- [ ] `41cdc8acb` 2026-11-04 — fix(ai): a tela não escreve o código cru do vocabulário do canal
- [ ] `a0df7815d` 2026-11-04 — fix(ai): a tela do agente diz que o número está em modo de teste (#3976)

### anexos (7)
- [ ] `57f970f76` 2026-10-22 — fix(anexos): mídia, remoção e LGPD só tocam arquivo sob o prefixo do negócio
- [ ] `9dbace52c` 2026-10-22 — fix(anexos): o caminho do arquivo fica preso à organização e ao negócio
- [ ] `7e1697ad4` 2026-10-22 — fix(anexos): escrita em crm_lead_attachments exige agent também na RLS
- [ ] `d0cefa75e` 2026-10-22 — fix(anexos): a LGPD entrega o que apaga — export dos anexos e erro do delete conferido
- [ ] `0c8a8578e` 2026-10-22 — fix(anexos): o upload só aceita um campo de arquivo do funil do negócio
- [ ] `73caa7f2a` 2026-10-22 — fix(anexos): uma fonte da verdade — a régua de etapa conta crm_lead_attachments
- [ ] `5e659dda0` 2026-10-22 — fix(anexos): migration 0731 parte da poda de mídia da main e fica acima da varredura de anon

### api (2)
- [ ] `d0ef20442` 2026-11-04 — fix(api): o ID que a tela mostra passa a existir no log
- [ ] `41161a8dc` 2026-11-08 — fix(api): toda resposta montada à mão sob /api leva o X-Request-Id (#4107)

### asr (1)
- [ ] `62ede4ea3` 2026-10-27 — fix(asr): preserve transporte e custo do STT OpenRouter

### assinatura (1)
- [ ] `a428e7efb` 2026-10-27 — fix(assinatura): religar a conta preenche os modelos na hora (#3371)

### atalhos (1)
- [ ] `cb5113ba1` 2026-10-28 — fix(atalhos): o dominio do atalho fica fixo no modelo

### atendentes (2)
- [ ] `126e0883a` 2026-11-05 — fix(atendentes): o nome gravado na conversa segue a regra do vinculo com a organizacao
- [ ] `f539b8251` 2026-11-05 — fix(atendentes): o nome de atendente só se resolve para membro da organização

### atendimento (6)
- [ ] `d1a4476a3` 2026-10-21 — fix(atendimento): a conversa encerrada reabre mesmo com a mensagem fora de ordem
- [ ] `930ae3827` 2026-11-05 — fix(atendimento): escopo do setor segue a mesma regra de contato pessoal do atendimento conjunto
- [ ] `76d982511` 2026-11-10 — fix(atendimento): o episódio reaberto nunca começa antes do fim do anterior
- [ ] `0f0074e5f` 2026-11-11 — fix(atendimento): texto dos modos de visibilidade diz também o que NÃO é escondido (#4381)
- [ ] `f7a717742` 2026-11-12 — fix(atendimento): a nota da pesquisa nao reabre o atendimento encerrado
- [ ] `c1a443c13` 2026-11-12 — fix(atendimento): numero solto nao engole o atendimento, e a pesquisa passa pelos portoes do envio

### atualizacao (1)
- [ ] `49c4167b2` 2026-10-26 — fix(atualizacao): o retrato velho do host não afirma mais "é a mais recente"

### auth (15)
- [ ] `e2fb2b8e9` 2026-10-09 — fix(auth): preserve o convite nos caminhos de acesso e proteja os e-mails
- [ ] `4e68eb005` 2026-10-21 — fix(auth): poder de plataforma não aceita dispositivo confiável, num lugar só
- [ ] `151c146c9` 2026-10-21 — fix(auth): confiança presa ao fator e poder de plataforma exige o código
- [ ] `7179b25f8` 2026-10-23 — fix(auth): os códigos de recuperação antigos saem, e a tela pede para gerar novos
- [ ] `d3dd42c5d` 2026-10-23 — fix(auth): as ações da empresa pedem o código depois do papel
- [ ] `b722bfabc` 2026-10-23 — fix(auth): o poder de plataforma no banco exige a sessão confirmada pelo código
- [ ] `eb8eb0c56` 2026-10-23 — fix(auth): gerar códigos de recuperação novos pede o código desta sessão
- [ ] `ece54372e` 2026-10-23 — fix(auth): cadastro e confirmação recusam quando a lista de fatores falha
- [ ] `7f08cdc4e` 2026-10-23 — fix(auth): Extensões e Servidor MCP externo levam ao código antes de abrir
- [ ] `773c13978` 2026-10-24 — fix(auth): as nove telas de autenticacao saem da espera sem depender da transicao do roteador
- [ ] `507ecb8ee` 2026-10-29 — fix(auth): leitura da sessao fora de escopo de requisicao nao derruba nem atrapalha o logout
- [ ] `e11799cc9` 2026-10-29 — fix(auth): cache curto de 30 s entre requisicoes na cadeia de autorizacao (#3696)
- [ ] `1f733d78f` 2026-10-30 — fix(auth): a invalidacao do cache curto alcanca a tela, e nao so a rota que gravou
- [ ] `b855c48ce` 2026-11-03 — fix(auth): toda rota que aceita token tem porta no proxy
- [ ] `4013ee627` 2026-11-12 — fix(auth): o proxy nao serve a identidade em cache dentro da margem de renovacao

### automacao (17)
- [ ] `6ff482e15` 2026-10-21 — fix(automacao): o título do negócio também fica fora da mensagem para a equipe (#2642)
- [ ] `bf898d47d` 2026-10-21 — fix(automacao): a mensagem para a equipe leva só dado de forma fixa e o atalho para a ficha (#2642)
- [ ] `e91fb49ba` 2026-10-22 — fix(automacao): reserva lead.date_field_due ao servidor, como contact.birthday (0551) e contact.phone_added (0670)
- [ ] `ca349d86d` 2026-10-22 — fix(automacao): a 0743 parte da definicao da 0670 e mantem contact.phone_added
- [ ] `179568514` 2026-10-22 — fix(automacao): gatilho de data do funil (lead.date_field_due) alcanca a origem do atendimento
- [ ] `3c59bee48` 2026-10-22 — fix(automacao): a frase do e-mail diz o que a variável leva, não o corpo inteiro (#2642)
- [ ] `8a73e76dd` 2026-10-23 — fix(automacao): o lembrete por telefone não sai pelo canal social (#3358)
- [ ] `b95abb129` 2026-10-28 — fix(automacao): variável de campo de lista sai com o rótulo da opção (#3605)
- [ ] `f0cc96b93` 2026-10-31 — fix(automacao): tipagem do campo curado nas telas da regra (#3814)
- [ ] `a0becaebc` 2026-11-04 — fix(automacao): o gatilho de etapa parada alcança a origem (#4018)
- [ ] `494ec3373` 2026-11-05 — fix(automacao): a recusa do setor chega traduzida na Atividade (#3881)
- [ ] `7a69eb665` 2026-11-05 — fix(automacao): a acao Definir o setor segue o modulo Setores (#3881)
- [ ] `971961ab6` 2026-11-09 — fix(automacao): move para etapa de perda com motivo, e o recibo mostra o codigo real (#4297)
- [ ] `bdf09e737` 2026-11-11 — fix(automacao): os avisos do assistido saem no idioma da organização
- [ ] `8a7971fc0` 2026-11-11 — fix(automacao): no assistido, a marca segue a regra até o desfecho do negócio
- [ ] `adbca3c9c` 2026-11-12 — fix(automacao): com cliente esperando a trava de valores passa a conversa à equipe; o resto reescreve uma vez
- [ ] `a1a306357` 2026-11-13 — fix(automacao): disparar o que parou sem nada sair reabre o aviso e responde erro

### automacoes (2)
- [ ] `d1c8ccfec` 2026-11-06 — fix(automacoes): Tirar tag acha a etiqueta longa do contato e explica quando nao havia nada a tirar
- [ ] `a3db58780` 2026-11-11 — fix(automacoes): o gatilho de ligação perdida só aparece para quem tem telefonia

### automation (2)
- [ ] `5eea70e34` 2026-10-26 — fix(automation): proteja recibos históricos sem perder atualização concorrente
- [ ] `0758a44b3` 2026-10-26 — fix(automation): guarde causas técnicas sem a frase do provedor

### automações (2)
- [ ] `024153ff3` 2026-10-22 — fix(automações): a chave (regra, contato) é reservada ANTES de executar (#2974)
- [ ] `c6b478aa7` 2026-10-22 — fix(automações): a chave (regra, contato) é reservada ANTES de executar (#2974)

### aviso (1)
- [ ] `dc23331f8` 2026-11-04 — fix(aviso): a auditoria conta só quem recebeu número

### avisos (6)
- [ ] `557c9bced` 2026-10-29 — fix(avisos): guarda de suporte na rota e prova de RLS da tabela nova (#1418)
- [ ] `5dc44aab7` 2026-11-01 — fix(avisos): o destino do responsável passa pela guarda de número da própria organização (#3803)
- [ ] `069e90d02` 2026-11-02 — fix(avisos): "publicar agora" grava, o aviso vira módulo desligado e audita (#1418)
- [ ] `d3a1aadd2` 2026-11-02 — fix(avisos): recusa aviso agendado para o futuro em vez de gravar um órfão (#1418)
- [ ] `e6d7ac19e` 2026-11-03 — fix(avisos): a 9094 revoga EXECUTE pelo nome, como manda a regra das duas origens
- [ ] `b643aa8c0` 2026-11-06 — fix(avisos): manda a passagem com responsável só para ele no celular

### banco (2)
- [ ] `a3f6d7c1c` 2026-10-31 — fix(banco): a carteira da automação parte da 9039 e as conversas passam numa transação só (#3514)
- [ ] `51517ce3c` 2026-11-03 — fix(banco): f_unaccent nasce sem EXECUTE para public e anon

### banco-externo (4)
- [ ] `930e8f32a` 2026-10-21 — fix(banco-externo): conserta o que o CI da R4 apontou (tipos, lint, caminho do arquivo e cerca do anti-ban)
- [ ] `a10092b4d` 2026-10-21 — fix(banco-externo): a foto do agente é baixada pelo CRM, conferida e guardada antes de sair
- [ ] `9eb054a71` 2026-10-21 — fix(banco-externo): a tela pergunta antes de o modelo trocar o tipo de post e recusa rótulo sem chave
- [ ] `b880406a3` 2026-11-05 — fix(banco-externo): a foto por endereço fica restrita ao que os dados do turno trouxeram

### baseline (2)
- [ ] `e782cdc3f` 2026-11-01 — fix(baseline): o `drop` do CHECK do roteador fica colado no `add` (#3770)
- [ ] `da763c404` 2026-11-03 — fix(baseline): apendice da 9101 acima da varredura de anon e drop-if-exists colado ao add constraint

### busca (3)
- [ ] `376f6f5ac` 2026-11-03 — fix(busca): renumera a migration da busca sem acento para 9100
- [ ] `d4611c4c9` 2026-11-03 — fix(busca): a busca sem acento funciona quando a extensão unaccent já existe em outro schema
- [ ] `8b9f192dc` 2026-11-06 — fix(busca): filtro de acento vira função pura em lib/ nas quatro telas

### cadastro (3)
- [ ] `bd0ff4809` 2026-11-03 — fix(cadastro): a empresa nova nasce no idioma, fuso e moeda de quem se cadastra
- [ ] `2e3f90530` 2026-11-07 — fix(cadastro): o molde de IA também semeia a linha da instalação antes de gravar (#4244)
- [ ] `d8f6ffa84` 2026-11-09 — fix(cadastro): link de plano só tira o Google quando resolve em plano oferecido

### cadencias (7)
- [ ] `51ec1f8ae` 2026-10-26 — fix(cadencias): integre contratos de navegação LGPD e cercas canônicas
- [ ] `354a4ab23` 2026-10-26 — fix(cadencias): mantenha provisionamento no módulo e exercite LGPD real
- [ ] `5ab7fc196` 2026-10-26 — fix(cadencias): serialize consentimento e reivindique trabalho com propriedade
- [ ] `8733ea087` 2026-11-07 — fix(cadencias): abrir o link nao descadastra; so o POST, com um clique
- [ ] `7ff653822` 2026-11-08 — fix(cadencias): o endereço atual do contato suprimido também ganha hash
- [ ] `691c58bb0` 2026-11-08 — fix(cadencias): o descadastro vale pelo endereço e o link resolve pelo destinatário do envio
- [ ] `a5320bdd5` 2026-11-08 — fix(cadencias): descadastro vale por contato e a inscrição respeita quem vê o negócio

### campanhas (7)
- [ ] `cb91337b6` 2026-10-24 — fix(campanhas): cada balao entra no ledger no instante em que saiu
- [ ] `369175e10` 2026-11-01 — fix(campanhas): o broadcast confere o teto antes de entregar a lista, e fecha os furos da revisão do #3126
- [ ] `75f37ed20` 2026-11-06 — fix(campanhas): broadcast relê a lista antes de mandar e cancelar confirma a parada
- [ ] `5f75f107b` 2026-11-06 — fix(campanhas): rascunho do broadcast só vale com leitura confirmada
- [ ] `469c67055` 2026-11-06 — fix(campanhas): rascunho do broadcast só sai com quem ainda está na lista
- [ ] `a17da02c4` 2026-11-06 — fix(campanhas): o broadcast confere a lista de exclusão e o estado da campanha antes de mandar
- [ ] `0c6a45e0a` 2026-11-07 — fix(campanhas): a transmissão respeita os limites já gastos e não reenvia reservado

### campos (1)
- [ ] `9cd31620c` 2026-11-05 — fix(campos): a linha do "+ condição" aparece na tela e o índice casa com o JSON

### canais (6)
- [ ] `65e63867c` 2026-11-06 — fix(canais): o 400 da agenda vira um erro TIPADO, e o nome do transporte sai da feature
- [ ] `f6f0c6047` 2026-11-06 — fix(canais): renumera o indice da espera em fila para 9242
- [ ] `8cd90ab8f` 2026-11-06 — fix(canais): a limpeza que apaga modelos entra no audit do Sincronizar
- [ ] `8db2c5cb5` 2026-11-06 — fix(canais): a troca de conta avisa na Central, inclusive quando a limpeza falha
- [ ] `63b56f28e` 2026-11-06 — fix(canais): a espera em fila avisa uma vez, no prazo certo e com rastro
- [ ] `e0cda7b7d` 2026-11-07 — fix(canais): a resposta segue os números que estão na ficha

### canal (7)
- [ ] `911ec4066` 2026-10-30 — fix(canal): a base da Bot API vira knob e o host entra declarado na catraca (#3440)
- [ ] `d197a72b0` 2026-11-03 — fix(canal): o número oficial responde 200 antes de processar a mensagem nova
- [ ] `d173b4fa9` 2026-11-03 — fix(canal): número oficial que envia e não recebe, ou com envio restrito, deixa de aparecer como saudável
- [ ] `5fb5fe3d5` 2026-11-06 — fix(canal): a linha aceita que passa da janela confere os efeitos antes de fechar
- [ ] `645ad5f89` 2026-11-06 — fix(canal): a entrada aceita fecha só quando a mensagem terminou de entrar
- [ ] `68edf85a7` 2026-11-11 — fix(canal): o robô não faz campanha, e a exceção de autenticação não se diz HMAC (#3486)
- [ ] `9f00c8b89` 2026-11-14 — fix(canal): o arquivo do webhook aceita o robô do Telegram

### canal-oficial (1)
- [ ] `c5f4e5f8a` 2026-11-04 — fix(canal-oficial): só o servidor grava a credencial do número oficial

### canal-parceiro (3)
- [ ] `f9f72331a` 2026-11-03 — fix(canal-parceiro): o webhook único usa só a base configurada da instalação
- [ ] `c01d96a57` 2026-11-03 — fix(canal-parceiro): arquivar, apagar e trocar a dona da conexão pela instalação também ficam com o servidor
- [ ] `ec8a265b5` 2026-11-03 — fix(canal-parceiro): só o servidor grava a ligação do canal com a credencial da instalação

### captacao (1)
- [ ] `a30715f63` 2026-10-22 — fix(captacao): reaproveitar o card aberto exige assinatura na fonte (#3101)

### carteira (2)
- [ ] `1a2de34a0` 2026-11-03 — fix(carteira): alvo de toque de 44px e nome acessível nos seletores no celular
- [ ] `6db64e650` 2026-11-03 — fix(carteira): a conversa poe na carteira so o cliente sem dono (doc 250)

### casos (7)
- [ ] `e2d068161` 2026-10-25 — fix(casos): avise a equipe quando o cliente responder à pergunta
- [ ] `49a083aa8` 2026-10-31 — fix(casos): a pessoa encerra o caso sem avisar o cliente (#3810)
- [ ] `04430fbc3` 2026-11-04 — fix(casos): o estado vazio diz quem abre caso e que o repasse vai ao Inbox
- [ ] `487f0696b` 2026-11-04 — fix(casos): a tela vazia diz que a chave do agente esta desligada
- [ ] `6f6727722` 2026-11-06 — fix(casos): a tela e a spec dizem que o aviso sai de novo, e os testes cobram os dois modos
- [ ] `82cdb3066` 2026-11-07 — fix(casos): o link «Abrir o agente» para no interruptor, abaixo do cabeçalho
- [ ] `d4f2f3fec` 2026-11-07 — fix(casos): pedido de outro atendimento nao vai ao modelo, e a resposta fica marcada

### catalog (1)
- [ ] `1a7a14337` 2026-10-25 — fix(catalog): keep agent turn alive on presentation selection failures

### catalogo (7)
- [ ] `30d89313f` 2026-10-27 — fix(catalogo): alinhe fixtures e preserve a evidência da apresentação
- [ ] `eff3fdfcb` 2026-10-27 — fix(catalogo): preserve a operação original na retomada
- [ ] `eda64b49d` 2026-11-06 — fix(catalogo): o botão do cartão Catálogo não disputa o Salvar da tela
- [ ] `4a2839ed6` 2026-11-07 — fix(catalogo): áudio da apresentação aceita o m4a do iPhone
- [ ] `e025c8373` 2026-11-08 — fix(catalogo): mídia trocada com a apresentação adiada não mata mais o job
- [ ] `e295dd0bf` 2026-11-08 — fix(catalogo): veto do gate de envio na apresentação vira resposta do modelo
- [ ] `8417d0d7a` 2026-11-08 — fix(catalogo): despausar o agente retoma a apresentação em vez de cancelá-la

### celular (1)
- [ ] `332b50075` 2026-10-23 — fix(celular): Desempenho e Relatórios cabem a 390px, e a cerca mede o <main>

### cercas (1)
- [ ] `f406b6fb8` 2026-10-31 — fix(cercas): o CHECK do roteador nao cega mais a cerca do vocabulario de captacao (#3770)

### cobranca (6)
- [ ] `e82e015c2` 2026-10-27 — fix(cobranca): preserve recibo, autoridade e retomada explicita
- [ ] `22a6ece06` 2026-10-27 — fix(cobranca): continue para o primeiro pagamento apos autenticar
- [ ] `afe34bd37` 2026-10-28 — fix(cobranca): a isenção de vaga vale só para o WAHA
- [ ] `d64a35c02` 2026-10-28 — fix(cobranca): reviver uma conexao sem numero respeita a vaga do plano
- [ ] `4b0e1a1ea` 2026-11-10 — fix(cobranca): "Precisa de ajuda?" mostra o contato do suporte a quem administra
- [ ] `797b17b28` 2026-11-12 — fix(cobranca): o preço segue a moeda do plano também na recuperação de conta

### cold-call (1)
- [ ] `9990df8fa` 2026-11-03 — fix(cold-call): módulo desligado de fábrica, opt-out nos dois caminhos e fila grande (#3933)

### config (3)
- [ ] `d5a21feb5` 2026-11-02 — fix(config): apêndice do blueprint entra antes da varredura anon, e a frase sai da cauda do dicionário
- [ ] `2bc8b98fd` 2026-11-02 — fix(config): importar blueprint confere e grava numa transação só, e áudio não vira resposta vazia
- [ ] `8be344e34` 2026-11-07 — fix(config): blueprint grava quem importou, respeita o teto de 200 nas duas pontas e alinha o audit

### consentimento (1)
- [ ] `9460d627a` 2026-11-09 — fix(consentimento): a recusa gravada pela ficha (granted: false) bloqueia o envio

### contacts (1)
- [ ] `90f66b8fb` 2026-11-14 — fix(contacts): salvar o diagnóstico relê a ficha e só toca no que mudou

### contatos (16)
- [ ] `452a38bd2` 2026-10-21 — fix(contatos): CPF ou e-mail repetido responde 409 contact_exists
- [ ] `55343f1b6` 2026-10-27 — fix(contatos): a ficha pergunta ao vocabulario curado que o Inbox usa (Refs #3144)
- [ ] `2940965ef` 2026-10-28 — fix(contatos): cercas do CI — audit por id, e2e filtra a organização, rótulos com literal, agenda declarada e dublê com organização
- [ ] `e02f86b7d` 2026-10-28 — fix(contatos): dispensa responde no envelope de erro, mensagens em espanhol e teste só do nome contido
- [ ] `c060b2a89` 2026-10-29 — fix(contatos): o endereço da resposta pergunta à porta de canal, sem nomear o canal
- [ ] `c0d9b2a38` 2026-10-29 — fix(contatos): o par gêmeo entre principais segue aceito, escrita dos telefones exige agent, tipo sugerido no extra e dublês que conhecem contact_phones
- [ ] `fb5401b49` 2026-10-30 — fix(contatos): adicionar telefone valida pelo país da organização, como o PATCH (revisão do #3672)
- [ ] `810e60e75` 2026-10-30 — fix(contatos): a regra de "criar contato abre conversa" vive num lugar só (#3718)
- [ ] `17f96edfa` 2026-11-05 — fix(contatos): no "Só os seus", a conversa do contato novo nasce do Atendente que o criou (#3479)
- [ ] `13bb0ba4d` 2026-11-05 — fix(contatos): o CEP só consulta no Brasil, só quando mudou, e só a resposta vigente vale (#3494)
- [ ] `3fea4e91b` 2026-11-05 — fix(contatos): busca do funil e das portas de contato ignora acento (#3918)
- [ ] `257d47dfd` 2026-11-05 — fix(contatos): sync da agenda diz a causa certa quando o acervo está desligado (#4102)
- [ ] `31b971956` 2026-11-06 — fix(contatos): as respostas da API de contatos dizem só se há CPF
- [ ] `e884d7694` 2026-11-08 — fix(contatos): a ficha de telefones mostra a mensagem do servidor e avisa antes de descartar o rótulo
- [ ] `01ff08fe1` 2026-11-12 — fix(contatos): renumera a migration do rótulo para 9354 e zera o rótulo da ficha sem telefone (#4242)
- [ ] `ee0d0e3b3` 2026-11-13 — fix(contatos): sem aviso de descarte no Tornar principal, e o primeiro número guarda o rótulo

### conversa (3)
- [ ] `3a047049e` 2026-10-28 — fix(conversa): o número segue o vendedor na transferência e na carteira (#3642)
- [ ] `0264507e5` 2026-10-29 — fix(conversa): a carteira deixa com a IA a conversa que ela atende, pelo comando e nao pelo status
- [ ] `d2e7eca71` 2026-10-29 — fix(conversa): as tres escolhas do doc 237 no numero que segue o vendedor

### conversas (7)
- [ ] `4ec175f06` 2026-10-14 — fix(conversas): conserta o vermelho do verify — typecheck e cercas (#2542)
- [ ] `73f765584` 2026-10-21 — fix(conversas): a lista de participantes para de sujar a auditoria (#2542)
- [ ] `ec9917bbb` 2026-11-05 — fix(conversas): a carteira e a passagem de conversas não levam negócio com dono (#4019)
- [ ] `97b9b9f63` 2026-11-05 — fix(conversas): só a transferência leva o negócio de outro responsável (#4019)
- [ ] `6c4e5415d` 2026-11-05 — fix(conversas): sem lock de crm_leads abaixo do lock da conversa (#4019)
- [ ] `d0ec692fa` 2026-11-05 — fix(conversas): a guarda de visibilidade vale para a conversa que tinha dono (#4019)
- [ ] `6a60acd6d` 2026-11-05 — fix(conversas): o negócio aberto acompanha o dono da conversa (#4019)

### conversoes (1)
- [ ] `8301c242d` 2026-10-21 — fix(conversoes): os links abrem o negócio pelo caminho estável

### core (1)
- [ ] `3eb62eb05` 2026-10-26 — fix(core): respeita ofertas e recusa CNPJ inválido no import

### crm (3)
- [ ] `d88f33c10` 2026-10-29 — fix(crm): a janela de pós-venda diz que não vale com a opção desligada
- [ ] `7667f525c` 2026-11-06 — fix(crm): o comando da conversa pergunta pelo número, e a leitura da empresa não engole o aviso (#4012, #3870)
- [ ] `9caef51d7` 2026-11-12 — fix(crm): as leituras de apoio do quadro tambem paginam

### cron (5)
- [ ] `b84bc2d50` 2026-10-29 — fix(cron): a migration vira 9044 — a 9039 ja e do #3658
- [ ] `8019050ab` 2026-10-29 — fix(cron): oito rotas saem cedo quando o recurso está desligado (#3694)
- [ ] `2c0533292` 2026-10-29 — fix(cron): rodizio e escritas deixam de carimbar sem mudanca (#3695)
- [ ] `de379f4c0` 2026-10-30 — fix(cron): a batida do follow-up avisa o que ela mesma criou (#3694)
- [ ] `985905702` 2026-11-02 — fix(cron): as rotas do #3694 passam pelo piso ocioso da main (#3694)

### custo (1)
- [ ] `cf50b699a` 2026-11-06 — fix(custo): o id de modelo com ponto casa a linha de preço com hífen (#1931)

### db (13)
- [ ] `c3ddd9d38` 2026-10-22 — fix(db): a troca das restrições da 0710 vai num bloco DO só
- [ ] `5b9982d4f` 2026-10-22 — fix(db): a 0717 chega ao baseline, com cabeçalho do roteador e o comentário da coluna
- [ ] `f188c6ca0` 2026-10-23 — fix(db): a tabela de códigos de recuperação só é gravada pelo servidor
- [ ] `aadee8f2e` 2026-10-24 — fix(db): apendice da 0766 antes do bloco da varredura de anon
- [ ] `ad06f9fd2` 2026-10-24 — fix(db): a transição do go-live vira a migration 0767, acima da main
- [ ] `cf5b168b2` 2026-10-24 — fix(db): a migration do tipo de contato vira 0763, acima da main
- [ ] `780648405` 2026-10-26 — fix(db): substitui a proposta com timestamp colidido pelo forward completo
- [ ] `f002fd6f9` 2026-10-26 — fix(db): reconcilie o forward inédito com a sequência 0807
- [ ] `92b1008a3` 2026-10-26 — fix(db): renumera a transição do go-live para 0793
- [ ] `e68fde4b9` 2026-10-28 — fix(db): automation_rule_runs mantém as quatro para authenticated, como exceção declarada
- [ ] `d4c5ef440` 2026-10-28 — fix(db): privilégios explícitos por tabela e papel nas tabelas do apêndice (#3140)
- [ ] `bbce1a007` 2026-11-12 — fix(db): renumera a migration da fusao de fichas de 9350 para 9359
- [ ] `9c7d8cb32` 2026-11-12 — fix(db): a fusao de fichas trava os contatos na mesma ordem da mensagem

### duplicados (1)
- [ ] `f92a5f5ba` 2026-11-05 — fix(duplicados): mantem a sugestao por nome e entra so o CPF (doc 284 = B)

### egress (1)
- [ ] `5c0104af2` 2026-11-07 — fix(egress): dreno único no kit e portão ocioso no routing-worker (#2235, #3878)

### email (5)
- [ ] `835643ef6` 2026-10-22 — fix(email): o nome de exibição do remetente sai num formato padronizado
- [ ] `29871ce52` 2026-10-27 — fix(email): explicita CRUD do worker e traduz mensagens próprias do diagnóstico
- [ ] `624954729` 2026-10-27 — fix(email): confere a conta da organização sem trocar remetente em falha
- [ ] `df184e01b` 2026-11-06 — fix(email): sem e-mail no login passa a ser sem SMTP e sem Resend (#3039)
- [ ] `5020c17bd` 2026-11-09 — fix(email): e-mails do sistema seguem o idioma da tela (#4302)

### envio (1)
- [ ] `bdc187949` 2026-11-03 — fix(envio): quando o canal pede calma (429/Retry-After, 131056), a mensagem espera e sai de novo na mesma linha

### escalacao (2)
- [ ] `edb180c2b` 2026-11-09 — fix(escalacao): resumo da passagem mostra os campos do card (#4303)
- [ ] `f596eef52` 2026-11-10 — fix(escalacao): o rotulo do resumo no aviso da equipe diz o que ele e

### etiquetas (3)
- [ ] `ac6d75535` 2026-10-21 — fix(etiquetas): sugestão filtra pelo texto digitado e as mais usadas vêm primeiro
- [ ] `3a2d3e222` 2026-10-30 — fix(etiquetas): criar é a última opção e só quando não existe (#3180)
- [ ] `79e639b3c` 2026-11-06 — fix(etiquetas): renomear acompanha a regra que tira, e o aviso de excluir diz a verdade

### event-log (3)
- [ ] `525c769a7` 2026-10-29 — fix(event-log): o laço acorda quando a mídia pendente chega, em vez de esperar o recuo (#3693)
- [ ] `3f806ce2b` 2026-10-31 — fix(event-log): o teto do recuo ocioso fica em 30s (#3693)
- [ ] `4521c5fbd` 2026-11-08 — fix(event-log): um dreno por vez com trava de sessão no banco

### experiência (1)
- [ ] `5009a935f` 2026-11-06 — fix(experiência): a recusa diz a causa medida, e o funil recolhe (#4118 #4102 #4083)

### extensoes (1)
- [ ] `a7ee6ddf6` 2026-10-31 — fix(extensoes): o cartao escolhe a paleta do manifesto e nao apaga o tema ao salvar (#3792)

### fatos-do-crm (1)
- [ ] `dbb6225ef` 2026-11-12 — fix(fatos-do-crm): o scrub vem antes do corte de 40 e vale para os dois caminhos (#3917)

### faturamento (1)
- [ ] `bcbec1598` 2026-11-11 — fix(faturamento): um teto de período só para as duas rotas da tela, e o cabeçalho dos rankings no contrato de hoje

### fila (4)
- [ ] `04b9b9274` 2026-10-26 — fix(fila): reserve a escrita aos produtores internos
- [ ] `653ab57e0` 2026-10-29 — fix(fila): inbound corta a soneca da fila em vez de esperar o teto (#3688)
- [ ] `269bb2d04` 2026-10-31 — fix(fila): recuo da fila vazia vira opt-in, o default segue o ritmo de hoje (#3688)
- [ ] `dac14bc44` 2026-11-08 — fix(fila): recuo do polling com fila vazia em função pura, sem env que derruba o worker

### financeiro (1)
- [ ] `9f9397561` 2026-10-29 — fix(financeiro): a comissão nasce nos itens do balcão, do lote e do ganho

### followup (9)
- [ ] `3d7025dd1` 2026-10-30 — fix(followup): silêncio não inscreve quem só respondeu a uma mensagem automática
- [ ] `5068c35b3` 2026-11-02 — fix(followup): a escolha do negócio do roteiro passa pela guarda de efeito e mostra a recusa
- [ ] `0ef3b402a` 2026-11-02 — fix(followup): o destino do roteiro é um card fixado no início da execução (#3363)
- [ ] `2d74ee8db` 2026-11-03 — fix(followup): inscrever sem número conectado devolve 409 com frase útil (#3923)
- [ ] `ab8192120` 2026-11-03 — fix(followup): escolhe o agente pelo canal da conversa (#3852)
- [ ] `18d01e639` 2026-11-05 — fix(followup): a opcao send_when_assigned so libera passo de texto
- [ ] `8761c0e2c` 2026-11-05 — fix(followup): a coluna send_when_assigned chega a quem atualiza
- [ ] `6b0204a55` 2026-11-07 — fix(followup): o passo de IA do fluxo lê o card do negócio e não inventa combinado
- [ ] `fb227b7d2` 2026-11-14 — fix(followup): etiqueta do contato lê as duas caixas, não só a do card (#4586)

### funil (13)
- [ ] `8314ac24c` 2026-10-23 — fix(funil): avisos de funil apontam para onde as coisas estao
- [ ] `c210822bc` 2026-10-24 — fix(funil): o recorte de encerrados mantém o negócio pedido em ?lead= (#2995)
- [ ] `6de454326` 2026-10-29 — fix(funil): a aba Lista respeita os filtros de Responsável e Status
- [ ] `29dd39997` 2026-10-31 — fix(funil): o card se chama Negócio, a palavra que o produto já fala (#3811)
- [ ] `c16e22198` 2026-10-31 — fix(funil): o card se chama Oportunidade na tela inteira, e o "pipeline" vira "funil" (#3811)
- [ ] `d9c50273a` 2026-11-01 — fix(funil): o nome do card sai traduzido e a frase do editor diz só o que muda
- [ ] `e79964b54` 2026-11-01 — fix(funil): funil novo nasce com vocabulário neutro e o editor fala português
- [ ] `786879ca2` 2026-11-02 — fix(funil): a lista de fluxos da etapa usa as portas do motor (#3603)
- [ ] `aa1dcd8ff` 2026-11-04 — fix(funil): legado inconsistente entra sem validar, em vez de derrubar a atualização
- [ ] `36a83b6df` 2026-11-04 — fix(funil): exija organização e etapa do mesmo funil no banco
- [ ] `be6b521d5` 2026-11-05 — fix(funil): a troca das chaves do funil só acontece depois de validar
- [ ] `d116e4653` 2026-11-07 — fix(funil): o quando volta ao payload, e a distancia usa o relogio recebido (#3945)
- [ ] `33eb27df9` 2026-11-14 — fix(funil): o nome do dono vem de fn_nomes_dos_membros e o card avisa quem saiu (#4265)

### funis (2)
- [ ] `c41b425b8` 2026-10-21 — fix(funis): lista longa abre recolhida e o editor do funil monta sob demanda
- [ ] `8355500e2` 2026-10-21 — fix(funis): a cota de 50 campos do funil deixa de contar os campos do contato (#3111)

### grupos (2)
- [ ] `9797c27dc` 2026-10-24 — fix(grupos): renumera a 0706 para 0764, tira .local/ e devolve a lista do worker no teste
- [ ] `ff14d1237` 2026-10-27 — fix(grupos): menção de grupo guarda a lista e resolve o nome do contato (#3566)

### guardrails (2)
- [ ] `a40bece7b` 2026-10-31 — fix(guardrails): fail-safe de passagem só abre caso com pedido de humano (#3725)
- [ ] `cd0d2960f` 2026-11-02 — fix(guardrails): os seis pontos do CR — gate coerente, régua do fail-safe, resumo pela última fala e frase na tela (#3725)

### i18n (6)
- [ ] `f309f6bf8` 2026-10-22 — fix(i18n): renomeia no lugar as chaves de agente e cobre as duas frases que faltavam (#2997)
- [ ] `467022b7e` 2026-10-24 — fix(i18n): o turco entra em construção, como o chinês (doc 198)
- [ ] `0a9eb5cab` 2026-10-24 — fix(i18n): avisos que mandavam a "Configuracoes > Funis" mostram o caminho do menu
- [ ] `b76e53844` 2026-11-02 — fix(i18n): põe a frase do aviso agendado fora do rabo do dicionário (#1418)
- [ ] `262e3d766` 2026-11-04 — fix(i18n): traduz o rotulo do escopo messages:derived:read
- [ ] `04950df43` 2026-11-04 — fix(i18n): titulo em US$ e "chamadas sem preco" em ingles, turco e chines

### ia (15)
- [ ] `3b0a30504` 2026-10-21 — fix(ia): o traco mora em runAgentTurn e grava o modelo e o agente do turno
- [ ] `772f8d1ee` 2026-10-21 — fix(ia): traco do turno so le pela sessao; a escrita e do motor
- [ ] `938fb8983` 2026-10-22 — fix(ia): o atalho inline do follow-up tambem obedece a restricao comercial
- [ ] `220581541` 2026-10-22 — fix(ia): restricao comercial cede ao opt-out e trava todo envio automatico
- [ ] `717a12a06` 2026-10-23 — fix(ia): o satisfies cumpre o que o comentario promete e os comentarios batem com o codigo (#3364)
- [ ] `7f044c64c` 2026-10-26 — fix(ia): bolha só com caractere invisível não sai
- [ ] `d1414bfdf` 2026-10-27 — fix(ia): a renovação do login da assinatura não apaga mais a lista de modelos
- [ ] `740ca58e8` 2026-10-29 — fix(ia): seletor de modelo do agente sem variantes :batch, com busca e custo por milhão
- [ ] `7ef800910` 2026-10-30 — fix(ia): veto que manda parar nao pede a correcao do turno mudo
- [ ] `b3ac3e4c2` 2026-11-03 — fix(ia): o follow-up com modelo próprio continua contando como turno no uso de IA
- [ ] `b72e6a48a` 2026-11-04 — fix(ia): o teste do agente diz quando quem falhou foi o banco (#4020)
- [ ] `5fd776573` 2026-11-04 — fix(ia): palavra de concessão que só o cliente trouxe também não sai como condição da empresa (#3995)
- [ ] `75f34bad6` 2026-11-04 — fix(ia): valor que só o cliente citou não sai como condição da empresa (#3965)
- [ ] `3aa406724` 2026-11-05 — fix(ia): a ferramenta do setor declara o escopo de funil e o dono de cada escrita (#3881)
- [ ] `9ba5d7422` 2026-11-12 — fix(ia): o erro de ferramenta do Testar chega à tela pelo vocabulário do recibo (#4447)

### inbox (43)
- [ ] `0730d3227` 2026-10-21 — fix(inbox): assumir a conversa so da dono ao negocio sem responsavel (#3216)
- [ ] `4e15709e9` 2026-10-21 — fix(inbox): a assistência do agente só ocupa faixa quando há sugestão (#3027)
- [ ] `e42f6fe21` 2026-10-21 — fix(inbox): a recusa da visibilidade do funil e 42501, nao zero linhas (#3216)
- [ ] `dc687b2ca` 2026-10-21 — fix(inbox): transferir ou assumir a conversa leva o negocio aberto do contato
- [ ] `2a1e98749` 2026-10-21 — fix(inbox): o diálogo de anexos pede legenda só onde o canal a leva (#3151)
- [ ] `fac4b55a0` 2026-10-21 — fix(inbox): reenvio que o canal recusou de novo avisa com o motivo
- [ ] `5210e9c72` 2026-10-21 — fix(inbox): o escopo da conversa é resolvido uma vez por consulta, não por linha (#3090)
- [ ] `d3d939460` 2026-10-21 — fix(inbox): acompanhe novas mensagens sem perder a leitura do historico
- [ ] `5605118d9` 2026-10-21 — fix(inbox): mensagem do atendente parada sem conexao nao promete envio
- [ ] `32ef5f9c5` 2026-10-22 — fix(inbox): o botao do bloqueio ate assumir ganha rotulo proprio
- [ ] `bb3626ba5` 2026-10-22 — fix(inbox): quem não tem nome cadastrado deixa de aparecer como uuid
- [ ] `7250f2ed1` 2026-10-22 — fix(inbox): quem vê o texto da apagada continua como hoje (#3279)
- [ ] `1bd265804` 2026-10-22 — fix(inbox): o aviso de sugestão que falhou sai da tela quando a conversa anda
- [ ] `f5968e1f6` 2026-10-23 — fix(inbox): na nota interna o campo Legenda continua com áudio
- [ ] `89ac504ff` 2026-10-23 — fix(inbox): acesso quebrado manda a Conexões, e o código de um dígito tem frase
- [ ] `0fb3b282c` 2026-10-23 — fix(inbox): a recusa do modelo pelo prefixo do envio diz a causa, nunca "confira a conexão"
- [ ] `5ba15f3fe` 2026-10-24 — fix(inbox): no celular, a ficha do contato tem alvos de 44px
- [ ] `33d603959` 2026-10-26 — fix(inbox): preserve acentos no link de download
- [ ] `b6f08317e` 2026-10-26 — fix(inbox): cartão diz `Documento XLSX` sem nome e o download usa o nome original (#2613)
- [ ] `fb001306c` 2026-10-26 — fix(inbox): compartilha os efeitos do claim e limita a exceção por CAS
- [ ] `18c7ea6db` 2026-10-26 — fix(inbox): ordene o baseline e preserve o foco acessível
- [ ] `2a86fc2cd` 2026-10-26 — fix(inbox): no modo "Só os seus", a conversa de "Iniciar conversa" nasce de quem clicou
- [ ] `a45cf94fc` 2026-10-26 — fix(inbox): separar participação de controle e sincronizar convites
- [ ] `719417f79` 2026-10-27 — fix(inbox): registra a ação de audit da lateral e fecha os tipos (#3008)
- [ ] `dc5da293b` 2026-10-29 — fix(inbox): aviso da versão barrada diz só a causa, sem instrução nem "é a reescrita"
- [ ] `84487fde9` 2026-10-30 — fix(inbox): tira o aviso 'resposta sai pelo principal' que nunca aparecia e confere o @c.us contra a ficha (revisão do #3672)
- [ ] `9cf2bd39d` 2026-10-30 — fix(inbox): a adoção da conversa que continua não toma a conversa que a IA atende (#3765)
- [ ] `726c1536f` 2026-10-30 — fix(inbox): a conversa que fica presa num número que não é do dono (#3732)
- [ ] `c625dfb65` 2026-10-31 — fix(inbox): a automação atualiza a conversa na lista sem refazer a busca (#2366)
- [ ] `8312d9017` 2026-11-01 — fix(inbox): o convite sai do menu para o menu poder fechar (#3003)
- [ ] `8e166fced` 2026-11-01 — fix(inbox): o badge das abas do Inbox hidrata igual ao HTML do servidor (#3736)
- [ ] `0584d51bd` 2026-11-03 — fix(inbox): o menu Mais ações fecha depois de Reservar serviço
- [ ] `9d4b5fd0b` 2026-11-03 — fix(inbox): o menu ⋯ tem 44px no celular e se chama "Mais ações" (#3003)
- [ ] `db04c56ac` 2026-11-04 — fix(inbox): comando da conversa sabe quando a organização não tem agente no ar (#4012)
- [ ] `069fae39a` 2026-11-05 — fix(inbox): IA com o dono — ligar segue a régua de dono do automático
- [ ] `5f88ea87b` 2026-11-05 — fix(inbox): busca das respostas rapidas, da mencao e do encaminhamento ignora acento
- [ ] `a9f7ef355` 2026-11-05 — fix(inbox): a busca do encaminhamento ignora acento (#4072)
- [ ] `72e037b84` 2026-11-05 — fix(inbox): o nome de quem enviou só se resolve para membro da organização
- [ ] `77ed52b25` 2026-11-05 — fix(inbox): comando_da_conversa por create or replace na 9207 (#4012)
- [ ] `760747710` 2026-11-07 — fix(inbox): fila sem quebrar os 16 testes da barra de filtros
- [ ] `8c640ff81` 2026-11-11 — fix(inbox): o dono do card entrega o próprio negócio na transferência (#4371)
- [ ] `e068d65ee` 2026-11-13 — fix(inbox): endereço na mensagem vira link clicável, criado por código (#4576)
- [ ] `1df05450d` 2026-11-15 — fix(inbox): o formulário de tarefa da conversa só monta a busca quando abre

### invariants (1)
- [ ] `a2b326792` 2026-10-26 — fix(invariants): decisao LGPD escrita para automation_rule_runs.contact_id (#3267)

### kanban (4)
- [ ] `eeba93daf` 2026-10-23 — fix(kanban): o dossie move pela mesma regra do "Mover para..." do card
- [ ] `e4fa17179` 2026-10-27 — fix(kanban): card que entra na etapa nasce no topo e a ordem e estavel (#3461)
- [ ] `c2dbbe99a` 2026-10-31 — fix(kanban): o card que chega a uma etapa entra no topo por todo caminho (#3461)
- [ ] `cb35d4357` 2026-10-31 — fix(kanban): o card que nasce da conversa tambem entra no topo da etapa (#3461)

### kit (2)
- [ ] `a8e5adac2` 2026-10-31 — fix(kit): a rede do Supabase do mesmo host vale para voz e psql do kit, e avisa quando falta
- [ ] `c4151f432` 2026-10-31 — fix(kit): liga o CRM à rede de um Supabase self-hosted no mesmo servidor

### lead-ads (2)
- [ ] `613d88d62` 2026-11-10 — fix(lead-ads): a ajuda da tela diz o que acontece com a fonte pausada
- [ ] `35a0fc567` 2026-11-10 — fix(lead-ads): a página da fonte é a que o token lê, e só quem administra a troca

### leads (7)
- [ ] `b3ef03f35` 2026-10-26 — fix(leads): feche o vínculo tenant e redija motivos legados
- [ ] `882c1903f` 2026-10-26 — fix(leads): atualize o campo confirmado sem perder outro rascunho
- [ ] `82d008db1` 2026-10-26 — fix(leads): preserve números e redija o motivo das propostas
- [ ] `b7b967ba3` 2026-10-27 — fix(leads): campo de seleção grava a opção do funil, não o texto cru (#3508)
- [ ] `1e72840b3` 2026-11-10 — fix(leads): a entrada automática é só um interruptor — o destino é o da entrada (#3603)
- [ ] `b5b94bf6c` 2026-11-13 — fix(leads): card criado em outro funil leva os anexos da origem (#4544)
- [ ] `e42ef962c` 2026-11-15 — fix(leads): o vínculo de clone do card só é gravado pelo servidor

### lgpd (13)
- [ ] `686c6b6f7` 2026-10-22 — fix(lgpd): quem foi apagado a pedido fica marcado, para a importação do histórico não trazê-lo de volta
- [ ] `b25e4ec36` 2026-10-23 — fix(lgpd): anonimizar pelo poder de plataforma mantém a resposta de que falta o código
- [ ] `a3d0488aa` 2026-10-23 — fix(lgpd): o atestado não guarda o titular, não cita lei e fica atrás de avisaTitular (#2342)
- [ ] `c902d3b3c` 2026-10-23 — fix(lgpd): anonimizar pelo poder de plataforma pede o código provado na sessão
- [ ] `04489d4f1` 2026-10-24 — fix(lgpd): atestado no prefixo da org, hora local, piso do DPO e evidência só onde vira papel (#3321)
- [ ] `c9623d714` 2026-10-24 — fix(lgpd): ler dado pessoal sensível pelo poder de plataforma exige a sessão confirmada
- [ ] `22afcd2a0` 2026-10-26 — fix(lgpd): inclua os cliques CTWA na cópia do titular
- [ ] `d191cbf4b` 2026-10-27 — fix(lgpd): o pacote do titular leva o data.json também no caminho manual, e a prova mede o pacote (#2341)
- [ ] `14f87084c` 2026-10-29 — fix(lgpd): anonimizar apaga o endereço da pessoa física
- [ ] `9f1544822` 2026-10-30 — fix(lgpd): o export visita a lista de espera que a anonimização redige (#3414)
- [ ] `3493592be` 2026-11-06 — fix(lgpd): a marca de apagamento cobre todos os telefones do contato
- [ ] `3965af284` 2026-11-07 — fix(lgpd): titular dos anexos, data da fusão e caminho da organização
- [ ] `4e4b70f03` 2026-11-07 — fix(lgpd): anonimizar um contato alcança as fichas fundidas nele

### lote (9)
- [ ] `9414f91ff` 2026-11-10 — fix(lote): ajuste do #4181 — o aviso do modelo só abre quando o espelho casou linha
- [ ] `0f5ff97f6` 2026-11-10 — fix(lote): ajuste do #4286 — editar a equipe não reenvia quem já saiu da organização
- [ ] `a23d2ddfa` 2026-11-10 — fix(lote): ajuste do #4253 — o menu ⋯ não mostra dois separadores seguidos com Setores desligado
- [ ] `b53c58086` 2026-11-10 — fix(lote): ajuste do #4233 — os textos dizem "só CPF", que é o que a regra faz
- [ ] `06b03c247` 2026-11-10 — fix(lote): ajuste do #4214 — resposta sem envelope não mostra corpo cru nem status ao atendente
- [ ] `1e07ccd9f` 2026-11-10 — fix(lote): ajuste do #4199 — retira a fatia #4102, que entra pelo #4115
- [ ] `289f6a6b9` 2026-11-11 — fix(lote): ajuste do #4127 — o dublê do teste passa a conhecer o leitor único de nomes
- [ ] `74c55ea59` 2026-11-11 — fix(lote): ajuste do #4040 e do #4197 — um wrapper só para comando_da_conversa, com as duas regras
- [ ] `43f80de12` 2026-11-11 — fix(lote): ajuste do #4262 — rótulos da origem no dicionário e PGRST204 na gravação

### marca (1)
- [ ] `9133af8cd` 2026-11-12 — fix(marca): o primeiro campo de CSS se chama pelo que faz, CSS dos dois temas

### mcp (3)
- [ ] `27ada993a` 2026-10-24 — fix(mcp): historico com midia sai expired, sem link no turno do agente
- [ ] `a1776259c` 2026-11-01 — fix(mcp): cercas do baseline, LGPD, marca e i18n do OAuth por contato
- [ ] `c06da61ae` 2026-11-02 — fix(mcp): cliente público do DCR nunca manda segredo na troca do code

### mcp-oauth (1)
- [ ] `8a2d1e98c` 2026-11-03 — fix(mcp-oauth): endurece o retorno e o ciclo de vida das credenciais

### media (2)
- [ ] `0c3f6f850` 2026-10-26 — fix(media): confira a organização antes de derivar o arquivo
- [ ] `5acb65f14` 2026-10-27 — fix(media): finalize a recusa de derivação e trate erro da marca

### meta (1)
- [ ] `9f5e240cd` 2026-11-07 — fix(meta): número apagado a pedido não volta pela agenda em lote (#3432)

### metas (1)
- [ ] `3e1e5d994` 2026-10-22 — fix(metas): o gerente grava a meta, e a tabela recebe as travas de suporte

### metricas (1)
- [ ] `856325af5` 2026-10-22 — fix(metricas): CTE do recorte nasce no topo do WITH e fixture com uuid válido (#3212)

### metrics (1)
- [ ] `32bbb38c4` 2026-10-22 — fix(metrics): a linha do gráfico de ganhos aparece e a tabela fala data (#3262)

### midia (2)
- [ ] `cfa69dcfa` 2026-10-21 — fix(midia): no maximo duas conversoes de audio por vez no processo do app
- [ ] `9c8458fe9` 2026-11-11 — fix(midia): teto de anexo segue em 50 MB e video segue convertendo

### migration (5)
- [ ] `7f671bf72` 2026-10-13 — fix(migration): renumera 0655 para 0661 (colisao de numero com #2809 (0655))
- [ ] `b27372346` 2026-10-15 — fix(migration): troca de conversations_select num único bloco DO (#2542)
- [ ] `6ec851f6d` 2026-10-28 — fix(migration): renumera o catálogo do GPT-6.1 Terra para 9031
- [ ] `4d512fd25` 2026-11-12 — fix(migration): renumera a migration de motivo restricao_comercial de 9334 para 9363
- [ ] `88ed67572` 2026-11-12 — fix(migration): a 9357 já estava no PR #4509 — renumera para 9358

### migrations (3)
- [ ] `2b577feda` 2026-10-22 — fix(migrations): a migration do tipo do contato vira 0746, com carimbo depois do topo da main
- [ ] `9488e6d4b` 2026-10-27 — fix(migrations): a 9027 no lugar da 9026, que dois PRs ja tinham tomado (#3371)
- [ ] `26b649992` 2026-10-31 — fix(migrations): a 0770 ganha carimbo depois da main e o fragmento de release (#3379)

### modelos (3)
- [ ] `942d5d26f` 2026-10-29 — fix(modelos): o formulário cabe em 375px nas duas abas
- [ ] `1dca3de5c` 2026-10-29 — fix(modelos): linha de ações quebra no celular, idioma da organização e só o modelo desta conexão
- [ ] `facf8eca2` 2026-10-29 — fix(modelos): sincronizar sem corpo, guarda de suporte na rota e telefone de exemplo do país

### moeda (1)
- [ ] `e8cdded9f` 2026-10-23 — fix(moeda): o valor digitado é lido na moeda da organização (#3331)

### mídia (1)
- [ ] `eb399b5ac` 2026-10-28 — fix(mídia): contato pessoal não vai ao provedor de IA

### nota-interna (1)
- [ ] `958702c8e` 2026-10-30 — fix(nota-interna): aviso quando o prazo de retenção apaga o anexo da nota (#3756)

### notes (1)
- [ ] `2f7f092bf` 2026-11-07 — fix(notes): a nota apagada chega no canal da conversa (#1863, F1)

### notificacoes (3)
- [ ] `e1387484b` 2026-10-21 — fix(notificacoes): "Lead atribuído a você" só quando o responsável muda de verdade
- [ ] `3508c03b5` 2026-11-05 — fix(notificacoes): o canal do aviso vem do veredito da rota, sem pedido a mais
- [ ] `dfdb859b2` 2026-11-05 — fix(notificacoes): o push da etapa leva valor a quem ve o negocio (#3981)

### nuvemshop (1)
- [ ] `19fc4f210` 2026-11-11 — fix(nuvemshop): catalogo vai para o acervo do agente, nao para CRM/Produtos (#4357)

### organizacao (1)
- [ ] `8b202e400` 2026-10-22 — fix(organizacao): o campo de moeda, o papel no convite e os exemplos de telefone seguem a organização

### outros (7)
- [ ] `f2189b843` 2026-10-21 — fix: a peça do rodapé que sai de vista devolve a faixa ao piso
- [ ] `3cb97e91d` 2026-10-25 — fix #3416: fecha aviso de pausa no descarte e devolve a faixa a canal caido com apelido
- [ ] `ec8105da4` 2026-10-25 — fix #3416: sessao de QR aberto e nao pareada nao ocupa o numero do plano
- [ ] `46f396faf` 2026-10-25 — fix #3383: janela de resposta aberta acorda o turno adiado e não engole a mensagem nova
- [ ] `c924cad8e` 2026-10-26 — fix: cercar concorrência nas correções de atendimento
- [ ] `2327a4cab` 2026-10-28 — fix: recusa do import de blueprint usa a marca resolvida e o formato nasce neutro
- [ ] `15ea6f844` 2026-11-03 — fix: aviso de caso não apaga o WhatsApp da equipe quando a tela não o mostrou (#3935)

### ouvidoria (4)
- [ ] `d81ea7f39` 2026-11-10 — fix(ouvidoria): a tela de gestão entra pelo molde dos módulos (#3636)
- [ ] `8458cc374` 2026-11-10 — fix(ouvidoria): o relato pelo WhatsApp entra pelo molde dos módulos
- [ ] `414db859c` 2026-11-10 — fix(ouvidoria): segue o molde dos modulos de tabela (#3625)
- [ ] `9d1ce2ac5` 2026-11-10 — fix(ouvidoria): a tabela nasce so na provisionadora, sem 9030 nem backfill (#3625)

### pacing (1)
- [ ] `e136c5cf5` 2026-10-30 — fix(pacing): resposta a quem escreveu nao e barrada pelo teto do dia

### pagamentos (7)
- [ ] `1989833a6` 2026-10-27 — fix(pagamentos): a tabela nasce com as travas do suporte e com prova de RLS (#3509)
- [ ] `58d2de281` 2026-10-29 — fix(pagamentos): a migration vira 9047 — a 9043 ja e do #3682
- [ ] `7a1743cab` 2026-10-29 — fix(pagamentos): consertos mecânicos do link de pagamento na conversa (#3590)
- [ ] `bb1a82d84` 2026-11-10 — fix(pagamentos): as recusas do registro saem no idioma de quem pede
- [ ] `beeb59530` 2026-11-10 — fix(pagamentos): Recursos opcionais diz que o registro é pela API
- [ ] `18c87249b` 2026-11-10 — fix(pagamentos): a timeline diz que o pagamento foi confirmado pelo aviso do provedor
- [ ] `7835cc2c2` 2026-11-10 — fix(pagamentos): apagar a conversa deixa o recebimento, sem o vínculo

### painel (1)
- [ ] `395afbc25` 2026-11-06 — fix(painel): Painel de atendimento vira módulo desligado, e a Fila vem da régua viva

### passagem (1)
- [ ] `94c35dea3` 2026-11-03 — fix(passagem): o cartão mostra a transcrição do áudio, não a instrução interna da IA

### pino (1)
- [ ] `1826a6965` 2026-11-03 — fix(pino): as coordenadas vêm do webhook, e a busca na API sai do caminho da requisição

### planilha (1)
- [ ] `55151a53a` 2026-11-12 — fix(planilha): preserve o número original de cada linha

### promessa (1)
- [ ] `854dba578` 2026-11-09 — fix(promessa): registro do servidor externo é dado consultado, nunca política

### propostas (1)
- [ ] `ccf2f522d` 2026-11-11 — fix(propostas): a busca do negócio ignora acento (#4413)

### prospeccao (4)
- [ ] `73a98bf13` 2026-11-05 — fix(prospeccao): dizer QUAL capacidade falta e onde corrigir (#4118)
- [ ] `a65e3e470` 2026-11-05 — fix(prospeccao): a tela trata o número ocupado pelo código, com atalho para a campanha
- [ ] `7081d0059` 2026-11-08 — fix(prospeccao): a pausa em modo de teste fala humano e diz onde liberar
- [ ] `292f2853a` 2026-11-10 — fix(prospeccao): a empresa abordada abre uma conversa só, no canal da campanha (#4341)

### prospecting (5)
- [ ] `795d2f11e` 2026-10-22 — fix(prospecting): URL do engine vem da INSTALAÇÃO e passa pela régua de destinos (#2942)
- [ ] `d0b372a45` 2026-10-22 — fix(prospecting): adiamento não antecipa a vaga agendada e comentários sem o caminho do provider (#3167)
- [ ] `0396a5b0e` 2026-10-22 — fix(prospecting): teto do adiamento da reconexão, frase única e teste em tests/unit
- [ ] `1d4c583f1` 2026-10-30 — fix(prospecting): falha de medição não vira argumento de venda (#3723)
- [ ] `ff966105c` 2026-11-14 — fix(prospecting): a coluna situacao só diz "abordada" com envio confirmado, e o menu não baixa sem contagem

### prospecção (2)
- [ ] `36833524f` 2026-10-28 — fix(prospecção): cercas do CI — tipo importado, chaves i18n repetidas, teto do token, aba sem texto cru
- [ ] `0ba3ae081` 2026-10-30 — fix(prospecção): a prévia da importação compila e o e2e lê os textos novos

### prévia (1)
- [ ] `05ab49135` 2026-11-10 — fix(prévia): consultas dos servidores MCP do agente deixam de cair em unknown_preview_tool

### push (1)
- [ ] `33c629598` 2026-11-03 — fix(push): o valor e o resumo do dia seguem a visibilidade de negócio do papel

### rbac (1)
- [ ] `2a4ad6d50` 2026-11-03 — fix(rbac): reutilize papel nos helpers de visibilidade

### recursos (1)
- [ ] `cdc85ad01` 2026-10-27 — fix(recursos): a telefonia da empresa entra no catálogo de recursos opcionais (#1290)

### retencao (1)
- [ ] `93d3e924d` 2026-10-26 — fix(retencao): o traço do turno ganha prazo e leitor (issue #3201)

### rodizio (2)
- [ ] `8565df597` 2026-11-06 — fix(rodizio): "Liberar" não devolve a conversa ao rodízio (#3937)
- [ ] `0cef21c43` 2026-11-11 — fix(rodizio): recorta o "Liberar" do #4193 — sai o que só existe pelo teto de tentativas (#3937)

### roteador (5)
- [ ] `eb62ddc06` 2026-11-10 — fix(roteador): número sem roteador deixa rastro e a lista marca o removido como inativo (#4340)
- [ ] `aef894ebe` 2026-11-10 — fix(roteador): a trilha das decisões é escrita só pelo servidor
- [ ] `b0f3999b7` 2026-11-11 — fix(roteador): o roteador acompanha a troca de número, com auditoria (#4340)
- [ ] `3b8dccc6a` 2026-11-11 — fix(roteador): a troca automática avisa o agente que herdou a conversa (#4363)
- [ ] `ad565ac16` 2026-11-12 — fix(roteador): a passagem explícita entre agentes vale o turno seguinte (#4318)

### roteadores (1)
- [ ] `1f64b6dfa` 2026-10-28 — fix(roteadores): a identidade do remetente vem do canal

### roteamento (2)
- [ ] `ad538741e` 2026-11-07 — fix(roteamento): a conversa espera a IA qualificar antes de ir para a fila (#3966)
- [ ] `50ba515aa` 2026-11-11 — fix(roteamento): o gatilho de mensagem nova só pede onde a distribuição automática vale (#3916, sobre o #4113 de @webtecnica)

### routing (2)
- [ ] `4908abe85` 2026-10-30 — fix(routing): não distribuir conversa cujo caso já não pede humano
- [ ] `48a748b77` 2026-10-31 — fix(routing): o pedido ao cliente so tira a conversa do rodizio ate o cliente responder

### schema (1)
- [ ] `71df4eb6c` 2026-11-01 — fix(schema): a cadeia reafirma a ACL da 0108 e o baseline a segue

### scripts (1)
- [ ] `2748901e3` 2026-10-31 — fix(scripts): medicao do acervo do WAHA falha claro em vez de contar zero

### setores (5)
- [ ] `9481097bd` 2026-10-28 — fix(setores): attendant_sector_members sem FK direta para organizations
- [ ] `397194ca2` 2026-10-30 — fix(setores): a jornada volta a ser da própria pessoa ou do gerente
- [ ] `fdec81d14` 2026-10-31 — fix(setores): a fila só manda com o módulo ligado, no worker, no handoff e no claim
- [ ] `8d10a8cd0` 2026-10-31 — fix(setores): a fila passa a valer no worker — select, destino padrao e modulo
- [ ] `efab5eb41` 2026-11-01 — fix(setores): o interruptor do módulo diz que o setor passa a distribuir conversa

### skills (3)
- [ ] `e35e22a7e` 2026-10-21 — fix(skills): etiqueta de ativação limitada a 40 caracteres e textos novos da tela em inglês
- [ ] `b0f1b60c2` 2026-10-21 — fix(skills): testa a leitura das etiquetas, lê any_tags no .zip e mostra a mudança de etiquetas
- [ ] `221007b74` 2026-11-05 — fix(skills): a etiqueta entra pela conversa e pelo contato, e a tela avisa em vez de cortar

### status (2)
- [ ] `9ac581d3d` 2026-11-06 — fix(status): replay não freia nem conta, e publicação sem resposta não publica em dobro
- [ ] `077c902d4` 2026-11-06 — fix(status): quem depende do acervo é publicar para todos, não a lista

### system (2)
- [ ] `51f88cd81` 2026-10-25 — fix(system): show verified running image version separately from updates
- [ ] `6d6175b0c` 2026-10-27 — fix(system): confirma força no agente e saúde da voz

### tags (2)
- [ ] `d988221c0` 2026-10-27 — fix(tags): renomear só na caixa grava uma grafia só (#3507)
- [ ] `296310f57` 2026-10-30 — fix(tags): renomear so na caixa mostra a grafia digitada, e a migration volta ao 9023

### tarefas (6)
- [ ] `145bfdff7` 2026-10-23 — fix(tarefas): planos de tarefa so gravam depois de a lista ser lida
- [ ] `03d0e57c3` 2026-10-23 — fix(tarefas): o plano de tarefa mostra o limite e diz qual campo passou
- [ ] `046819df1` 2026-10-28 — fix(tarefas): o lembrete rearma na ocasiao, nao na tarefa (#3639)
- [ ] `9948dafac` 2026-10-29 — fix(tarefas): o dedupe da 9038 tira a repetida do indice, e a cerca de due_at casa a palavra inteira
- [ ] `363f0a88f` 2026-11-15 — fix(tarefas): o setor é lido uma vez, pela tela de Tarefas, com o módulo vindo do servidor
- [ ] `471438439` 2026-11-15 — fix(tarefas): o filtro e o chip de setor respeitam o módulo desligado

### tipos (1)
- [ ] `10ec053b0` 2026-10-26 — fix(tipos): o tipo acompanha o nome da funcao (#3333)

### turno (3)
- [ ] `90324d419` 2026-11-01 — fix(turno): régua da mídia vê derivação pendente e a anotação não promete o que não leu (#3845)
- [ ] `be3454467` 2026-11-01 — fix(turno): o que chega durante a espera da mídia entra na anotação do turno (#3836)
- [ ] `9942ba900` 2026-11-01 — fix(turno): o turno espera a transcrição da mídia que chega no meio dele (#3836)

### uploads (1)
- [ ] `1cce1f9c9` 2026-11-08 — fix(uploads): o teto de tamanho vale também para envio sem tamanho declarado

### uso-de-ia (1)
- [ ] `0079831fd` 2026-11-06 — fix(uso-de-ia): o estimado aplica o degrau de 5x do Haiku 5.5 acima de 100 mil tokens (#4123)

### variaveis (1)
- [ ] `b5f0e7430` 2026-11-12 — fix(variaveis): o que faltava no #4135 para entrar — guarda de CPF fixa, seletor acessível e em espanhol

### voz (1)
- [ ] `922eeefab` 2026-11-04 — fix(voz): ligação presa em toque é encerrada por cron

### webhook (1)
- [ ] `924f1fda0` 2026-11-12 — fix(webhook): confirme o encerramento antes de avisar a Central

### webhooks (5)
- [ ] `1a7fefc42` 2026-10-23 — fix(webhooks): o card adotado é achado pelo carimbo, e o card de um id não é adotado por outro
- [ ] `345093c6f` 2026-10-23 — fix(webhooks): o primeiro envio com external_id inédito adota o card aberto do contato
- [ ] `2acc2db14` 2026-10-24 — fix(webhooks): o reaproveitamento só alcança card sem fonte ou da própria fonte
- [ ] `f89295941` 2026-11-08 — fix(webhooks): recusa da Meta distingue "já arquivado" de "não arquivei"
- [ ] `bf8045367` 2026-11-08 — fix(webhooks): a recusa do contrato da Meta responde 200 e deixa rastro

### whatsapp (2)
- [ ] `92d064b6c` 2026-10-21 — fix(whatsapp): criada_por da importação referencia auth.users (#999)
- [ ] `a3d945905` 2026-10-26 — fix(whatsapp): o aviso de entrega não faz o status voltar para trás, e o erro tardio vira falha com o motivo certo

### worker (1)
- [ ] `ca477f48d` 2026-10-21 — fix(worker): o prazo do desligamento começa no sinal e cabe no prazo do kit (#2823)

## nada-existe-aqui: 202 commits (não listados)

## so-teste-ou-doc: 43 commits (não listados)


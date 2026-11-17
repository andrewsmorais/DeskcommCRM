# O3 — Prospecção completa: a fila do que falta trazer do produto original

Medido em 17/11/2026 (sonda `presenca-prosp.py`: para cada commit de lá que toca a
prospecção, quantas linhas acrescentadas por ele já existem aqui). O código daqui
parou perto de **30/09/2026** e, de lá para cá, o original teve ~130 commits na
prospecção. Quase todos dependem dos anteriores — por isso a ordem é a cronológica.

**Já feito (17/11):** a fatia 1 — escolher onde buscar as empresas (Apify, Scavio
ou motor próprio da instalação), com a busca no idioma da empresa.

**Tentado e desfeito:** a auditoria do site (b18d49013 → c34fcb8c1) exige antes a
seleção de empresas, o ajuste de ritmo e a edição da fila (557d47dd3, 9b46d3975,
bde4097f9, df3fa2a7b). Os dois primeiros commits entraram e saíram (reverts
b483afd75 e f82356b47) para não deixar a verificação de site rodando sozinha sem
tela — o original depois a fez sob demanda e desligada por padrão.

**Como seguir (sessão nova, Opus 5.5 alto):** de cima para baixo, com
`porta.py aplicar <hash>` (3-way; conflito em teste fica com o nosso; dicionário
pela entrada nova). Excluir arquivos de teste que não existem aqui antes de aplicar.
Commits que só tocam peças que este código não tem (token `dsk_`, assinatura do
ChatGPT, org operante) ficam para trás com nota. Cada bloco termina com typecheck,
`vitest` da prospecção, cercas, prova pela tela e commit.

Blocos sugeridos:
1. **Base da fila** (30/09–09/10): seleção de empresas, ritmo, funil só ao abordar, edição da fila pausada, bolhas.
2. **Auditoria do site** (10/10–22/10): classificador, enriquecimento, prévia, interruptores (padrão desligado), saída configurável.
3. **Planilha e links** (26/10–30/10): etiquetas, ofertas, importar CSV/XLSX, links do contato.
4. **Conferir WhatsApp** (03/11): módulo opcional, desligado por padrão.
5. **Uma campanha por número** (05/11) e o resto de novembro (lista completa, mídia na 1ª abordagem, empresa prospectada).

## A fila (presença aqui · linhas medidas · commit)

```
  0%    3 2049f8332 2026-09-30 fix(prospeccao): organização parada sai da escolha no SQL, antes do limite
 16%    6 8565a99ff 2026-09-30 fix(envio): suspensão no meio do envio não pausa a prospecção nem queima o destinatário d
  0%    2 ef0584165 2026-09-30 fix(prospecting): o hash da versão trata inbound_debounce_ms nulo como ausente
  0%    2 8b3cd60ee 2026-09-30 fix(org-operante): varreduras filtram no banco e não montam mais a lista de ids de parada
  0%   11 f2c331016 2026-09-30 feat(api): aceita token dsk_ nas portas de configuração de IA, follow-up e agenda
 13%   43 557d47dd3 2026-09-30 feat(prospecting): operador escolhe quais empresas entram na fila (#1896)
  0%    2 424e8452c 2026-10-01 fix(prospecting): desmarcar todas fica disponivel enquanto houver empresa marcada
 22%   79 9b46d3975 2026-10-01 feat(prospecting): ajusta o limite por dia e o intervalo de uma campanha pausada (#2095)
  0%   47 86acc11d1 2026-10-02 fix(api): por token a prospeccao so configura, pesquisa e pausa (#2028)
 30%   98 bde4097f9 2026-10-03 feat(prospecting): a empresa pode entrar no funil só quando for abordada
 38%   18 ad2cfd4dc 2026-10-03 fix(prospecting): o modo on_send não deixa contato órfão nem cria antes de o canal aprova
  0%    1 0df4636cb 2026-10-03 fix(prospecting): tipo do telefone na criação de contato do candidato
  7%   88 df3fa2a7b 2026-10-03 feat(prospecting): marcar, desmarcar e excluir empresas da fila de uma campanha pausada
  0%   11 cc0284033 2026-10-03 fix(prospecting): a tela da fila espelha o servidor e o histórico diz quantas empresas mu
  0%    2 0dd9ebf7d 2026-10-03 fix(prospecting): "Desmarcar todas" habilita enquanto houver uma marcada
 45%   11 6f3b695a2 2026-10-04 fix(agent-preview): show sandbox candidate outside send window
 31%   16 5503592f0 2026-10-06 fix(ia): a credencial da assinatura do ChatGPT só nasce pelo login
  0%   14 cf9cf02bf 2026-10-09 fix(pool): cliente que falha numa transação não volta ao pool sem erro (#2624)
 31%   32 cf57bc3f3 2026-10-09 fix(prospecting): a abertura da campanha respeita o estilo de resposta e fatia em bolhas 
  0%    4 0174ad7a8 2026-10-10 feat(prospeccao): dias da semana por conexao desamarram domingo da resposta
  0%  286 b18d49013 2026-10-10 feat(prospeccao): classificador e estrategia de site puros com testes
  0%  245 01b4278ea 2026-10-10 feat(prospeccao): enriquecimento de site no tick com SSRF e funil de descarte
  1%  293 c34fcb8c1 2026-10-10 feat(prospeccao): auditoria inline, score ordenavel, reanalise e previa
 42%  100 357d37361 2026-10-10 feat(prospeccao): personalizacao por org (voz, vocabulario, settings)
  0%   83 a65ae742b 2026-10-11 fix(prospeccao): 4 pontos da triagem - guarda da casa, provisorio nao-citavel, testes de 
  0%    6 01fa819ef 2026-10-15 fix(prospeccao): as 3 tentativas do site provisório passam a cobrir horas, não 3 minutos
  4%   23 dd7247282 2026-10-15 fix(ia): usa modelos da assinatura em provedores e prospecção
  0%   54 f5585ade1 2026-10-15 fix(prospeccao): a prévia da abordagem não dá mais 500 para candidato sem contato
  0%   17 1c9393044 2026-10-15 fix(prospeccao): domínio inexistente é definitivo na hora; dúvida de rede espera 30 min
  0%   75 dd7913000 2026-10-15 fix(prospeccao): auditoria aparece antes do envio e fila mostra resumo com modal
  0%   55 ecc065c6b 2026-10-15 feat(prospeccao): verificacao de site sob demanda (botao), com teto de lote e agregador s
  0%    3 031d82013 2026-10-15 fix(prospeccao): verificar_sites e por campanha, nao da org inteira
  0%   16 d787b7252 2026-10-15 fix(prospeccao): sem-site em lote cura a eterna verificacao; contador so conta marcadas
  0%    7 ec918d9a9 2026-10-15 fix(prospeccao): a cura sem-site aparece no resumo mesmo sem linhas de rede
  0%  252 c42e1e98c 2026-10-15 fix(prospeccao): prévia visível, fim da faixa vermelha, painel para todo rascunho sem age
  0%  154 1b1e6c93e 2026-10-16 feat(prospeccao): prévia guardada e estratégia passada ao agente na abordagem (B1)
  0%  756 333673d8b 2026-10-16 feat(prospeccao): verificação do site e prévia saem sozinhas, em segundo plano (B2)
  0%   10 bbdec80da 2026-10-16 fix(prospeccao): site em http cuja versão https abre deixa de ser chamado de 'sem https' 
  0%  126 61d3ebed4 2026-10-16 feat(prospeccao): prévia sai com o agente padrão quando a busca ainda não tem agente
  0%    5 c657f02c2 2026-10-16 fix(prospeccao): o preparo atende a campanha mais nova primeiro
  2%  126 f58532665 2026-10-16 feat(prospeccao): interruptores de avaliar o site e gerar a prévia; padrão só com o agent
  0%    8 de7da7602 2026-10-16 fix(prospeccao): 429, 503 e desafio anti-robô viram provisório; prazo do lote não consome
  0%   34 8080cf218 2026-10-19 fix(prospeccao): campanha antiga sem o interruptor nao gera previa sozinha (doc 163, B)
  0%   57 0cdfa0a9d 2026-10-19 fix(prospeccao): a tela anda sozinha na busca nova, a prévia à mão volta e o próximo pass
  0%    8 d096d79f9 2026-10-19 fix(prospeccao): empresa sem site não mostra data de verificação, e descartado não recebe
  4%  145 25d7891bf 2026-10-19 feat(prospecção): escolher se a opção de parar vai na 1ª, 2ª ou 3ª mensagem
  0%  121 9af9529a6 2026-10-19 fix(prospecção): a saída configurável sai do send do robô para uma função própria
  0%   14 21b7536db 2026-10-20 fix(prospecção): a contagem da saída vale uma vez por envio, não por tentativa
  0%   21 4f73c858f 2026-10-20 fix(prospecção): a saída fica na 1ª ou na 2ª mensagem — o modo da 3ª sai (doc 170)
  0%   59 bf555383c 2026-10-20 fix(prospecção): a saída conta uma vez por mensagem, e o queued que o watchdog entrega fi
  0%    5 b973c9032 2026-10-20 fix(prospecção): resumo sem contador órfão, rótulo da saída só para quem foi contatado, r
  0%   39 768db9de3 2026-10-20 fix(prospecção): a reserva da saída fica amarrada à mensagem que leva o PARAR, e volta qu
  0%   15 a3e91909e 2026-10-20 fix(prospecção): resumo sem contador órfão e dica de saída no idioma da organização
 25%    4 0c2cdc140 2026-10-20 fix(prospecção): resumo em 3 colunas no card estreito, sem órfão visível
  0%   88 52162c256 2026-10-20 fix(prospeccao): estratégia, problemas e motivo do score aparecem em espanhol na tela, se
  0%    1 c29b86182 2026-10-20 fix(prospeccao): o campo Auditoria do prompt não recebe o índice do map como tradutor
  0%    4 a37031e44 2026-10-20 fix(prospeccao): o resumo da campanha com 6 contadores fecha sem órfão (3 colunas, 6 no c
 12%  197 f84d0cd60 2026-10-21 fix(prospecting): a saída vai na 1ª bolha e a guarda de primeiro contato não derruba a ca
  0%    2 b9b980f8e 2026-10-21 test(prospecting): a saída na 1ª bolha é a primeira asserção do caso com a guarda real
  0%    4 cc0739aeb 2026-10-21 test(prospecting): com a guarda cheia em todas as bolhas, o vermelho aponta a pausa da ca
  0%    2 d9992bccb 2026-10-21 fix(prospeccao): a abordagem fria respeita o teto de 3 mensagens do turno (#2680)
 52%   21 e71158301 2026-10-21 fix(prospeccao): quem recebeu a 1a bolha conta como abordado (#2680)
  0%   20 3af10d337 2026-10-21 fix(prospeccao): no modo "saida na 2a mensagem", a 1a so cumprimenta de fato
  0%   13 705e78f06 2026-10-21 fix(prospeccao): sem-site gravado tambem nao mostra "Verificado em"
  2%  219 d3034124f 2026-10-21 fix(prospecting): reconexão de segundos do canal não pausa mais a campanha
  0%    9 14ef7ec25 2026-10-21 fix(prospeccao): negócio da campanha nasce com carimbo próprio — não o `rule:` da regra (
  4%   50 e6f315d4a 2026-10-21 fix(prospeccao): aceita telefone estrangeiro quando o numero ja vem com o codigo do pais
  4%   25 0396a5b0e 2026-10-22 fix(prospecting): teto do adiamento da reconexão, frase única e teste em tests/unit
  0%    3 d0b372a45 2026-10-22 fix(prospecting): adiamento não antecipa a vaga agendada e comentários sem o caminho do p
  0%    3 5ce513489 2026-10-22 test(prospeccao): o A1 espera a rolagem, não o texto
  3%   27 368870720 2026-10-24 fix(prospecting): a tela reconhece o local-http como configurado (#2942)
  6%   64 56007a773 2026-10-26 feat(prospeccao): a campanha grava as etiquetas do contato antes de abordar
  0%   63 413d787a4 2026-10-26 feat(prospeccao): o agente recebe o que a campanha vende
  0%   13 8ac05fe75 2026-10-26 feat(prospeccao): a estratégia traz o ângulo da automação junto do site
  0%    4 3eb62eb05 2026-10-26 fix(core): respeita ofertas e recusa CNPJ inválido no import
  3%  540 b777eedf7 2026-10-27 feat(prospecção): campanha a partir da sua própria planilha (CSV ou XLSX)
  0%   22 aaab6239d 2026-10-27 fix(prospecção): site da planilha só http(s) e tamanho conferido antes de ler o corpo
  0%    9 36833524f 2026-10-28 fix(prospecção): cercas do CI — tipo importado, chaves i18n repetidas, teto do token, aba
  0%  103 816b92cca 2026-10-28 feat(prospecção): o contato nasce com os links que a busca achou
  0%  120 73eeb9ab9 2026-10-28 feat(prospecção): botão Completar fichas leva os links às fichas que já existem
  0%    1 ae9b30973 2026-10-28 fix(prospecção): ficha que já existe só recebe links pelo botão
  0%    5 a2eb56fb6 2026-10-29 feat(contatos): a busca, o envio, a ficha e a LGPD enxergam o telefone extra
  0%    2 6ab11a8ef 2026-10-29 fix(prospecção): etiqueta limitada a 40 caracteres na API e comentários da junção dizem o
  0%  102 1d4c583f1 2026-10-30 fix(prospecting): falha de medição não vira argumento de venda (#3723)
  0%    5 f5dffe53f 2026-10-30 fix(prospecting): site nao medido ganha previa como os outros vereditos definitivos
  0%  393 f72a70287 2026-10-30 feat(prospecção): importar lista mostra o motivo de cada linha que fica de fora
  0%  134 31a26b171 2026-10-30 perf(prospeccao): leitura do HTML do site com custo proporcional ao tamanho da pagina
  0%    8 0ba3ae081 2026-10-30 fix(prospecção): a prévia da importação compila e o e2e lê os textos novos
  0%    4 3df481068 2026-10-30 fix(prospecção): os dois botões da planilha empilham na coluna estreita do computador
  7%  302 074918ac9 2026-11-03 feat(prospecção): confere quem tem WhatsApp antes de abordar e segue o idioma da organiza
  0%   22 ad2109b38 2026-11-03 feat(prospecção): a conferência de WhatsApp vira módulo opcional, desligado por padrão
  0%   10 73967090a 2026-11-03 fix(prospecção): campanha que escolheu a conexão confere o WhatsApp só por ela
  0%    5 d865e3860 2026-11-03 fix(prospecção): o contador do WhatsApp só aparece quando há veredito
  0%    1 c92ea0bcc 2026-11-03 feat(agente): pausa minima entre uma resposta da IA e a proxima
 14%   85 8226b6f69 2026-11-05 feat(prospeccao): uma campanha em andamento por número, não por organização (#3896)
 27%   22 b7ec40ca6 2026-11-05 style(prospeccao): reindenta o corpo do catch do tick no nível do bloco
  0%   19 a65e3e470 2026-11-05 fix(prospeccao): a tela trata o número ocupado pelo código, com atalho para a campanha
  3%   56 73a98bf13 2026-11-05 fix(prospeccao): dizer QUAL capacidade falta e onde corrigir (#4118)
  0%   19 221007b74 2026-11-05 fix(skills): a etiqueta entra pela conversa e pelo contato, e a tela avisa em vez de cort
  4%   21 286dfc7d5 2026-11-06 fix(prospecção): o campo de etiquetas aparece nos dois modos e o nicho só preenche quando
  0%   25 b57ff8bcd 2026-11-07 test(prospeccao): prova as ofertas da campanha no banco e na tela
  0%   12 a39792ade 2026-11-07 fix(prospeccao): campanha só de site não ganha a linha das ofertas
  0%   28 1cce1f9c9 2026-11-08 fix(uploads): o teto de tamanho vale também para envio sem tamanho declarado
  0%   35 7081d0059 2026-11-08 fix(prospeccao): a pausa em modo de teste fala humano e diz onde liberar
  0%    2 9460d627a 2026-11-09 fix(consentimento): a recusa gravada pela ficha (granted: false) bloqueia o envio
 37%  155 eab62fb9d 2026-11-11 prospecção: arquivar campanha que falhou ou veio zerada (#4359, item 1)
 30% 8244 df2597309 2026-11-13 Merge pull request #4591 from melgarafael/fix/cartao-de-proposta-nao-volta-a-cada-carga
  0%    1 ed32ac310 2026-11-14 fix(prospeccao): card da campanha nasce com as etiquetas do ramo (#4586)
 50%   16 33e30b7a7 2026-11-14 prospecção: campanha arquivada não inicia e rascunho desarquivado volta sem config
  0%    3 4e66a315c 2026-11-14 feat(contacts): esquema central do diagnóstico da empresa em custom_fields
  0%  261 e9ffd0057 2026-11-14 fix(prospecting): a guarda veta ficha pessoal, sempre humano e contato da equipe sem paus
  2%  371 40958b842 2026-11-14 feat(prospecting): baixar a lista completa da campanha, com a situação de cada empresa
  5%  119 9f768aaac 2026-11-14 feat(prospeccao): campanha pausada permite editar instrução, critérios e ofertas
  0%  309 0870ab5a2 2026-11-14 feat(prospeccao): mídia fixa junto da primeira abordagem (#4581)
  1%   53 ccec36fcb 2026-11-14 fix(prospecting): a empresa vetada não gasta a vaga do número e o motivo tem espanhol
  0%    7 90f66b8fb 2026-11-14 fix(contacts): salvar o diagnóstico relê a ficha e só toca no que mudou
  2%   91 ff966105c 2026-11-14 fix(prospecting): a coluna situacao só diz "abordada" com envio confirmado, e o menu não 
  0%    9 8e373366b 2026-11-15 test(prospecting): a continuação de quem respondeu e ficou bloqueado mostra o motivo da c
  0%    6 06f9cbabb 2026-11-15 chore(prospecting): ajusta as frases do Baixar lista e a nota da versão
  0%   65 0616683ea 2026-11-15 fix(prospecting): ao reabrir, o menu não baixa com a contagem da abertura anterior
  0%    4 ed4ec4321 2026-11-15 chore(prospecting): ajusta as frases dos motivos e a nota da versão
  0%    9 548709362 2026-11-15 test(prospecting): os testes da reabertura não acessam pedido possivelmente indefinido
  9%   42 88dd11a42 2026-11-15 fix(prospeccao): texto editado vale só para quem ainda não foi abordado
  0%   82 ef341a725 2026-11-15 fix(prospecting): o "não tenho interesse" só vale na janela da prospecção, e adiar vira t
  1%   64 e69c2e585 2026-11-15 feat(prospeccao): teto diário de mídia por número e aviso na tela
  0%    1 a6ff842aa 2026-11-15 test(prospeccao): a falha do candidato é a que leva o motivo, não a varredura do tick
  0%    4 d7b733547 2026-11-15 feat(mcp): ferramenta crm_save_lead_diagnosis para o agente qualificador
  0%  226 34923088e 2026-11-15 feat(prospecting): a lista da campanha inclui as empresas já abordadas, com a data e a ca
  0%   78 cf75f48bf 2026-11-16 feat(prospecting): escolher na tela o arquivo da primeira abordagem (#4751)
  0%   46 8461c1367 2026-11-16 feat(prospeccao): a empresa prospectada nasce como Empresa, com o modulo ligado (#3198, f
  0%   19 09bdec07f 2026-11-16 fix(prospecting): abordada_em sai no dia do fuso da organização (#4632)
```

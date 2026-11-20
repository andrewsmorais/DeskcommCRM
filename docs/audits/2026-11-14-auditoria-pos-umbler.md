# Auditoria de segurança — o que entrou desde a comparação com a Umbler (14/11/2026)

> Feita com o guia `security-audit` do repositório, no perfil **rápido** e **restrito** aos 190
> arquivos alterados desde o commit `57e72291` (a última rodada de segurança). É uma passada
> **parcial**: não cobre o resto do sistema, e nenhum agente executou código — tudo foi leitura de
> fonte. 17 agentes: 4 de reconhecimento, 5 caçadores, 1 crítico de cobertura e 7 verificadores
> independentes (um por achado). Os dois validadores do guia passaram (7 registros, 22 unidades).

## Resultado

| # | Achado | Veredito do verificador | O que foi feito |
|---|---|---|---|
| 1 | Telefone oculto desligado por um cookie trocado | **Confirmado, gravidade baixa** | Corrigido: migration 0519 + o servidor não confia no cookie e esconde o número em qualquer falha |
| 2 | Regra própria do chatbot com muitos `?` ou `{0,99}` trava o worker de todas as empresas | A validar (faltava medir) | **Medido depois**: 20 opcionais = 2 s, e dobra a cada um a mais. Corrigido: orçamento conjunto de repetições; pior caso aceito ≈ 0,2 s |
| 3 | WebHook do chatbot lia a resposta inteira antes de cortar em 64 KB | A validar | Corrigido: leitura para no teto e cancela a conexão |
| 4 | Importar .vcf em tempo quadrático | A validar | Corrigido: leitura linear, com teste de 400 mil linhas |
| 5 | Caminho de mídia com `..` passava pela conferência de empresa (figurinha salva de uma mensagem) | A validar | Corrigido na raiz: a conferência do envio, do encaminhar e da figurinha recusa `..`, `%`, `\`, `?`, `#` |
| 6 | Chat no site: limites só por IP e por visitante (os dois escolhidos por quem chama) | A validar (depende do proxy) | Corrigido em parte: teto por chat (mensagens e visitantes novos). O IP continua vindo do cabeçalho do proxy — ver "O que fica para o dono" |
| 7 | Job de segurança do GitHub guarda a chave de IA enquanto roda ações por etiqueta | A validar (depende das configurações do GitHub) | Ações de terceiros fixadas por commit. As bibliotecas Python do job seguem por faixa de versão |

Endurecimentos feitos junto: teto de pixels na figurinha, tamanho conferido antes de baixar a
imagem, fórmula neutralizada no CSV de estatística, mensagem agendada reconfere o acesso de quem
agendou, visitante anonimizado (LGPD) não reabre a conversa, corpo do pedido do balão lido com
teto, site sem cadeado fora da lista de sites, lista grande no filtro de JSON do `proxy.ts`.

## O que a suíte de testes mostrou (fora da auditoria)

A suíte completa (`pnpm test:unit`) não tinha rodado até o fim desde a comparação. Rodou agora:
**36 testes vermelhos em 13 arquivos**, todos de trabalho desta leva, e todos corrigidos:

- o menu lateral passou do teto da dobra (16 itens) com o Chat da equipe → virou botão no topo;
- o contador do chat quebrava 4 arquivos de teste da barra lateral (faltava o provedor de dados);
- cópia para a área de transferência sem o auxiliar do projeto (2 telas);
- datas com o idioma fixo em português (chat da equipe e histórico baixado);
- classes de estilo que mudaram de sentido no Tailwind 4 (`rounded`, `shadow`, texto com alfa);
- registros que faltavam: `.upload(` da figurinha, `checkHealth` do chat no site, dois campos no
  contrato da tela Equipe, um endereço de exemplo na tela do chat no site.

Também estava vermelho o `lint:channels` (três arquivos nomeando o provedor) — corrigido.

## O que fica para o dono

1. **Proxy na frente do sistema**: o limite por IP do chat no site (e de outras rotas públicas mais
   antigas) usa o primeiro endereço do cabeçalho `X-Forwarded-For`. Com o Caddy do kit isso é o
   endereço real; com Nginx/CloudPanel configurado com `$proxy_add_x_forwarded_for`, quem chama
   escolhe esse valor. No dia da VPS, conferir qual proxy fica na frente.
2. **Chave de IA do job de segurança** (segredo `ANTHROPIC_API_KEY` do GitHub): usar uma chave
   própria para isso, com limite de gasto baixo — não a mesma da produção.
3. **Limitação já conhecida do telefone oculto** continua: o acesso ao banco que fica no navegador
   (tempo real) permite a uma pessoa técnica ler o número direto. Fechar isso é tarefa própria.

## O que NÃO foi coberto

O crítico de cobertura apontou quatro áreas que nenhum caçador leu a fundo (o perfil rápido não
faz segunda rodada): fechar conversa com despedida/chatbot e início manual de chatbot; leituras de
conversas ocultas e favoritas (inclui a ferramenta MCP); rotas de disponibilidade do atendente; e
exportação/anonimização LGPD dos dados novos. Foram relidas por quem conduziu a auditoria, sem
agente independente: papel e empresa conferidos nas quatro; um ajuste saiu daí (visitante
anonimizado não reabre a conversa do site). Uma observação fica registrada: se a leitura das
preferências de conversa falhar, o Fechar usa o padrão do sistema em vez da regra da empresa.

Fora do escopo por definição: tudo o que não mudou desde `57e72291`.

Os registros completos da rodada (relatório, achados, mapa de cobertura — em inglês, no formato do
guia) estão em `docs/audits/2026-11-14-auditoria-pos-umbler-registros/`; a próxima auditoria parte
deles. Eles retratam o código ANTES das correções acima.

## Como conferir

```bash
pnpm vitest run lib/chatbot/pedir-digitar-opcoes.test.ts lib/chatbot/webhook-teto-da-resposta.test.ts \
  lib/contacts/vcf.test.ts lib/messaging/media/caminho-literal.test.ts lib/supabase/telefone-oculto-fetch.test.ts
pnpm test:db tests/invariants/telefone-oculto.test.ts tests/invariants/chat-no-site.test.ts
```

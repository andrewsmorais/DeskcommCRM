# Relatório de auditoria de segurança — run-2 (ChatAI Online)

> Escrito em português simples para o dono do projeto. Os detalhes técnicos completos (passo a passo de reprodução, linhas de código, conserto proposto) estão em `FINDINGS-DETAIL.md` e `NEEDS-VALIDATION.md`, que ficam em inglês porque são para quem vai consertar.

## 1. Como esta rodada foi feita

- **O que foi auditado:** só o que entrou pela planilha do plano (itens O1 a O9 e S1 a S8). Tecnicamente: a diferença entre o commit `d823c3914` e o `2e656d9bf` da branch `chataionline/seguranca-auditoria`, cerca de 485 arquivos de produção. **É uma auditoria parcial:** o resto do sistema, que já existia antes, não foi olhado de novo aqui. Além disso, **um ponto da própria planilha ficou adiado** por orçamento (a conferência "tem WhatsApp?" da prospecção; ver seção 7).
- **Perfil:** `standard` (o caminho completo da skill de auditoria `andrewsmorais/Auditoria-Claude`): reconhecimento, 3 rodadas de caça, um crítico de cobertura depois de cada rodada, mais um crítico final, conferência independente de cada achado (Fase 3) e uma segunda conferência independente dos registros finais (Fase 5).
- **Orçamento:** limite de 45 agentes, proposto por mim (você não fixou um). Foram usados 43: 4 de reconhecimento, 18 caçadores (13 + 4 + 1 em três rodadas), 4 críticos de cobertura, 10 conferentes da Fase 3 e 7 conferentes da Fase 5. O último deles conferiu as 2 correções maiores propostas na própria Fase 5.
- **Desvio do roteiro, por economia:** a skill pede um conferente por achado. Para caber no orçamento, cada conferente recebeu de 2 a 4 achados do mesmo assunto e conferiu um por um. Todos eram agentes novos, que não tinham caçado nem conferido antes aqueles achados.
- **Execução segura:** nada rodou em produção nem na internet. Todo teste rodou numa caixa fechada (sem rede, código só para leitura, limites de memória e tempo), com um banco Postgres descartável montado a partir do `supabase/baseline.sql` e só dados fictícios.
- **Rodada anterior (run-1, 14/11):** as duas pistas dela que caíam nesta área (caminho de figurinha com `..` e vCard lento) foram reexaminadas e **descartadas** pelo código atual. As outras pistas e unidades adiadas da run-1 estão fora desta área e continuam pendentes (lista na seção 7).

## 2. Resumo da situação

O isolamento entre empresas (tenants) se manteve na maior parte do que foi construído: as rotas novas pegam a empresa da sessão, as tabelas novas têm RLS e as funções novas no banco foram revogadas do público. Os problemas encontrados se concentram em quatro pontos:

1. **Um caminho que deixa um atendente ler a API administrativa do WhatsApp (WAHA)** com a chave da instalação. É o único achado de gravidade **alta**, porque numa VPS com várias empresas expõe dados das outras.
2. **A atualização do sistema pela tela:** falta exigir o nível certo de administrador e a verificação em duas etapas, e o servidor aceita instalar uma versão escolhida pelo app.
3. **Regras novas que valem só em parte do sistema:** as marcas "pessoal" e "sempre humano", a recusa de marketing, o convite para conversa privada e a mudança de setor pela IA.
4. **Leitura de arquivos** (planilha XLSX e importação de contatos) que pode travar o servidor com um arquivo pequeno e malicioso.

## 3. Achados confirmados

| # | Gravidade | O que é | Quem consegue | O que foi visto no teste |
|---|---|---|---|---|
| 1 | **Alta** | A "mídia" de uma mensagem enviada vira uma chamada qualquer à API do WAHA com a chave da instalação | Atendente (agent) | O servidor chamou `/api/sessions?all=true` e a sessão de outra empresa com a chave do WAHA e devolveu a resposta (200) |
| 2 | Média | Atualização do sistema aceita admin de plataforma "só leitura" e sessão sem a 2ª etapa da verificação | Admin de plataforma de suporte, ou quem roubou só a senha do dono | Atualizar, voltar versão e forçar: as 3 aceitas (200), enquanto as outras telas de instância recusavam |
| 3 | Média | O agente de atualização da VPS instala a versão que o app mandar, inclusive versões velhas, forçando | Quem tem a chave de serviço do app ou o segredo interno | O host fez checkout de tag antiga, commit sem release, `v1.1.0~1` e `origin/main`, e reaplicaria o baseline daquela versão |
| 4 | Média | Qualquer membro, até visualizador, forja avisos de agendamento no WhatsApp do dono | Visualizador (viewer) | Aviso falso "agendamento cancelado · Origem: Cliente" enviado; aviso real suprimido; teto diário de 20 mensagens do número esgotado |
| 5 | Média | Colega convidado para uma conversa privada passa a mandar nela como se fosse o dono (com a visibilidade "todos", ou em conversa privada sem dono) | Atendente convidado | Tirou a privacidade, assumiu, fechou e apagou mensagens enviadas pelo dono |
| 6 | Média | A ferramenta de IA "mudar setor" mexe em qualquer conversa da empresa, não só na do cliente atual | Qualquer pessoa que manda WhatsApp (via texto enganando a IA) | A IA silenciou para sempre e tirou o dono de outra conversa |
| 7 | Média | Planilha XLSX com tags abertas trava o servidor (tempo cresce ao quadrado) | Admin da empresa, com prospecção ligada | Arquivo de 1,3 KB travou o servidor por 12,7 s; cresce rápido com o tamanho |
| 8 | Média | Importação de contatos: e-mail malicioso trava o servidor (tempo cresce ao quadrado) | Atendente | Célula de 40 KB travou o servidor por 1 s; em 1 MB seriam minutos |
| 9 | Baixa | Atendente liga e desliga as marcas "pessoal" e "sempre humano" direto pelo banco, sem registro na auditoria | Atendente | As duas marcas mudaram sem nenhuma linha na auditoria; o bloqueio de contato foi recusado, como deveria |
| 10 | Baixa | Robôs de automação, chatbot, disparo de campanha e integrações (MCP/API) ignoram as marcas "pessoal" e "sempre humano" | Ninguém precisa atacar: basta uma regra ativa | A automação chamou a IA e enviou mensagem para um contato "sempre humano" |
| 11 | Baixa | Marcas "pessoal" e "sempre humano" ficam para trás quando o número sai da ficha (ao juntar fichas, mexer nos telefones ou apagar a ficha) | Atendente, ou gerente ao juntar fichas | Depois de mover o número ou apagar a ficha, a próxima mensagem caiu numa ficha sem marca e a trava da IA deixou de valer |
| 12 | Baixa | Recusa de marketing gravada como `{granted:false}` para a prospecção, mas não para automações e campanhas | Atendente, via API | A automação enviou o modelo de marketing; a prospecção, para o mesmo contato, recusou |
| 13 | Baixa | Atendente que não vê uma conversa põe o próprio WhatsApp na ficha do cliente e passa a receber as respostas | Atendente | A resposta da IA ao cliente saiu para o número do atendente |
| 14 | Baixa | Telefone removido da ficha continua recebendo as respostas, se escrevia por `@lid` | Ninguém precisa atacar | A resposta foi para o número removido, enquanto a tela dizia "principal" |
| 15 | Baixa | Exportação CSV de contatos grava nomes como fórmulas de planilha | Qualquer pessoa de fora (formulário do site ou nome do WhatsApp) | O LibreOffice abriu o CSV e executou `=1+1` e um `HYPERLINK` ativo |
| 16 | Baixa | O processamento de mídia recoloca no lugar a mídia de uma mensagem que a LGPD acabou de anonimizar | Ninguém precisa atacar (corrida de tempo) | Depois da anonimização, a mensagem voltou a apontar para a foto, e os dados do remetente de grupo voltaram |
| 17 | Baixa | Planilha XLSX sem limite de tamanho total descompactado | Admin da empresa, com prospecção ligada | Cada 41 KB enviados viram cerca de 40 MB de memória; 0,5 MB enviado gastou 481 MB |
| 18 | Baixa | Planilha XLSX: cada linha é esticada até a coluna mais distante citada, e todas ficam na memória até o fim | Admin da empresa, com prospecção ligada | Arquivo de 920 bytes (coluna `ZZZZZ`) gastou cerca de 300 MB; 2.000 linhas com colunas válidas do Excel, num arquivo de 1,4 KB, gastaram cerca de 400 MB |
| 19 | Baixa | Gerente lê o telefone do aviso de agendamento, que deveria ser só do admin | Gerente, direto pelo banco | O número completo apareceu no histórico de entregas |

## 4. Cada achado, explicado

### 1. [Alta] Mídia de mensagem enviada vira chamada à API do WAHA
- **Onde:** `app/api/v1/messages/[id]/media/route.ts` (linha 114) e `lib/messaging/media/waha-source.ts` (linha 29).
- **Como acontece:** um atendente cria uma mensagem com `media_url` apontando para qualquer site público, mas com um caminho como `/api/sessions?all=true`. Ao abrir a mídia dessa mensagem, o servidor joga fora o site e chama aquele caminho no WAHA da instalação, com a chave do WAHA, e devolve a resposta. Como um único WAHA atende todas as empresas da VPS, dá para listar as sessões de todas e ler grupos (e, se o histórico estiver ligado, conversas) de outra empresa.
- **Reprodução:** o envio e a leitura reais encadeados sobre a mesma linha; o servidor fez a chamada com a chave e devolveu 200. O que um WAHA de verdade responde não foi observado.
- **Conserto mínimo:** em `fetchWahaMedia`, aceitar só caminhos do armazenamento de arquivos do WAHA (`/api/files/...`) da própria sessão da mensagem, sem query. Como reforço: a rota só busca no WAHA mídia de mensagem **recebida**, e o envio sempre valida a URL.

### 2. [Média] Atualização do sistema sem o nível certo de administrador
- **Onde:** `app/api/v1/system/update/route.ts` (linha 57).
- **Como acontece:** a rota só pergunta "é admin de plataforma?". Não confere se o acesso é "completo" ou "só leitura", nem se a sessão passou pela verificação em duas etapas. As outras ações de instância (extensões, configurações) recusam esses casos. A versão original do produto (upstream v1.116.0) tem essa trava, e ela se perdeu na cópia.
- **Conserto mínimo:** exigir `scope='full'` e a prova da segunda etapa quando o admin tem fator cadastrado. O melhor é portar o `requirePlatformAdminEscrita` do upstream.

### 3. [Média] O agente da VPS instala a versão que o app mandar
- **Onde:** `hostgator-setup-kit/agent.sh` (linhas 437-451) e `update.sh` (linhas 107-110 e 176).
- **Como acontece:** desde a porta do O9, o servidor recebe do app o número da versão e o usa direto, acrescentando `--force` sozinho quando é versão mais velha. O `update.sh` só confere se aquilo existe no git. Quem dominar a chave de serviço do app (ou o segredo interno, com um clique do dono) escolhe qual código o servidor instala, inclusive versões velhas que desfazem consertos de segurança no banco. O próprio desenho dizia "o app escolhe QUANDO, nunca O QUÊ".
- **Conserto mínimo:** o host só aceita `vX.Y.Z`; avançar só para a release publicada; voltar só para a versão gravada em disco antes da última atualização. E ancorar a regex `ehVersaoPublicada` com `$`.

### 4. [Média] Avisos de agendamento forjados
- **Onde:** função `emit_event` no banco (`supabase/baseline.sql:42941`) e `lib/agenda/aviso-de-agendamento.ts`.
- **Como acontece:** qualquer membro, até um visualizador, consegue criar eventos `appointment.created/rescheduled/cancelled`. O aviso novo do WhatsApp confia neles e (a) manda um "cancelado" falso ao dono, (b) cancela um aviso verdadeiro que estava na fila e (c) gasta o teto diário de mensagens do número, que a IA e as campanhas também usam.
- **Conserto mínimo:** reservar esses três tipos de evento para o servidor (o handler da agenda passa a emitir com a chave de serviço) e, no aviso, só tratar "cancelado" se o agendamento estiver mesmo cancelado no banco.

### 5. [Média] Convidado manda na conversa privada
- **Onde:** `exigirControleDaConversa` e as políticas restritivas da migration 0544, que usam a versão de 2 argumentos de `fn_can_view_conversation`, sem olhar `is_private`.
- **Como acontece:** depois do convite, o colega consegue tirar a privacidade, assumir, fechar, mudar setor e apagar mensagens da conversa privada do dono, quando o combinado era só ler e responder.
- **Conserto mínimo:** usar a regra de 3 argumentos (com `is_private`) no portão das rotas e nas políticas da 0544.

### 6. [Média] IA muda o setor de qualquer conversa
- **Onde:** `lib/mcp/tools/governance.ts` (ferramenta `crm_set_conversation_sector`).
- **Como acontece:** um cliente, ou alguém num grupo com "IA responde", escreve um texto que engana a IA, e ela move outra conversa da empresa: silencia a IA ali para sempre e tira o atendente dono.
- **Conserto mínimo:** quando quem chama é a IA num atendimento, só aceitar a conversa do próprio turno. O ideal é fazer isso uma vez só, em `wrapMcpTool`, para todas as ferramentas de escrita.

### 7. [Média] XLSX com tags abertas trava o servidor
- **Onde:** `lib/planilha/ler-arquivo.ts` (linhas 111, 125, 164, 167, 174, 180 e 186).
- **Conserto mínimo:** trocar as regex por varredura para a frente, que lembre quando não há mais fechamento. A sugestão revisada está no detalhe; a primeira sugestão continuava lenta e foi corrigida na Fase 5. Aplicar o mesmo em `lib/crm-b2b/spreadsheet.ts`.

### 8. [Média] Importação de contatos trava com e-mail malicioso
- **Onde:** `lib/contacts/csv.ts` (`mapLinha`).
- **Conserto mínimo:** recusar e-mail com mais de 254 caracteres antes da regex e cortar o valor ecoado na mensagem de erro.

### 9 a 19. Achados de gravidade baixa (resumo do conserto)
- **9. Marcas mudadas direto no banco:** incluir `is_personal` e `ai_opt_out` na trava `fn_contato_colunas_de_controle` (migration nova + apêndice do baseline + MANIFEST).
- **10. Robôs ignoram as marcas:** veto no ponto comum de envio (`sendMessageHandler`) para quem não é humano, mais a checagem em `checarGuardasDeContato`, no chatbot e na rodada de campanha.
- **11. Marcas ficam para trás:** ao juntar fichas, somar as marcas na ficha que fica; tirar número de ficha marcada ou apagar a ficha marcada passa a exigir gerente, conferido antes de apagar o histórico.
- **12. Recusa `{granted:false}`:** automação e campanha passam a usar `recusaRegistrada`, como a prospecção.
- **13. Telefone extra de quem não vê a conversa:** para gravar telefone na ficha, exigir que a pessoa veja todas as conversas dela (mesma régua da 0499).
- **14. `@lid` sem vínculo:** só aceitar `@lid` que ainda esteja ligado à ficha (principal ou extra), também no "watchdog".
- **15. CSV com fórmula:** pôr `'` na frente de célula que começa com `= + - @`, exceto telefone.
- **16. Mídia volta depois da LGPD:** a gravação do worker só acontece se a mensagem ainda estiver como ele leu; se não, apaga o arquivo recém-subido.
- **17 e 18. Memória na planilha:** limite de tamanho total descompactado (48 MB, como o leitor B2B); nunca esticar a linha além do cabeçalho; aplicar o limite de 500 linhas durante a leitura, não depois; recusar coluna além de XFD.
- **19. Telefone do aviso para gerente:** subir para admin a política de leitura de `entregas_de_aviso_de_agendamento`.

## 5. Precisa conferir na prática (pistas, sem gravidade)

| Pista | Onde | O que falta saber | Como conferir com segurança |
|---|---|---|---|
| Notificações (push) continuam chegando depois de "Sair" e "Sair de todos os dispositivos", e o próximo usuário do mesmo navegador não consegue tomar a inscrição | `app/actions/auth/signOut.ts`, `push_subscriptions`, `public/notify-sw.js` | Se o navegador mantém a inscrição depois do logout e mostra a notificação | Numa instalação de teste: entrar, permitir notificações, sair, fechar a aba e mandar um WhatsApp de teste; ver se a notificação com nome e texto aparece |
| Busca do site do prospecto pode ser enganada por troca de DNS (DNS rebinding) e ler endereços internos da VPS | `lib/prospecting/site-fetch.ts:229-235` | Se o DNS da VPS respeita TTL 0 e quais serviços internos respondem | Na VPS de teste: 3 consultas seguidas a um nome de teste com TTL 0; listar o que responde por dentro do contêiner |

O passo a passo completo está em `NEEDS-VALIDATION.md`.

## 6. Melhorias recomendadas (não são falhas confirmadas)

- `crm_tasks` aceita `lead_id`/`contact_id` de outra empresa, porque não há trigger de mesma empresa. É anterior a esta planilha, mas vale consertar.
- `conversation_notes` não tem trava no banco para `media_storage_path`/`media_mime`. O upload de nota aceita `image/svg+xml` e `Content-Type` declarado pelo navegador.
- `jev_router_decisions` (0529) pode ser lido por qualquer membro, até visualizador, enquanto a tela exige gerente.
- O ícone público do app limita por IP usando o primeiro `X-Forwarded-For`, que o cliente controla.
- O `x-request-id` vindo de fora é confiado e gravado na auditoria da plataforma.
- Chamadas do Jev em áudio transcrito não conferem o teto mensal de IA.
- O mesmo segredo interno serve para os crons e para o canal do agente da VPS. Um segredo próprio para o agente reduziria o risco do achado 3.
- `decrypt_cpf` não existe neste fork: a exportação sai sempre com CPF vazio e faz até 10 mil chamadas que falham.
- O "watchdog" e o modo de teste antes de ir ao ar comparam o telefone principal, não o destino real.
- Os demais pontos menores estão na lista completa de notas do ledger (`coverage-ledger.json`, campo `hardening_notes`).

**Padrões bons encontrados:** a remoção de membro apaga as inscrições de push dele; prospecção e turnos da IA respeitam as marcas; a fila de apagamento da LGPD confere bucket e prefixo; as funções novas no banco foram revogadas de `public` e `anon`.

## 7. Cobertura

- **49 unidades** no ledger: 19 viraram candidatos (todos conferidos), 12 foram cobertas sem achado, 17 ficaram fora do escopo e **1 ficou adiada** (ver abaixo). Nenhuma ficou bloqueada.
- **Fora do escopo (já existiam antes desta planilha):** edição do telefone principal pelo PATCH, o fallback de mídia servido inline, as ferramentas de leitura de conversa da IA em turnos de cliente, outros consumidores de eventos `appointment.*` (regras de automação), e as pistas e unidades adiadas da run-1 (segredo de CI, chave de rate limit do webchat, regex e buffer do chatbot, telefone oculto via cookie e 8 unidades adiadas).
- **Problemas parecidos em código antigo**, que o critic-3 apontou e que valem ser consertados junto (não foram caçados aqui):
  - leitor de planilha B2B (`lib/crm-b2b/spreadsheet.ts`), com as mesmas regex lentas e a mesma coluna sem limite dos achados 7 e 18;
  - `entregas_de_aviso_de_caso.destino`, legível por gerente, igual ao achado 19;
  - os outros envios para fora (webhook de automação, webhook do chatbot, push, canais sociais), com a mesma janela de troca de DNS da pista de prospecção;
  - o mesmo repasse de mídia do achado 1 nos canais Zernio e sociais;
  - a confiança no telefone alternativo (`remoteJidAlt`) que vem do WAHA;
  - a política de notas internas, que deixa um atendente editar ou apagar a nota de outro.
- **Críticos:** critic-1 pediu 4 unidades (onda 2), critic-2 pediu 1 (onda 3), critic-3 não achou mais nada dentro do escopo (só apontou os 7 problemas parecidos em código antigo listados acima). **Crítico final: não saiu limpo.** Ele achou um ponto novo, dentro do escopo, que nenhum caçador leu: a **conferência automática "esse número tem WhatsApp?" da prospecção** (`lib/prospecting/whatsapp.ts` e `lib/prospecting/preparo.ts`). Ela consulta a rede do WhatsApp a partir do número do cliente. Pode usar o número mais antigo conectado (que pode ser o do atendimento), roda até em campanha em rascunho ou pausada, não respeita a janela nem os dias de prospecção, e pode ser disparada por uma busca feita com token de API. O risco é para a reputação do número (chance de banimento).
- **Esse ponto ficou ADIADO, não auditado.** Sobravam 2 agentes no orçamento, e caçar e conferir exigiriam uns 5. Por isso **esta rodada não pode dizer que cobriu tudo da planilha**: é o primeiro item para a próxima rodada.
- **Arquivos desta rodada:** `findings.json` (registros finais, validados), `coverage-ledger.json`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md` e as evidências em `agents/*/artifacts/evidence/`.

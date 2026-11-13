# Mapa do ChatAI Online

> **Leia este arquivo antes de qualquer tarefa no ChatAI Online, e atualize-o no fim.**
> Ele existe para que nenhuma sessão (Claude, Codex, Cursor) refaça ou desfaça o que já foi feito.
> Escrito em português simples: o dono do projeto não lê inglês.
> Última atualização: 13/11/2026.

## 1. O que é

- **ChatAI Online** é um SaaS de atendimento e vendas pelo WhatsApp, com chatbot (fluxo visual,
  sem custo de IA) e agentes de IA, montado sobre o DeskcommCRM (open source, MIT).
- **Modelo de referência:** a Umbler Talk. Regra do dono: o que a Umbler tem e o CRM tem fica
  igual ao da Umbler; o que só o CRM tem continua (radar, prospecção, importação de planilha,
  produtos/comandas, memória do agente, agente que organiza o CRM, índice de atrito, passagem
  IA → humano). Comparação item a item: [`comparacao-umbler-talk.md`](comparacao-umbler-talk.md).
- **Endereços:** página de vendas `chataionline.io` (repositório separado `andrewsmorais/Qwen`,
  onde ficam o checkout e o webhook do Asaas); CRM em `crm.chataionline.io`.
- **Código:** `andrewsmorais/deskcommcrm` (fork de `melgarafael/DeskcommCRM`). Supabase do projeto:
  `chataionline`. VPS na Hostinger (página no domínio, CRM no subdomínio).

## 2. Onde está o código de verdade (IMPORTANTE)

- A branch que reúne **todo** o trabalho é `chataionline/seguranca-auditoria`
  (worktree `/home/claude/wt-seguranca` nas sessões na nuvem).
- A `main` do fork está **atrasada** (parou em `8238126`, 21/10/2026). Todas as branches
  `chataionline/*` já foram juntadas na `seguranca-auditoria`. Para conferir:
  `git rev-list --count origin/main..origin/chataionline/seguranca-auditoria`.
- **Ainda não foi para a VPS** a versão desta branch. Antes de subir, ver a seção 6.
- Não mexer em `/home/claude/deskcommcrm` (cópia de outra sessão).

## 3. Decisões do dono (não desfazer sem ele pedir)

**Planos** (fonte: `lib/billing/catalogo.ts`; preço vem da tabela `plans`):

| | Essencial | Impulso | Escala |
|---|---|---|---|
| Números de WhatsApp | 2 | 4 | 6 (pode subir por empresa) |
| Agentes de IA | 1 | 2 | 3 |
| Chatbots ligados | 1 | 2 | 3 |
| Funis | 2 | 4 | 6 |
| Usuários | 2 | 4 | 6 |
| Como contrata | checkout | checkout | "Falar com especialista"; o dono ativa |

- Recursos por plano: lista `RECURSOS_DO_PLANO` no mesmo arquivo (API, webhooks, follow-up da IA,
  relatórios completos etc. a partir do Impulso; permissões avançadas, auditoria e marca própria
  no Escala). Uso de IA **sem limite visível**.
- Follow-up usado **pelo chatbot**: todos os planos. Follow-up usado **pelo agente de IA**: Impulso
  em diante. O retorno próprio do agente ("te chamo amanhã") ficou como estava.
- **WhatsApp por QR code** para os clientes comuns (risco de bloqueio declarado nos termos). API
  oficial da Meta só sob demanda (Escala).
- **Disparo em massa desligado** (módulo opcional, desligado por padrão): é o que derruba número
  por QR code.
- Chave da OpenAI é **da plataforma**; o cliente nunca vê provedor, modelo nem chave (só o
  super-admin vê a parte técnica do agente).
- Chatbot: tudo o que a Umbler tem, **menos** grupos e "marcar como esperando"; sem carrossel; o
  pagamento é o link do checkout da plataforma do cliente (Kiwify, Cakto, Hotmart…).
- Entrada do cliente: escolhe o plano → 7 dias grátis → cadastro (pede o **nome de quem se
  cadastra**) → vídeo curto → tela do QR code do WhatsApp.
- Login por Google e por e-mail comum. Setores e conversa privada existem.
- Chat de ajuda dentro do CRM: Haiku 5.5, 50 mensagens/dia por empresa, chave Anthropic própria.
- E-mails pela Resend (boas-vindas, plano contratado/melhorado/reduzido, reembolso, cancelamento,
  Escala ativado). Remetente `suporte@chataionline.io`.

## 4. O que já foi feito (por ordem)

| Quando | O quê | Onde ver |
|---|---|---|
| 21/10 | Painel do dono (métricas + Asaas) em `/admin`; campanhas viram módulo opcional | commits `75dc7d8`, `2128139` |
| 22/10 | QR code direto no onboarding, exportar dados da conta, visual violeta, chatbot visual (motor + editor), assinatura obrigatória e cota de agentes | `.changes/whatsapp-qr-direto-e-video.md`, `chatbot-builder-visual.md` |
| 23–24/10 | Chatbot: condições, mídia, agenda, funil, WebHook, follow-up, iniciar por automação, paridade Umbler; Kiwify e Cakto | `.changes/chatbot-*.md`, `kiwify-e-cakto.md` |
| 27/10 | O CRM libera exatamente o que o card do plano promete | `.changes/planos-liberam-o-que-o-card-promete.md` |
| 28/10 | Cadastro pede o nome da pessoa; e-mails de relacionamento; botão Ajuda com assistente e manual | `.changes/emails-de-relacionamento.md`, `botao-de-ajuda-com-assistente.md` |
| 03/11 | Chatbot "como a Umbler" (editor, 56 passos, 19 modelos, copiar/colar, salvar automático), setores, conversa privada, e-mail de cancelamento | `docs/audits/2026-11-03-chatbot-60-cards.md` |
| 04/11 | Auditoria de segurança — 1ª rodada, com correções (planos cobrados em toda porta, suspensão em toda porta, MFA etc.) | `.changes/seguranca-pos-auditoria-novembro.md` |
| 11/11 | Cliente troca de plano pela tela (Essencial ↔ Impulso); chatbot com rascunho e versões; imagens Docker do fork | `.changes/troca-de-plano-pelo-cliente.md`, `chatbot-rascunho-versoes-e-uma-passagem.md` |
| 13/11 | Chatbot: "Editar etiquetas" no contato ou na conversa; card "Campo do contato" em Condição (paridade com o menu da Umbler) | `.changes/chatbot-etiquetas-da-conversa-e-campo-do-contato.md`, `evidence/chatbot-etiquetas-e-campo/` |
| 13/11 | Ocultar conversa (olho no topo + filtro "Ocultas") e bloco "Visibilidade da conversa" do chatbot (migration 0510) | `.changes/conversa-oculta.md`, `evidence/chatbot-visibilidade/` |
| 11–13/11 | Auditoria de segurança — 2ª rodada (telefonia, telemetria, LGPD, prompt, mensagens), 3 verificadores independentes | `.changes/endurecimento-auditoria-rodada-2.md`; migration `0509`; relatório em `/srv/security-audit-skill/chataionline/run-2/REPORT.md` |

## 5. O que falta / pendências conhecidas

- **Nunca foi testado pela tela, numa instalação limpa, depois das duas auditorias:** criar conta →
  escolher plano → conectar WhatsApp → primeiro lead → IA e chatbot respondendo. Prioridade 1.
- Conferir os 3 planos pela tela (limite aparece e barra).
- Pagamento no Asaas Sandbox de ponta a ponta pela tela (pago, atrasado → suspende, troca de plano)
  e o cartão atrás do proxy da VPS.
- O último commit de segurança (`57e7229`) não teve verificador independente.
- Chatbot: carrossel e cupom bloqueados por decisão; ver a comparação com a Umbler para o resto.
- Comparação com a Umbler Talk: ver [`comparacao-umbler-talk.md`](comparacao-umbler-talk.md) —
  9 itens faltando, em ordem (agendar mensagem, finalizar com mensagem/chatbot, assinatura,
  regex no chatbot, baixar histórico, observadores, transferir para outro número, figurinhas, webchat).
- Chatbot: os blocos da Umbler estão todos; faltam opções dentro de alguns (seção 8 da comparação: Pedir para digitar com várias opções/regex, Fluxo de inatividade, modos de transferência, Notificar, botão de link, estatística por bloco).

## 6. Dia de subir para a VPS (checklist)

No `.env` da instalação (achar a pasta com `docker compose ls`):
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL=suporte@chataionline.io`, `SUPPORT_EMAIL`, `SUPPORT_WHATSAPP`
- trocar o `INTERNAL_SECRET` (apareceu num print)
- marca: `APP_NAME` etc.
- `SENTRY_DSN` (se quiser receber erros)
- `WAHA_WEBHOOK_REQUIRE_SIGNATURE`
- `VOIP_TRUNK_COMPARTILHADO=ligado` **só** se várias empresas usam o tronco SIP do servidor
- telefonia: copiar de novo o bloco do tronco SIP; liberar a porta 5060/udp
- colar a chave Anthropic do chat de ajuda em Admin › Instalação › Ajuda e suporte
- Todo `up -d` na Hostinger leva os dois arquivos de compose (ver `CLAUDE.md`, "Deploy em produção").
  Depois, o domínio tem de responder 307, não 404.

## 7. Como trabalhar sem estragar

- Nunca colar chave ou segredo no chat; nunca pedir para imprimir o `.env`.
- Não adivinhar fatos (endereço, configuração): conferir no código ou perguntar.
- Mudança de banco = migration + apêndice no `baseline.sql` + linha no `MANIFEST.md` (ver `CLAUDE.md`).
- Testes: `pnpm test:unit` (inteiro, sem caminho) e `pnpm test:db`. Falhas já existentes no
  `test:db`, que não são nossas: event-log-drain (2), relogio-do-silencio (11), webhooks-inbound (1).
- Ao terminar uma tarefa: acrescentar uma linha na seção 4 (e tirar da seção 5 o que foi resolvido).

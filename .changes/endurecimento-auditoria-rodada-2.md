---
impacto: nada_mudou
secao: corrigido
titulo: Segunda rodada da auditoria de segurança — permissões, LGPD e telemetria
---

A segunda rodada da auditoria olhou telefonia SIP, telemetria, cópias derivadas das conversas, configuração do motor de IA, prompt do agente e LGPD, e fechou as portas que reproduziu:

- **Quem só lê não muda mais o comportamento da IA.** A configuração do prompt (camadas de playbook, skills), a tabela de promessas, o texto de aviso da primeira mensagem, a memória do agente e as propostas de melhoria passaram a ser escritas só pelo servidor; follow-up, botões do número e números de telefone, só por gerente. Antes, um usuário com papel de leitor conseguia, falando direto com a API do banco, publicar texto que ia para o prompt de todo atendimento ou mandar mensagem pelo WhatsApp da empresa.
- **O motor confere o que lê.** Padrões de regex e números do anti-repetição não vêm mais do banco sem limite (um padrão malicioso travava o worker de todas as empresas), fuso inválido no número cai no padrão em vez de parar todo envio, e versões de configuração só valem quando são da mesma organização.
- **Visibilidade da conversa vale nas cópias.** Casos do agente, respostas ao chatbot, resumos e cópias de envio seguem a mesma regra da conversa (atendente que não vê a conversa não lê o caso dela); transcrição de ligação deixou de ser lida por leitor.
- **Anonimizar (LGPD) alcança tudo.** Notas e estado do funil escritos pela IA, notas internas, respostas ao chatbot, prévia das mensagens no barramento de eventos e transcrição de ligação somem na anonimização, inclusive para quem já foi anonimizado antes; e o pedido de acesso aos dados passa a entregar essas mesmas informações.
- **Telefonia.** Número discado só é cadastrado por gerente, o tronco SIP só aponta para o endpoint da própria empresa, o número de destino de uma ligação é validado, e a sessão de voz da IA respeita assinatura e suspensão como o atendimento por texto. O bloco do tronco que a tela gera passa a aceitar chamada de entrada só do IP do provedor (`identify_by=ip`), uma chamada que chega pelo tronco de uma empresa não cai em número de outra, e a transcrição da ligação volta a ser apagada na anonimização e entra no pedido de acesso aos dados.
- **Telemetria da comunidade sem gravação de sessão.** Com o Sentry padrão, o navegador não envia mais replay de sessão (nem no erro); links de exportação, tokens em cabeçalhos, contextos do Next e navegação são redigidos antes de sair.

Nada obrigatório na atualização: o `update.sh` aplica tudo. Recomendado para quem usa telefonia SIP com tronco próprio: copiar de novo o bloco em Configurações › Telefonia para o `pjsip.conf` (o antigo segue funcionando, mas sem a amarração por IP).

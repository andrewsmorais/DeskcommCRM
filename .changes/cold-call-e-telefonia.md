---
impacto: capacidade_nova
secao: adicionado
titulo: Cold Call (fila de ligações), agente de voz mais esperto e automação de ligação não atendida
---

Trazido do produto original e ajustado a esta instalação:

- **Cold Call:** uma tela com a fila de leads para ligar, um por vez, com o roteiro do lado. O vendedor marca o resultado ("Não atendeu", "Caixa postal", "Follow-up", "Pediu reunião", "Sem interesse", "Número errado") e o lead anda no funil sozinho; quem não atendeu volta para a fila. Liga pelo canal de voz do CRM ou, sem ele, pelo discador do celular. Quem pediu "PARAR" não recebe ligação. **Vem desligado:** quem administra o servidor liga em **Administração › Sistema › Cold Call**.
- **Agente de voz nas ligações recebidas:** agora ele cumprimenta quem liga assim que atende, recusa na hora o contato bloqueado, e a ligação que cai antes de atender não fica mais "tocando" na tela. O tempo que ele espera antes de responder pode ser ajustado pela variável `VOICE_VAD_EAGERNESS` no `.env` (`low`, o padrão; `auto`; `high` responde mais rápido). O tempo das ligações do agente passa a aparecer em **Uso de IA**.
- **Automação "Quando uma ligação recebida não for atendida":** para quem usa telefone (SIP), por exemplo para mandar um WhatsApp dizendo que viu a ligação.
- **Pessoas relacionadas no negócio:** dá para ligar outros números do mesmo cliente ao negócio, e o negócio mostra as conversas e ligações de todos eles.

Nada a fazer na atualização.

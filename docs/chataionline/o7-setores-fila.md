# O7 — Setores completos e atendimento conjunto (plano de trabalho)

Linha O7 da planilha: "Fila na Inbox, IA escolhe o setor, horário por setor,
atendente vê só o próprio setor, convidar colega para a conversa".

## Decisão de modelo (não trocar sem conversar com o dono)

O fork JÁ tem setores (migration 0496): `setores`, `setor_membros` (N:N) e
`conversations.setor_id`, usados pela distribuição (`lib/routing/eligibles.ts`),
pelo chatbot ("Transferir para a equipe") e pela tela Configurações › Setores.

O produto original fez o mesmo com outros nomes (`attendant_sectors`,
`attendant_sector_members`, `conversations.sector_id`, migrations 0801/9062/9084).
**Não trazemos as tabelas de lá**: seriam dois cadastros de setor. Cada recurso
do original é trazido ADAPTADO ao modelo daqui (`setores` / `setor_id`).

A visibilidade daqui também é outra: `conversations_select` chama
`fn_can_view_conversation(org, dono, privada)`. Os ramos novos (participante e
setor) entram como disjunções a mais SÓ em `conversations_select` — como no
original; `messages` herda por `exists` na conversa. A conversa privada
(`is_private`) continua valendo: participante e colega de setor não a enxergam,
salvo o que a regra de privada já permite.

## Fatias (uma por commit, nesta ordem)

| # | Fatia | Original | Estado |
|---|---|---|---|
| 1 | Atendente vê as conversas do próprio setor (`visibility_mode = own_and_sector`) | 9214, 1b6183953, 930ae3827, fb5591f16 | **feito** (0543, `tests/invariants/conversas-do-setor.test.ts`) |
| 2 | Convidar colega para a conversa (`conversation_participants`) | 0661, #2542, 8312d9017 | **feito** (0544; rotas de controle — fechar, setor, chatbot, status — exigem quem já controlava: `lib/inbox/controle-da-conversa.ts`) |
| 3 | Horário por setor (fora do horário, a distribuição não entrega ao setor) | 9062, 9a99e26fe, 8d10a8cd0, fdec81d14 | a fazer |
| 4 | IA escolhe o setor (ferramenta do agente e ação de automação) | #3881: 9113afa55, 3aa406724, 0be0425e6, 7a69eb665 | a fazer |
| 5 | Fila na Inbox por setor (filtro/cor do setor na aba Fila) | 9084, e243e6e1a, 3cc181fe1 (índice 9357) | conferir o que já existe |

A aba "Fila" da Inbox já existe aqui (`components/inbox/InboxFilters.tsx`,
`comando=aguardando`) e o filtro por setor também (`setor_id`). A fatia 5 é
conferir e completar, não refazer.

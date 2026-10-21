# Tema violeta do CRM

## Escopo

Aplicação visual da referência FlowDash fornecida pelo proprietário em 20/10/2026.
O JSON de referência está em `docs/design/flowdash-reference.json`. A adaptação
mantém os módulos, conteúdo, marca, permissões, dados e fluxos reais do CRM.
Não inclui os projetos, números e perfil fictícios presentes na imagem de exemplo.

Classificação: núcleo compartilhado de apresentação. Não há schema, configuração
de produção, nova integração ou funcionalidade comercial nesta alteração.

## Implementação

- `app/globals.css`: tokens semânticos, claro e escuro, superfícies, navegação e foco.
- `app/layout.tsx`: Plus Jakarta Sans local, uma das famílias da referência.
- `components/ui`: cartões de 16px e controles de 10px; sem mudanças de eventos.
- `components/shell`: menu de 240px e cabeçalho de 64px, navegação existente.
- `app/(public)`: login, recuperação e cadastro no mesmo tema, com seletor visível.
- `lib/branding/regua-do-produto.ts`: gerado pela função `extrairRegua` a partir do CSS.
- `lib/i18n/dicionario.ts`: correções em português mantêm traduções espanholas.

Os tons de texto, status e destaque são adaptados para legibilidade. As cores de
pessoas da agenda permanecem distintas. Marca própria continua usando seus
resolvedores e pode sobrepor o destaque do produto quando configurada.

O tema fica salvo pelo mecanismo existente em `lib/theme.tsx`. O layout não depende
de animação; foco, texto e `aria-current` também identificam o estado da navegação.
As antigas regras abrangentes por `body:has(aside)` foram substituídas por tokens
e classes específicas, evitando recolorir ícones e avisos sem distinção.

## Limites de comprovação

A referência é uma imagem, sem projeto de design editável. A implementação usa
seu JSON e adapta a aparência às telas reais; não se declara reprodução pixel a pixel.
As verificações e as limitações da inspeção local devem constar no relato da tarefa.

## Prova local de 20/10/2026

- Typecheck canônico aprovado; ESLint focal sem erros, com três avisos
  preexistentes no Sidebar; verificação focal de whitespace aprovada.
- `/app/ai/agents` abriu com sessão existente em claro e escuro. A fonte local
  foi confirmada no estilo calculado. Tema escuro e acesso persistiram após reload.
- Captura: `evidence/tema-violeta-2026-10-20/agentes-escuro.jpg`.
- A inspeção final de login, outros módulos e celular ainda não foi concluída.
  O Inbox respondeu 200 no servidor durante a navegação, sem prova visual final.
- Na consulta posterior feita para o relatório geral, o navegador mostrou
  conexão local recusada. A disponibilidade precisa ser restabelecida e a
  conferência retomada; as provas anteriores não garantem disponibilidade atual.
- Não foram adicionados ou executados testes automatizados nesta rodada visual.

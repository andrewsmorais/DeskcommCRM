---
impacto: nada_mudou
secao: corrigido
titulo: Segurança — Next.js e bibliotecas atualizados para versões sem falhas conhecidas
---

A verificação de bibliotecas (`pnpm audit`, a mesma base que o Trivy usa) achou 93 falhas conhecidas nas dependências, 4 delas críticas — entre elas duas do Next.js (16.3.6) que permitiam a alguém de fora **executar código no servidor** pela otimização de imagens e pelo `use cache`.

- Next.js sobe para a 16.4 (corrigida); também sobem o SDK do MCP, Nodemailer, Zod, Vite e Vitest, alinhados com o projeto original.
- Bibliotecas indiretas (undici, hono, seroval, brace-expansion, ip-address, fast-uri e outras) ganham piso de versão sem falha conhecida.
- Sobram 2 avisos moderados, só na etapa de construção (o plugin do Sentry), que não vão para o servidor.

Nada a fazer na atualização: o `update.sh` puxa a imagem nova.

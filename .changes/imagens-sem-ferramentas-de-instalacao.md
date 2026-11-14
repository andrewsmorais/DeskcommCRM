---
impacto: nada_mudou
secao: corrigido
titulo: Segurança — imagens do app e do worker sem npm/pnpm e com o sistema atualizado
---

A varredura do Trivy nas imagens achou falhas conhecidas (uma crítica, no `tar`) que **não eram do app**: vinham do npm que já vem na imagem do Node e do pnpm usado para instalar as dependências. Nenhum dos dois roda depois que a imagem está pronta.

- As imagens do app e do worker deixam de levar npm, npx, corepack e pnpm.
- O worker passa a ligar pelo `tsx` de `node_modules`, como o `pnpm exec tsx` já fazia.
- As duas imagens aplicam as atualizações de segurança do sistema (Alpine) na construção.

Nada a fazer na atualização: o `update.sh` puxa as imagens novas.

---
impacto: nada_mudou
secao: corrigido
titulo: Ligação que ficou "tocando" é encerrada sozinha, e o radar só pede revisão de proposta de negócio aberto
---

- **Ligação presa tocando:** quando o fim de uma ligação se perdia (worker reiniciado, canal que caiu antes de atender), ela ficava "tocando" para sempre e o CRM mostrava o aviso de ligação chegando sem ninguém ligar. Agora uma rotina a cada 5 minutos encerra ligação em toque há mais de 5 minutos. Ligação em andamento não é tocada.
- **Radar:** a lista "Propostas esperando revisão" deixou de mostrar proposta de negócio já ganho ou perdido, e continua mostrando a do negócio aberto mesmo em empresa com mais de 500 negócios abertos.

Trazido do produto original.

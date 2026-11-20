---
impacto: capacidade_nova
secao: adicionado
titulo: Automação pode rodar no máximo uma vez por contato, ou só depois de N horas
---

No editor de automação, o quadro novo "Para o mesmo contato":

- **Rodar no máximo uma vez por contato:** o lead que volta pelo mesmo anúncio não recebe a sequência inteira de novo.
- **Não repetir para o mesmo contato por N horas** (de 1 a 720): a automação só volta a valer para aquela pessoa depois do intervalo.

Quando a automação pula alguém por causa disso, a aba Atividade mostra o motivo. A contagem começa a partir desta versão (execuções antigas não sabiam de qual contato eram). Migration 0524, aplicada pelo `update.sh`. Trazido do produto original.

---
impacto: capacidade_nova
secao: adicionado
titulo: Automações — nova ação "Tirar tag" (do negócio ou do contato)
---

Ao criar uma regra de automação, agora há a ação **Tirar tag**: ela tira as etiquetas escolhidas do negócio (padrão) ou do contato. "VIP" tira "vip", e tirar uma etiqueta que já saiu não dá erro. A troca é feita no banco numa só operação, então duas regras ao mesmo tempo não apagam a etiqueta uma da outra. Uma migration nova (0548), aplicada pelo `update.sh`.

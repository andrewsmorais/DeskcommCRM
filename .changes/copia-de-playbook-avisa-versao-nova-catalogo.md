---
impacto: capacidade_nova
secao: adicionado
titulo: A cópia de um playbook do catálogo avisa quando sai versão nova, e deixa adotar
---

Quando a plataforma publica uma versão nova de um playbook do catálogo que a organização
copiou (instalou), o painel de Skills passa a avisar "há uma versão nova do modelo" na cópia
instalada. O aviso usa o coração do que já existia: o `forked_from_version_id` da cópia da org,
comparado com a `version_id` que o ponteiro de plataforma aponta hoje — se diferem, o catálogo
publicou versão nova depois de instalada. O botão "Adotar versão nova" re-usa o install e aponta
a cópia para a versão mais recente de plataforma; a versão que a organização tinha fica intacta no
histórico (a cópia nunca é regravada). Skills importadas manualmente (.zip) nunca mostram o aviso.
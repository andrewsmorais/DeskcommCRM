---
impacto: exige_acao
secao: alterado
titulo: Instalação e atualização usam as imagens deste fork
---

O instalador, o atualizador e os padrões do `docker-compose.prod.yml` passam a usar as imagens publicadas por este repositório (`ghcr.io/andrewsmorais/...`) em vez das do projeto original — antes, o `update.sh` trocava o produto deste fork pela imagem do upstream.

## Requer atenção

Antes de atualizar uma VPS, confira que o workflow **Publicar imagem Docker** deste repositório rodou na `main`, que os três pacotes (`deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler`) estão como **públicos** no GitHub (pacote novo nasce privado), e que existe uma versão marcada (`v...`). O pré-voo do atualizador recusa a troca enquanto alguma imagem não existir ou for privada.

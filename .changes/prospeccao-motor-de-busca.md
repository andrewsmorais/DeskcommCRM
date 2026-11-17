---
impacto: capacidade_nova
secao: adicionado
titulo: Prospecção — escolher onde buscar as empresas (Apify, Scavio ou motor próprio)
---

Na tela da Prospecção, a configuração ganhou "Onde buscar as empresas": a Apify de sempre, a Scavio (Google Maps, com a chave da própria empresa) ou o motor de busca próprio da instalação, que não precisa de chave. A busca volta no idioma da empresa. Quem não escolher nada continua na Apify, sem mudança nenhuma. A prospecção segue dentro do módulo de disparo em massa, desligado por padrão.

Para usar o motor próprio, quem administra a instalação preenche `PROSPECTING_LOCAL_HTTP_URL` no `.env` (vazio = desligado). Nenhuma variável nova é obrigatória.

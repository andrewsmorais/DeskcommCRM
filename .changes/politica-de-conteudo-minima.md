---
impacto: nada_mudou
secao: corrigido
titulo: Segurança — política de conteúdo (CSP) mínima em todas as telas
---

A varredura do ZAP apontou que as telas não mandavam o cabeçalho `Content-Security-Policy`. Agora mandam uma política mínima, que não depende do endereço da instalação:

- `object-src 'none'`: o navegador não carrega `<object>`/`<embed>`;
- `base-uri 'self'`: um `<base>` injetado não desvia links para outro site;
- `frame-ancestors 'none'`: o app não pode ser aberto dentro de outro site (o mesmo que o `X-Frame-Options`, na forma dos navegadores novos).

Nada a fazer na atualização.

---
impacto: nada_mudou
secao: corrigido
titulo: Segurança — texto com caractere nulo e método TRACE não derrubam mais a API
---

O teste de entradas estranhas (schemathesis) achou dois jeitos de fazer a API responder "erro interno" (500):

- **Texto com caractere NULO ou Unicode incompleto** em qualquer formulário: o banco não guarda esses caracteres, e a gravação quebrava no meio. Agora a requisição é recusada logo na entrada, com uma mensagem (422). Webhooks e integrações por token não passam por essa guarda, para nenhum evento de fora se perder.
- **Método TRACE** (usado só para sondar servidores): o Next.js responde 500 antes de qualquer rota. O Caddy da instalação agora responde 405 a TRACE, TRACK e CONNECT. Em VPS com outro proxy (Traefik da hospedagem), o 500 continua, mas sem vazar nenhum dado.

A imagem do scheduler também passou a aplicar as atualizações de segurança do Alpine.

Nada a fazer na atualização.

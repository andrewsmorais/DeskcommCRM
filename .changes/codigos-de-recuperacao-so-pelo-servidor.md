---
impacto: exige_acao
secao: corrigido
titulo: Códigos de recuperação da verificação em duas etapas voltam a funcionar, guardados só pelo servidor
---

Os códigos de recuperação (os 10 códigos para entrar quando se perde o celular) eram gravados de um jeito que a tela de entrada nunca encontrava: nenhum funcionava. Agora são gravados e conferidos do mesmo jeito, com o segredo da instalação, e só o servidor lê e grava a tabela. Cadastrar uma segunda verificação também passa a pedir o código atual. A tela de Segurança avisa quem ficou sem códigos válidos.

## Requer atenção

Quem já tinha a verificação em duas etapas ligada precisa gerar códigos novos em Configurações › Segurança (a tela mostra o aviso). Trocar o `INTERNAL_SECRET` também invalida os códigos já emitidos.

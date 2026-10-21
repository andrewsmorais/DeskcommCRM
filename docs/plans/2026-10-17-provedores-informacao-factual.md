# Provedores: informação consistente com o runtime

Escopo: corrigir duas informações do painel existente, sem mudar cores, classes, layout, credenciais ou dados.

- `embedding_indexar` e `embedding_consultar` tinham `fixo.razao`, mas não `fixo.usa`. O resolvedor de apresentação caía no modelo de conversa da organização. O runtime de embedding continuava usando o contrato `openai/text-embedding-3-small`, com 1536 dimensões.
- A seleção vazia de credencial mostrava “da instalação”, embora o resolvedor priorize a credencial validada da organização. O texto passou a “Escolha automática”.
- Os pontos fixos agora informam `text-embedding-3-small`. Um binding legado com modelo de conversa continua gerando aviso, explicando que o modelo fixo prevalece.

Prova funcional local, com `envDir: false` e o setup de testes comercial: antes da correção, 3 falhas previstas e 44 casos aprovados; depois, 47 casos aprovados em 4 arquivos, em 11,22 segundos. A suíte cobre o resolvedor, a correspondência com o pin real de embedding, o componente e a rota de configuração. Não houve chamada paga nem acesso ao banco remoto nesses testes.

ESLint focal: zero erros; um aviso preexistente de `set-state-in-effect` em `PainelDeProvedores.tsx:148`. Verificação focal de whitespace do Git sem problemas. A prova visual da página após recarregar fica com a homologação principal.

Checklist Sistema Vivo: o registro e a configuração atual alimentam o painel `/app/ai/providers`, acessível pela navegação existente. Esta é uma correção de leitura, sem mutação, nova porta ou novo componente arquitetural; não há evento de auditoria novo. O aviso explica o próximo passo quando um binding legado diverge do contrato. A continuidade do atendimento e o comportamento de execução permanecem no runtime existente. O teste compara o modelo anunciado com o contrato usado para embedding, impedindo o retorno da divergência.

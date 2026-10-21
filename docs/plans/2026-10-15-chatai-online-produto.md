# ChatAI Online — plano de produto

Data: 15/10/2026. Estado: proposta para revisão, com rascunhos operacionais. Este documento não comprova que a oferta já funciona de ponta a ponta e não publica agentes, configurações ou página.

Atualização de 16/10/2026: o responsável autorizou implementar planos e modificar
checkout Asaas e catálogo Supabase. As restrições antigas deste documento sobre
não tocar no checkout descrevem a fase de avaliação anterior. Estado da
implementação, provas e pendências: [registro de execução](2026-10-16-planos-implementacao.md).

## 1. Produto e resultado para o cliente

O modelo-alvo confirmado pelo responsável é uma **plataforma SaaS ChatAI Online vendida a empresas**. Cada cliente contrata um plano, acessa seu ambiente e configura os próprios agentes de atendimento, vendas, suporte e agendamento, com contexto disponível para a equipe no Inbox e no funil. A experiência de configuração do Umbler Talk é uma referência funcional; não há promessa de paridade integral com esse produto.

ChatAI Online reúne a página de vendas existente e o CRM personalizado nessa oferta. A página já promete **sem taxa de setup**; assistência inicial deve respeitar essa condição, sem importar a cobrança de implantação da referência externa. A capacidade do cliente de configurar os próprios agentes é parte central do produto-alvo, mesmo quando ele pede ajuda para começar.

A página explica a oferta e conduz a contratação. O CRM é a área de trabalho do cliente: acompanhar conversas, oportunidades, agenda, agentes e atendentes. Ambos usam a identidade ChatAI Online; unificar o produto não exige reunir imediatamente os dois códigos em um único aplicativo.

O primeiro resultado vendável é uma jornada demonstrável: uma pessoa entra em contato, recebe atendimento adequado ao negócio, tem o próximo passo registrado e consegue falar com uma pessoa da equipe quando necessário. Ganhos de faturamento, atendimento sem filas e fechamento automático não estão comprovados por este plano.

A definição do produto não depende de escolher entre um agente para uso próprio e um cliente piloto. Uma empresa ou organização de teste servirá apenas para validar a jornada SaaS. Seu nicho e dados de negócio permitem preparar um caso concreto, sem restringir a plataforma a esse caso ou adiar sua definição comercial. Os rascunhos abaixo são bases configuráveis, não uma configuração pronta para qualquer empresa.

### Jornada SaaS desejada

| Etapa | Resultado que precisa ser demonstrado |
| --- | --- |
| Página de vendas | Empresa entende a oferta, os preços por atendente e os limites do plano |
| Cadastro e organização | Responsável entra em um ambiente da própria empresa, com seus dados separados dos demais clientes |
| Plano | Plano e assinatura ficam associados à organização correta pelo fluxo existente |
| Conectar WhatsApp | Cliente conecta o número e enxerga o estado real do canal |
| Perfil, processo e conhecimento | Cliente define objetivo, tom, etapas do atendimento, fontes e limites do agente nas superfícies existentes |
| Testar e publicar | Cliente confere respostas e ações em teste e só publica quando aprovar o resultado |
| Atender com a equipe | IA e humanos acompanham o mesmo contexto, com passagem e retomada explícitas |
| Medir consumo | Organização entende seu uso de IA, limites e custo, conforme a capacidade de medição que for comprovada |

Essa tabela é o percurso de aceite, não a afirmação de que já existe um assistente de configuração único. Primeiro será localizada e testada a cobertura pelas telas e integrações atuais; lacunas concretas serão registradas antes de decidir mudanças.

## 2. Organização por cliente

Cada empresa contratante corresponde a uma organização do CRM, com seus membros, contatos, conversas, agentes, conhecimento, agenda e oportunidades. Uma assinatura deve ser vinculada à organização correta por uma fonte autenticada e confiável.

Uma unidade, marca adicional ou nova equipe dentro do mesmo cliente exige uma decisão operacional antes de criar outra organização. “Multiunidade” e “multimarca” na página não definem sozinhas essa regra.

A conta e a organização existentes serão preservadas. Recuperar o acesso é pré-requisito para configurar e provar o produto. A sessão local, as permissões e as quatro áreas principais ainda precisam de verificação real de navegação.

## 3. Papéis dos agentes

Os papéis abaixo não significam que serão necessários cinco agentes independentes. O primeiro pacote pode usar menos agentes se isso atender a jornada com clareza; roteamento só entra quando houver agentes publicados que precisem compartilhar um canal.

| Papel | Entrada e trabalho | Saída esperada | Limite a configurar |
| --- | --- | --- | --- |
| Recepção e atendimento | Identifica o motivo do contato e usa o conhecimento aprovado da empresa | Dúvida respondida, contexto de qualificação ou destino correto | O que pode resolver e o que precisa de humano |
| Vendas | Entende necessidade, apresenta opções do catálogo e acompanha a oportunidade | Próximo passo comercial e funil atualizado quando a capacidade estiver autorizada | Propostas, descontos e compromissos permitidos |
| Agendamento | Entende serviço, profissional/recurso e preferência de horário | Consulta de disponibilidade e agendamento confirmado pela operação | Regras de disponibilidade, alteração e cancelamento |
| Suporte | Entende o problema e orienta pelos procedimentos aprovados | Orientação resolutiva ou caso encaminhado com contexto | Acesso, alterações e situações que exigem especialista |
| Apoio à equipe | Ajuda o operador com contexto e resposta sugerida | Resumo ou orientação que o operador pode revisar | Acesso às informações e autoridade de cada membro |

“Apoio” é inicialmente uma proposta de uso. A superfície concreta disponível no CRM deve ser demonstrada antes de anunciá-la como recurso de plano. Não implica implementar um módulo novo.

### Rascunhos curtos para configurar pela tela

Os textos são bases para revisão. Os campos entre colchetes dependem de informações do cliente e devem estar preenchidos antes do teste. Preços, horários, políticas e prazos ficam nas fontes aprovadas da empresa; não são inventados aqui.

**Recepção e atendimento**

> Você atende a [empresa], que oferece [serviços/produtos]. Descubra em uma pergunta o que a pessoa precisa e consulte as fontes aprovadas relacionadas ao assunto. Se houver interesse comercial, reúna apenas o contexto necessário para a próxima etapa. Se for suporte ou agendamento, direcione mantendo o que já foi informado. Use [tom de voz aprovado] e explique o próximo passo em linguagem simples.

**Vendas**

> Você conduz a conversa comercial da [empresa]. Entenda a necessidade, o resultado esperado e as condições relevantes antes de apresentar opções do catálogo. Relacione a opção ao que a pessoa contou e confirme o próximo passo. Use as condições comerciais da fonte aprovada e respeite os limites de negociação definidos para este papel. Nos casos [situações que exigem especialista], entregue o contexto ao responsável humano.

**Agendamento**

> Você ajuda a marcar [serviços] da [empresa]. Descubra o serviço, o recurso/profissional quando aplicável e a preferência de dia e horário. Consulte a disponibilidade da agenda antes de oferecer opções. Confirme a opção escolhida e execute o agendamento autorizado; só comunique a confirmação quando a operação retornar sucesso. Para reagendamento e cancelamento, identifique o compromisso e siga as regras aprovadas da empresa. Em falha ou indisponibilidade, explique o estado real e encaminhe o próximo passo.

**Suporte**

> Você presta o suporte inicial da [empresa]. Entenda o problema, o que a pessoa já tentou e o efeito observado. Use os procedimentos aprovados, uma orientação por vez, e confira o resultado. Ao chegar a [limites e situações de escalada], encaminhe um resumo com o problema, as tentativas e o que falta resolver. Não marque a demanda como resolvida apenas porque enviou uma instrução.

**Apoio à equipe — proposta condicionada à superfície existente**

> Ajude o operador da [empresa] a compreender a conversa e preparar o próximo passo. Resuma a necessidade, os fatos confirmados, os compromissos existentes e a pendência. Quando solicitado, sugira uma resposta baseada nas fontes disponíveis e deixe explícito o que exige conferência do operador. Mantenha as permissões da organização e do membro solicitante.

**Roteamento — se necessário**

> Classifique o motivo predominante como atendimento, vendas, suporte ou agendamento. Preserve o contexto já coletado. Se a intenção não estiver clara, faça uma pergunta curta. Direcione somente para destinos efetivamente configurados; pedidos de pessoa humana seguem o mecanismo de passagem do CRM.

## 4. Informações mínimas para a implantação

Antes de configurar: nome e atividade da empresa; público atendido; fuso; canal e número; catálogo/serviços; fontes de preços e condições; disponibilidade real; regras de agendamento; responsáveis humanos; horário e expectativa de resposta da equipe; limites de autoridade da IA; etapas do funil; conhecimento aprovado; tom de voz; dados estritamente necessários; situações de passagem e encerramento.

A OpenAI é a preferência indicada pelo responsável pelo produto. A configuração deve usar a superfície de credenciais existente no CRM e os modelos suportados pelo código. É necessário validar a credencial, o uso de ferramentas, o custo de uma jornada e o consumo por organização. Este documento não solicita nem registra chave de API e não promete operação sem custo de IA.

## 5. Texto proposto para a página existente

Proposta editorial para revisão, preservando a estrutura visual, o hero com celular, as seções, a paleta e os componentes atuais. Nada desta seção foi aplicado à página.

| Elemento existente | Texto proposto |
| --- | --- |
| Selo do hero | CRM + Atendimento com IA |
| Título | Atendimento, vendas e agendamentos no WhatsApp, conectados ao seu CRM. |
| Descrição | Configure agentes com o conhecimento e os processos da sua empresa. Organize conversas, oportunidades e agendamentos com a IA e sua equipe no mesmo histórico. |
| CTA principal desktop e celular | Ver planos |
| Link de acesso | Acessar meu CRM |
| Título da seção de benefícios | Do primeiro contato ao próximo passo, tudo no mesmo lugar |
| Benefício de atendimento | Respostas com o conhecimento do seu negócio |
| Benefício comercial | Oportunidades acompanhadas no funil |
| Benefício de agenda e equipe | Agendamentos e passagem para sua equipe |
| CTA final | Conhecer os planos |

“Ver planos” leva à seção de preços atual. “Acessar meu CRM” precisa apontar para o endereço correto do ambiente em que a página estiver rodando e ser provado no navegador. Não se propõe mudar o comportamento do botão que abre o checkout nesta fase do plano.

Afirmações existentes que exigem comprovação antes de continuar na oferta pública: disponibilidade 24h, centenas de atendimentos simultâneos, fechamento automático, mais de 50 idiomas, integrações representadas por logotipos, teste gratuito, atendimento Prime/VIP, “Mais Escolhido” e avaliação 4,8 com 127 avaliações no dado estruturado. A presença dessas frases ou selos no código não é evidência da entrega.

## 6. Planos e benefícios fixos, entrega a comprovar

**Escopo comercial fixado pelo usuário:** nomes, preços, mínimos e benefícios são os da página de vendas ChatAI Online apresentada na imagem e no componente `Pricing.tsx`. A referência Umbler não substitui essa oferta. Cada benefício será configurado ou implementado e comprovado; uma lacuna técnica não autoriza cortar o benefício, reduzir o limite ou mudar o plano automaticamente. Valores abaixo foram lidos no componente de preços; não constituem nova precificação.

| Plano | Mensal por atendente | Equivalente mensal trimestral | Equivalente mensal anual | Mínimo exibido |
| --- | --- | --- | --- | --- |
| Essencial | R$ 107 | R$ 97 | R$ 86 | 2 atendentes |
| Impulso | R$ 159 | R$ 143 | R$ 127 | 3 atendentes |
| Escala | R$ 234 | R$ 211 | R$ 187 | 3 atendentes |

Na contratação mensal, a leitura dos valores e mínimos exibidos resulta em pisos de **R$ 214/mês no Essencial**, **R$ 477/mês no Impulso** e **R$ 702/mês no Escala**. É a multiplicação da tabela existente, não uma mudança de preço. A vitrine deve esclarecer preço unitário e piso total para evitar que R$ 107, R$ 159 e R$ 234 sejam entendidos como custo total da organização. O valor efetivamente cobrado ainda deve ser confrontado com o fluxo existente.

O componente apresenta os preços por atendente/mês e calcula totais por período. A correspondência entre valor exibido, quantidade de atendentes, período, cobrança efetiva e organização precisa ser conferida no fluxo existente antes da oferta ser considerada validada. Este plano não altera os valores nem o checkout Asaas.

| Plano | Posicionamento da oferta | Trabalho pendente de comprovação |
| --- | --- | --- |
| Essencial | Organiza | Entregar e provar cada benefício do snapshot; medir consumo e capacidade para sustentar a oferta |
| Impulso | Acelera | Entregar e provar agendamento, distribuição, automações e os demais benefícios anunciados |
| Escala | Automatiza e Integra | Entregar e provar benefícios ilimitados, controles, multiunidade/multimarca e atendimento Prime |

O Essencial inclui 2 números; o Impulso, até 3 números e 5 pipelines; o Escala, WhatsApps e pipelines ilimitados, conforme a oferta fixada. A entrega desses limites ainda precisa de prova. Medição de capacidade, custo e configuração orienta como cumprir a oferta e não muda esses benefícios. Franquia de IA, excedentes, armazenamento e detalhes de implantação/suporte que a página não especifica permanecem sem definição; não serão acrescentados como restrição ou cobrança automaticamente.

### Snapshot fiel dos benefícios por plano

Fonte: `D:/Antigravity/Agente de vendas/web/src/components/Pricing.tsx`, lido em 15/10/2026, correspondente à página indicada pelo usuário. Estado: escopo aprovado como oferta; ativação e entrega técnica ainda não comprovadas por este documento. O registro não altera preços, checkout ou código dos aplicativos.

Condições comuns, preservadas literalmente: **“Todos os planos incluem 7 dias de teste grátis. Cancele quando quiser. Sem taxa de setup.”** O CTA atual dos cards é **“Começar teste grátis”**. Essas condições são parte do escopo a entregar, e não sugestões a redefinir.

**Essencial — Organiza**

- 2 Números de WhatsApp
- Caixa de entrada compartilhada
- CRM Kanban
- Fluxos de atendimento IA
- Agentes IA
- Base de conhecimento
- Relatórios essenciais

**Impulso — Acelera — Tudo do Essencial, mais:**

- Até 3 Números de WhatsApp
- 5 pipelines de vendas
- Fluxos avançados e Agendamento
- Campanhas em massa
- Distribuição automática de leads
- Agentes IA com processos
- Skills para IA
- API e Webhooks
- Relatórios completos

**Escala — Automatiza e Integra — Tudo do Impulso, mais:**

- WhatsApps ilimitados
- Pipelines ilimitados
- Distribuição avançada
- Permissões avançadas
- Logs e auditoria
- Integrações avançadas para IA
- Multiunidade e multimarca
- API aberta para chat customizado
- Atendimento Prime (VIP)

### Consumo, assentos e eventual crédito

A vitrine atual cobra por atendente, com os mínimos 2/3/3 preservados. A contagem técnica precisa corresponder à oferta; a distinção entre humano e IA que não está explícita deve ser esclarecida sem importar automaticamente a regra da referência externa ou alterar os benefícios aprovados.

Créditos de atendimento são uma **proposta comercial a avaliar**. A existência de carteira, saldo, débito, recarga e relatório equivalentes no checkout atual não foi verificada. Nenhuma dessas capacidades é considerada entregue e nenhuma será implementada apenas por constar deste plano.

Primeiro devem ser medidas as interações e os custos reais da OpenAI por organização, incluindo cenários com ferramentas, conhecimento e falhas. O desenho técnico e comercial do consumo ainda não está especificado na oferta. Quantidade, unidade, preço por crédito, conversão monetária, validade, recarga e tratamento de saldo insuficiente **não estão definidos**. Não se acrescenta cobrança ao cliente, franquia ou restrição automaticamente. Valores e políticas da Umbler não são transferidos para o ChatAI Online; eventual decisão futura exige proposta explícita do responsável, preservando a oferta atual enquanto não houver outra decisão.

## 7. Sequência de execução

1. **Recuperar o acesso local.** Manter a correção dos cookies, iniciar o checkout que contém o design personalizado, abrir no Chrome solicitado pelo usuário e provar login com a conta existente. A senha é digitada pelo próprio usuário. Verificar dashboard, agenda, Kanban e Inbox; atualizar cada página e confirmar organização e sessão. Registrar a URL realmente acessível.
2. **Preparar a configuração SaaS e seu caso de validação.** Mapear a jornada da seção 1 nas superfícies existentes e usar uma empresa de teste para reunir as informações da seção 4. O caso piloto valida o produto; não define se ele será SaaS ou serviço de agente próprio. Conferir canal, credencial OpenAI, modelos, funil, conhecimento e regras na superfície do CRM. Criar/revisar rascunhos de agentes com capacidades mínimas e limites explícitos e demonstrar como o cliente os altera.
3. **Entregar e provar atendimento, vendas, agenda e passagem.** Usar o teste do motor real em sandbox e registrar resposta, operação tentada e resultado. Depois de revisão e autorização de publicação, realizar a jornada no canal controlado. Recursos do snapshot sem prova continuam como trabalho pendente de configuração ou implementação; não são retirados da oferta por esse motivo.
4. **Ligar página, conta e assinatura existentes.** Aproveitar URLs e integração já presentes. Demonstrar que o cliente autenticado entra na organização correta, que o plano contratado corresponde à oferta e que o estado de assinatura é reconhecido no fluxo existente. Investigar incompatibilidades comprovadas; o checkout Asaas permanece fora das alterações deste plano.
5. **Acabamento visual por último.** Interpretar o pedido como “a gente mexe no design por último”. Ajustes visuais futuros partem da identidade e dos componentes aprovados; não se trata de criar um agente autônomo de design.

**VPS da Hostinger está fora da fase atual.** Não há instalação, publicação, migração ou alteração de produção nesta etapa. A hospedagem conjunta de página e CRM será decidida depois das provas locais e do pacote comercial validado.

### Lacunas concretas para cumprir a oferta

Leitura focal da tarefa principal em `lib/billing.ts` e no percurso de agentes, sem concluir defeito no checkout externo:

| Prioridade | Evidência e próximo trabalho |
| --- | --- |
| Contagem de atendentes | A cobrança do CRM lê `seats`; não foi encontrado controle conjunto de humanos e IA. Esclarecer a unidade da oferta e provar a contagem correspondente, preservando preços e mínimos |
| Benefícios por plano | Os limites reconhecidos cobrem WhatsApp, pipelines e setores, sem demonstrar controle do pacote completo. Mapear cada string do snapshot para capacidade e validação, implementando as lacunas necessárias |
| Plano e teste de 7 dias | O provisionamento de organização não comprova associação de plano e início de trial. Esse vínculo pode depender do checkout, fora desta análise; rastrear o percurso existente antes de concluir a causa |
| Suspensão consistente | Há divergência entre estados usados no banner de suspensão e em `canUse`. Definir o estado real da assinatura e alinhar aviso e acesso conforme a oferta |
| Consumo | Há registro de tokens/custo, que não comprova carteira financeira de créditos. Demonstrar a medição disponível; nenhuma cobrança adicional está aprovada |
| Configuração pelo cliente | Já há editor, configuração, teste e publicação de agentes. O trabalho de experiência prioriza criação pelo objetivo, conhecimento vinculado no mesmo percurso e transição clara de rascunho para teste e publicação |

Esse backlog orienta a próxima implementação. Não afirma que as correções foram aplicadas nem autoriza alterar checkout, executar migrations ou publicar.

## 8. Critérios de aceite e evidência

### Acesso e navegação

- Conta existente entra no CRM local sem criar usuário ou organização substitutos.
- Dashboard, agenda, Kanban e Inbox carregam e permitem navegação entre si.
- Atualização de página preserva sessão e organização ativa; saída da conta encerra o acesso protegido.
- A evidência inclui URL, data, resultado e captura de tela sem senha, token ou dado pessoal exposto.

### Agenda

- Com disponibilidade controlada e fuso definido, uma consulta mostra horários consistentes com a agenda real e não oferece um horário bloqueado.
- A escolha confirmada cria um único compromisso no recurso e organização corretos, com data, horário e vínculo ao contato visíveis na agenda.
- Uma falha de operação não produz mensagem de “agendado”; o estado e o próximo passo ficam claros para cliente e operador.
- Repetição da mesma tentativa e disputa pelo mesmo horário não deixam compromissos duplicados ou conflitantes; o resultado é verificado na tela.
- Reagendamento e cancelamento só contam como recursos aprovados depois de capacidade autorizada e prova de que o compromisso correto mudou, preservando contexto e sem alterar compromissos de outra organização.
- Sincronização com Google Agenda só entra na promessa depois de prova própria; agenda interna não comprova integração externa.

### Passagem para humano e continuidade

- A frase “quero falar com uma pessoa” gera passagem visível para a equipe e informa ao cliente o estado real do atendimento.
- O operador recebe motivo, necessidade, fatos, tentativas, pendência e próximo passo; não precisa reconstruir tudo a partir da conversa crua.
- A conversa aparece na fila/Inbox adequada da organização e pode ser assumida por membro autorizado.
- Após a passagem, a IA e os follow-ups automáticos não continuam competindo com o humano. A retomada da IA exige ação humana explícita compatível com o mecanismo existente.
- O humano consegue responder e registrar o desfecho; quando autoriza a retomada, o contexto necessário continua disponível.
- Ausência de operador não vira promessa de resposta imediata: usa a expectativa de atendimento configurada e mantém a pendência visível.

### Oferta e assinatura

- A página leva ao CRM correto e usa os mesmos nomes de plano apresentados no fluxo de contratação existente.
- Um responsável autorizado consegue seguir cadastro/organização, plano, canal, perfil/processo/conhecimento, teste, publicação autorizada e atendimento com humano. Etapa sem cobertura existente fica registrada como lacuna a resolver, sem ser anunciada como concluída e sem alterar a oferta fixada.
- Uma edição de perfil ou conhecimento continua isolada na organização correta; mudanças em rascunho e versão em atendimento são distinguíveis para o cliente.
- Preço por atendente, mínimo, período e total efetivo são conferidos sem alterar a implementação Asaas nesta etapa.
- Não se associa assinatura a uma organização apenas porque um identificador veio da URL.
- Nenhuma prova cria cobrança real ou envia comunicação externa sem autorização específica para esse ato.
- O cliente consegue consultar o consumo que o sistema efetivamente mede. Créditos e compra de saldo são um desenho ainda não especificado; não geram cobrança, restrição ou mudança dos benefícios automaticamente.

## 9. Fontes e limites desta avaliação

Fontes lidas para este plano:

- Transcrição fornecida: `C:/Users/andre/.codex/attachments/86424a1d-dd3b-4dd9-85af-edc6f125860f/Texto colado.txt`. O vídeo demonstra uma proposta; suas afirmações não comprovam o estado deste checkout. A própria transcrição descreve a cobrança como MVP.
- Imagem da página fornecida pelo usuário: identidade roxa, composição, seções e planos existentes.
- Página de vendas: `D:/Antigravity/Agente de vendas/web/src/app/page.tsx`; hero, benefícios, FAQ e dados estruturados.
- Planos: `D:/Antigravity/Agente de vendas/web/src/components/Pricing.tsx`; preços, mínimos, períodos e recursos anunciados.
- Licença: [`../../LICENSE`](../../LICENSE), MIT. A licença permite uso e distribuição comercial observadas suas condições, incluindo manutenção do aviso de copyright e da licença nas cópias ou partes substanciais. Não concede por si direitos sobre marcas ou serviços de terceiros.
- CRM: [`../../app/app/page.tsx`](../../app/app/page.tsx), [`../../app/app/agenda/page.tsx`](../../app/app/agenda/page.tsx), [`../../app/app/kanban/page.tsx`](../../app/app/kanban/page.tsx) e [`../../app/app/inbox/page.tsx`](../../app/app/inbox/page.tsx). Foram localizadas as superfícies; a existência dos arquivos não prova navegação funcional.
- Configuração: [`../../app/app/ai/agents/page.tsx`](../../app/app/ai/agents/page.tsx), [`../../app/app/ai/routers/page.tsx`](../../app/app/ai/routers/page.tsx) e [`../../app/app/ai/credentials/page.tsx`](../../app/app/ai/credentials/page.tsx).
- Passagem humana: [`../../lib/agent-engine/agent/human-handoff.ts`](../../lib/agent-engine/agent/human-handoff.ts); o código descreve silenciamento da IA, cancelamento de follow-ups pendentes e contexto para a equipe, com liberação humana para retomada.
- Guias operacionais: [`../../.agents/skills/deskcomm-cliente-novo/SKILL.md`](../../.agents/skills/deskcomm-cliente-novo/SKILL.md) e [`../../.agents/skills/sistema-vivo/SKILL.md`](../../.agents/skills/sistema-vivo/SKILL.md).

### Referência funcional e comercial consultada em 15/10/2026

As fontes abaixo descrevem a Umbler, não o estado ou a entrega do ChatAI Online. Os resumos apoiam decisões de produto sem importar integralmente recursos, condições ou preços.

- **Oferta comercial:** apresenta assinatura por atendente, agentes trabalhando com a equipe e configuração baseada no negócio. Também oferece implantação especializada como serviço adicional. A referência ajuda a compreender o modelo SaaS, mas o ChatAI Online preserva seus próprios preços, benefícios e condição de ausência de taxa de setup; a cobrança adicional de implantação da Umbler não é incorporada. [Página oficial de agentes de IA da Umbler](https://www.umbler.com/br/talk/agente-ia-whatsapp).
- **Configuração e capacidade:** a documentação organiza o agente em perfil, comportamento e treinamento, permite editar e testar, e conta atendentes humanos e virtuais dentro da capacidade contratada. Para o ChatAI Online, a referência orienta uma jornada compreensível de configuração e exige esclarecer a unidade “atendente”; não comprova que todos esses controles já existam no CRM. [Como funcionam os Agentes de IA](https://help.umbler.com/hc/pt-br/articles/27691395224717-Como-funciona-os-Agentes-de-IA).
- **Consumo:** documenta compra de créditos, uso por interações de IA e modelos pagos de canais oficiais, recarga opcional e relatório por período. Para o ChatAI Online, a lição é tornar consumo e cobrança compreensíveis. Uma eventual carteira de créditos permanece proposta, com existência, regras e preço a verificar ou definir; esta fase não a implementa. [Compra e acompanhamento de créditos de atendimento](https://help.umbler.com/hc/pt-br/articles/41665126365709-Comprando-cr%C3%A9ditos-de-atendimento-no-Account).

Nenhum segredo foi lido ou registrado para produzir este documento. Não foram executados testes, configurações, cobranças, publicação ou alterações nos dois aplicativos por esta tarefa documental.

Evidência de execução local informada pela tarefa principal nesta sessão: `/login` respondeu HTTP 200 e o servidor de desenvolvimento foi reiniciado com sucesso. Uma consulta HTTPS sem credenciais ao serviço de autenticação retornou 401, resposta esperada para a chamada; isso não valida login. Autenticação da conta antiga, navegação e persistência da sessão continuam pendentes. A disponibilidade da tela de login não comprova acesso recuperado.

## 10. Continuidade da operação a comprovar

Este checklist descreve o destino exigido para a validação; não marca implementação como concluída.

| Pergunta | Artefato e prova pendente |
| --- | --- |
| Quem alimenta? | Conversa do canal configurado, usuário autenticado e fontes de conhecimento da organização; demonstrar no primeiro pacote |
| Quem recebe o resultado? | Inbox, oportunidade no Kanban, agenda ou operador responsável; provar o destino de cada situação |
| Que registro emite? | Atividade/timeline, registro do compromisso e passagem humana existentes; conferir na jornada, sem criar fonte paralela |
| Onde aparece? | Inbox e agenda existentes; confirmar que resultado e falha são visíveis para quem decide |
| Por qual porta chega? | Login e navegação existentes do CRM, agentes e credenciais; provar com a conta recuperada |
| Qual o próximo passo? | Compromisso, ação comercial, caso com responsável ou encerramento explícito; definir na implantação |
| Onde se configura? | Telas existentes de agentes, credenciais, conhecimento, canal e agenda; registrar caminho real ao implantar |
| Qual a continuidade? | Passagem com contexto, silêncio da IA e retomada autorizada pelo humano; cumprir critérios da seção 8 |
| O que muda após erro? | Responsável revisa a fonte, regra ou rascunho, reproduz o caso no teste e só então autoriza publicação |
| Mapa atualizado? | Nenhuma peça de arquitetura foi criada neste plano. Se uma lacuna exigir implementação, localizar e documentar suas conexões antes da mudança |

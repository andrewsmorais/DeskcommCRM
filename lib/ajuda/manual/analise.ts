import type { ManualDoGrupo } from "@/lib/ajuda/manual/tipos";

export const MANUAL_ANALISE: ManualDoGrupo = {
  "/app/faturamento": {
    oQueE:
      "Responde à pergunta do fim do mês: quanto entrou, por qual forma de pagamento, quais serviços e clientes mais faturaram e quanto cada pessoa tem de comissão. Também serve para lançar entradas e saídas à mão.",
    comoUsar: [
      'Escolha o período em "De" e "Até". Ao abrir, a tela mostra do primeiro dia do mês até hoje.',
      'No alto estão os totais do período: "Entrou", "Saiu" e "Saldo", além de comandas finalizadas, valor faturado e "Ticket médio". Abaixo ficam as tabelas "Por forma de pagamento", "Serviços que mais faturaram", "Clientes que mais gastaram" e "Comissão por pessoa".',
      'Para registrar um valor que não veio de comanda, use o formulário em "Lançamentos do período": escolha o "Tipo" ("Saída" ou "Entrada"), a "Conta", escreva a "Descrição", o "Valor" e a "Data", e clique em "Lançar".',
      'Marque "Já pago" se o dinheiro já entrou ou saiu. Sem marcar, o lançamento fica como pendente. Na lista, um lançamento pendente tem o botão "Pagar" para marcá-lo como pago depois.',
      'Para apagar um lançamento pendente use o ícone de remover. Os lançamentos que vêm de comanda aparecem com a indicação "de comanda".',
    ],
    cuidados: [
      "Lançar, pagar e remover lançamentos exige papel de atendente ou superior. Quem só visualiza vê os números, sem o formulário.",
      'A lista "Conta" mostra as contas cadastradas em Configurações, na tela "Financeiro" (contas, formas de pagamento e classificação). Se ela estiver vazia, é preciso cadastrar uma conta lá antes de lançar.',
      '"Faturado" soma as comandas finalizadas; "Entrou" soma os lançamentos pagos. Os dois números não precisam bater.',
      '"Comissão por pessoa" vem dos itens das comandas finalizadas. Itens sem atendente aparecem como "Sem responsável".',
      'Se a empresa usa mais de uma moeda, a tela avisa "Moedas diferentes não se somam: cada uma tem o seu bloco".',
      'Os números de comandas dependem de as comandas estarem sendo usadas. Comandas fazem parte de "Comandas e propostas", disponível a partir do plano Impulso.',
      "Esta tela não aparece no menu lateral; ela está no hub de Análise e na busca do sistema (Ctrl+K ou ⌘K).",
    ],
  },

  "/app/honorarios": {
    oQueE:
      "Para escritórios que cobram honorários: registra o modelo de cobrança de cada caso (fixo, êxito ou misto) e o calendário de parcelas, e permite marcar cada parcela como paga.",
    comoUsar: [
      'No formulário do alto, escolha o "Modelo": "Fixo", "Êxito" ou "Misto".',
      'Preencha os valores que o modelo pede: "Valor fixo" (nos modelos Fixo e Misto) e "% de êxito" (nos modelos Êxito e Misto). "Repasse ao advogado (%)" e "ID do lead (opcional)" são opcionais. Clique em "Criar contrato".',
      'O contrato aparece na lista "Contratos". Clique nele para ver as parcelas.',
      'Em "Parcelas", preencha "Número", "Vencimento" e "Valor" e clique em "Adicionar parcela".',
      'Para registrar um pagamento, escolha primeiro em "Conta para receber o pagamento" a conta onde o dinheiro entrou e depois clique em "Pagar" na parcela. Sem escolher a conta, o botão "Pagar" não funciona. A parcela passa de "pendente" para "pago".',
    ],
    cuidados: [
      "Depende de módulo opcional: o módulo de honorários precisa estar instalado na instalação. Se não estiver, a tela mostra um aviso no lugar dos contratos, e quem resolve é quem administra a instalação.",
      'Também depende do plano: a tela está dentro do recurso "Comandas e propostas", disponível a partir do plano Impulso. Em plano abaixo, aparece a tela de recurso fora do plano.',
      "Só gerentes e administradores criam contratos, adicionam parcelas e registram pagamentos. Os demais só consultam.",
      "Os valores são mostrados em reais.",
      "Esta tela não aparece no menu lateral; ela está no hub de Análise e na busca do sistema.",
    ],
  },

  "/app/metrics": {
    oQueE:
      "Mostra como a operação está indo nos últimos 30 dias: o índice de atrito, a previsão de vendas, o funil por etapa e o desempenho de cada atendente. Quem não é gerente vê só o próprio funil e a própria performance.",
    comoUsar: [
      'Gerentes e administradores podem escolher um atendente em "Atendente" (a opção "Todos os atendentes" mostra a equipe toda) para filtrar os números.',
      'O bloco "Atrito" mostra quantas demandas foram encerradas nos últimos 30 dias, quantas ficaram sem resposta e quantas seguem abertas, e o que isso custou. Gerentes podem mudar em quantas horas de silêncio uma conversa passa a contar como perdida e clicar em "Salvar" (aceita um número inteiro de 1 a 2160).',
      'O relatório "Perdas" (só gerentes) mostra por motivo, categoria e etapa de saída quantos negócios foram perdidos e o valor por moeda.',
      'O bloco "Previsão" mostra, por mês e por moeda, o valor bruto e o valor ponderado dos negócios abertos, usando a chance de fechamento de cada etapa (ou a chance dada pela IA, quando existe).',
      'O cartão "Funil" mostra quantos negócios abertos há em cada etapa. Em seguida vem a tabela "Performance por atendente" (ou "Sua performance"), com conversas, ganhos, perdidos e tempo médio da primeira resposta.',
    ],
    cuidados: [
      'Depende do plano: relatórios completos fazem parte do plano Impulso ou superior. Em plano abaixo, a tela mostra "Disponível a partir do plano Impulso".',
      'A "Previsão" avisa quando falta calibrar: etapas sem chance definida e negócios sem data prevista entram em avisos à parte.',
      "Moedas nunca são somadas entre si.",
      'O filtro por atendente não muda o bloco "Atrito", que é do sistema inteiro.',
    ],
  },

  "/app/ads/meta": {
    oQueE:
      'Mostra o desempenho das campanhas do Meta Ads que trazem gente para o CRM: quanto foi gasto, quantos resultados e quanto custou cada um. Os números são lidos da Meta na hora em que você clica em "Atualizar"; nada fica guardado aqui.',
    comoUsar: [
      'Se a tela disser "Nenhuma conta de anúncios conectada.", clique em "Conectar conta de anúncios". Isso leva a Configurações, onde um administrador informa um token de acesso com permissão de leitura de anúncios.',
      'Com a conta conectada, escolha a "Conta de anúncios" (se houver mais de uma) e o "Período": 7, 14, 30 ou 90 dias, ou "Personalizado" com as datas "De" e "Até".',
      'Clique em "Atualizar" para buscar os dados da Meta. A tabela mostra cada campanha com "Veiculação" e colunas como "Valor Gasto", "Resultado", "Custo por Resultado", "Impressões", "Alcance", "CPM", "CPC", "CTR", "Frequência", "Hook Rate" e "Connect rate".',
      'No rodapé da tabela aparece o período e "lido em" com a data e hora da leitura. Use isso para saber se o número está atualizado.',
    ],
    cuidados: [
      "Só gerentes e administradores abrem esta tela; só administradores conectam a conta.",
      "A tela mostra o custo de trazer a pessoa. O que aconteceu depois que ela chegou (conversa, venda) está em Desempenho.",
      'Se a Meta recusar a leitura, a tela mostra o erro com um "Código" e uma "Requisição" para você passar ao suporte.',
      'Evite clicar várias vezes em "Atualizar": cada clique consulta a Meta, que limita a quantidade de consultas. O botão fica desativado enquanto carrega.',
      "Esta tela não aparece no menu lateral; ela está no hub de Análise e na busca do sistema.",
    ],
  },

  "/app/activities": {
    oQueE:
      "Relatório do que aconteceu na operação no período e de quem fez: a equipe, os agentes de IA ou o automático do sistema.",
    comoUsar: [
      'Escolha o período no seletor: "Últimos 7 dias", "Últimos 30 dias" ou "Últimos 90 dias". Ao lado fica o total de acontecimentos.',
      'Os três cartões "A equipe", "Os agentes" e "Automático" mostram quanto do total foi de cada origem.',
      'O gráfico "Quando" mostra quantos acontecimentos houve por dia.',
      'Em "Quem fez" e "O que foi feito" estão os rankings por pessoa ou agente e por tipo de acontecimento.',
      'A "Linha do tempo da operação" lista cada acontecimento com data, tipo, quem fez e, quando há, o negócio ligado a ele. O nome do negócio é um link que abre o negócio.',
    ],
    cuidados: [
      'A lista da linha do tempo mostra só os mais recentes. Quando há mais, a tela avisa "A lista mostra só os mais recentes" e diz o total do período.',
      'Se não houve nada no período, a tela mostra "Nada aconteceu neste período", com o atalho "Ver conversas".',
      "É um relatório de leitura: não dá para desfazer ou editar acontecimentos aqui.",
    ],
  },

  "/app/ai/evolution": {
    oQueE:
      "Mostra se o agente de IA está melhorando: o que ele aprendeu no período, o que fez com isso, o que mudou no resultado e o que ainda está travando.",
    comoUsar: [
      'Escolha o "Período analisado" em "De" e "Até". Ao abrir, a tela mostra os últimos 30 dias.',
      'O bloco "O que seu agente aprendeu" mostra "Regras que você ensinou", "Melhorias que você aprovou", "Habilidades instaladas" e a "Linha do tempo do aprendizado". Quando está vazio, há atalhos como "Publicar uma regra", "Ver sugestões de melhoria" e "Instalar uma habilidade".',
      'O bloco "O que ele fez" mostra quantas vezes o agente usou cada recurso: "Habilidades usadas", "Conversas encaminhadas", "Consultas aos seus materiais", "Habilidades mais usadas" e "Assuntos mais procurados". Cada um tem atalhos para configurar, como "Configurar um roteador" e "Publicar material".',
      'O bloco "O que mudou no resultado" mostra "Negócios fechados pelo agente", "Negócios perdidos pelo agente", "Mudanças de passo no atendimento", "Casos que precisaram de uma pessoa" e "Custo da IA no período".',
      'O bloco "O que está travando" aponta o que está impedindo o agente de render mais.',
    ],
    cuidados: [
      "Só gerentes e administradores abrem esta tela.",
      "A tela só mostra números e leva às telas onde o agente é configurado. Para mudar o comportamento do agente, vá nas telas de agentes, memória, habilidades e roteadores.",
      "Período curto ou agente novo deixa vários cartões vazios. Isso não é erro.",
    ],
  },

  "/app/audit": {
    oQueE:
      "É o histórico de quem fez o quê e quando dentro da conta. Os registros não podem ser apagados nem alterados por aqui.",
    comoUsar: [
      'Use os filtros: "Ação contém" (por exemplo, lead.created), "Tipo de recurso" (por exemplo, contact) e as datas "De" e "Até".',
      'A tabela mostra "Quando", "Ator" (quem fez), "Ação", "Recurso", o Request ID e o Metadata (detalhes técnicos do que mudou).',
      'Se houver muitos registros, clique em "Carregar mais".',
      'Para levar os registros do período para uma planilha, clique em "Exportar CSV".',
    ],
    cuidados: [
      "Só gerentes e administradores abrem esta tela.",
      'Depende do plano: "Logs e auditoria" faz parte do plano Escala. Em plano abaixo, a consulta e a exportação são recusadas.',
      'Se o filtro não achar nada, a tela mostra "Nenhum log no período."',
      "Os nomes de ação e de recurso são técnicos (em inglês). Para o relatório de atividade em linguagem do dia a dia, use Atividades.",
      "Esta tela não aparece no menu lateral; ela está no hub de Análise e na busca do sistema.",
    ],
  },
};

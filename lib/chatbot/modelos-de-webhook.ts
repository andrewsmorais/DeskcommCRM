/**
 * Modelos prontos do passo WebHook: Asaas (cobrança) e Pipedrive (CRM).
 *
 * São o "bloco de integração" da Umbler feito com a peça que já existe: cada
 * modelo só PREENCHE o passo WebHook (endereço, método, corpo, o que guardar da
 * resposta e em qual cabeçalho vai a chave). Quem monta o fluxo cola a própria
 * chave no campo cifrado e ajusta o que quiser — nada fica escondido.
 *
 * A chave é da EMPRESA (a conta dela no Asaas ou no Pipedrive), digitada no
 * passo e guardada cifrada; não é a chave que a instalação usa para cobrar os
 * planos.
 *
 * As respostas usadas no corpo ({{cpf}}, {{valor}}…) vêm de passos "Pedir para
 * digitar" ou "Guardar valor" colocados ANTES; {{contato_nome}},
 * {{contato_telefone}} e {{contato_email}} vêm da ficha do contato.
 */
import type { ConfigDe } from "./passos";

export type ModeloDeWebhook = {
  id: string;
  grupo: "Asaas" | "Pipedrive";
  nome: string;
  /** O que o passo faz e o que precisa existir antes. */
  explicacao: string;
  config: Pick<ConfigDe<"webhook">, "url" | "metodo" | "corpo_modo" | "corpo" | "campos" | "autorizacao_cabecalho">;
};

export const MODELOS_DE_WEBHOOK: ModeloDeWebhook[] = [
  {
    id: "asaas_cliente",
    grupo: "Asaas",
    nome: "Asaas — cadastrar o cliente",
    explicacao:
      "Cadastra o contato como cliente no seu Asaas e guarda o código dele em {{asaas_cliente}}. Antes deste passo, pergunte o CPF ou CNPJ e guarde em {{cpf}}.",
    config: {
      url: "https://api.asaas.com/v3/customers",
      metodo: "POST",
      corpo_modo: "personalizado",
      corpo: '{\n  "name": "{{contato_nome}}",\n  "cpfCnpj": "{{cpf}}",\n  "mobilePhone": "{{contato_telefone}}",\n  "email": "{{contato_email}}"\n}',
      campos: [{ caminho: "id", variavel: "asaas_cliente" }],
      autorizacao_cabecalho: "access_token",
    },
  },
  {
    id: "asaas_cobranca",
    grupo: "Asaas",
    nome: "Asaas — criar a cobrança (Pix, boleto ou cartão)",
    explicacao:
      "Cria a cobrança e guarda o link de pagamento em {{link_pagamento}}. Coloque depois do passo que cadastra o cliente, e guarde antes o valor em {{valor}} (ex.: 150.00) e o vencimento em {{vencimento}} (ex.: 2026-12-10).",
    config: {
      url: "https://api.asaas.com/v3/payments",
      metodo: "POST",
      corpo_modo: "personalizado",
      corpo: '{\n  "customer": "{{asaas_cliente}}",\n  "billingType": "UNDEFINED",\n  "value": "{{valor}}",\n  "dueDate": "{{vencimento}}",\n  "description": "{{descricao}}"\n}',
      campos: [
        { caminho: "invoiceUrl", variavel: "link_pagamento" },
        { caminho: "id", variavel: "asaas_cobranca" },
      ],
      autorizacao_cabecalho: "access_token",
    },
  },
  {
    id: "pipedrive_pessoa",
    grupo: "Pipedrive",
    nome: "Pipedrive — cadastrar a pessoa",
    explicacao: "Cadastra o contato como pessoa no seu Pipedrive e guarda o código dela em {{pipedrive_pessoa}}.",
    config: {
      url: "https://api.pipedrive.com/v1/persons",
      metodo: "POST",
      corpo_modo: "personalizado",
      corpo: '{\n  "name": "{{contato_nome}}",\n  "phone": "{{contato_telefone}}",\n  "email": "{{contato_email}}"\n}',
      campos: [{ caminho: "data.id", variavel: "pipedrive_pessoa" }],
      autorizacao_cabecalho: "x-api-token",
    },
  },
  {
    id: "pipedrive_negocio",
    grupo: "Pipedrive",
    nome: "Pipedrive — criar o negócio",
    explicacao:
      "Cria um negócio no seu Pipedrive ligado à pessoa e guarda o código em {{pipedrive_negocio}}. Coloque depois do passo que cadastra a pessoa.",
    config: {
      url: "https://api.pipedrive.com/v1/deals",
      metodo: "POST",
      corpo_modo: "personalizado",
      corpo: '{\n  "title": "Conversa com {{contato_nome}}",\n  "person_id": "{{pipedrive_pessoa}}"\n}',
      campos: [{ caminho: "data.id", variavel: "pipedrive_negocio" }],
      autorizacao_cabecalho: "x-api-token",
    },
  },
];

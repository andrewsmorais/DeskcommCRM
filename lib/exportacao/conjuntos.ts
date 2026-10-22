/**
 * O QUE entra no ZIP da exportação — uma lista declarativa, e só ela.
 *
 * Cada conjunto é uma planilha. A regra é de ALLOWLIST: uma coluna só sai se
 * estiver escrita aqui, porque tabela ganha coluna nova o tempo todo e o
 * contrário (exportar tudo menos o que se lembrou de excluir) vazaria no dia
 * em que alguém acrescentar um segredo a `contacts`.
 *
 * Ficam DE FORA, de propósito: CPF (cifrado e o hash dele), campos internos da
 * IA, tokens e credenciais de canal, e os arquivos de mídia — a exportação leva
 * o texto das conversas e o que a IA transcreveu, mas não os binários.
 *
 * A `organization_id` NUNCA aparece como coluna: o arquivo inteiro é de uma
 * organização só, e o filtro é aplicado pelo leitor, não pelo conjunto.
 */
export interface Coluna {
  /** Nome da coluna na tabela. */
  readonly campo: string;
  /** Cabeçalho na planilha, em português. */
  readonly titulo: string;
}

export interface Conjunto {
  readonly arquivo: string;
  readonly tabela: string;
  readonly colunas: readonly Coluna[];
}

const c = (campo: string, titulo: string): Coluna => ({ campo, titulo });

export const CONJUNTOS: readonly Conjunto[] = [
  {
    arquivo: "contatos.csv",
    tabela: "contacts",
    colunas: [
      c("id", "ID"),
      c("display_name", "Nome"),
      c("name", "Nome informado"),
      c("phone_number", "Telefone"),
      c("email", "E-mail"),
      c("birthdate", "Nascimento"),
      c("tags", "Etiquetas"),
      c("source", "Origem"),
      c("is_blocked", "Bloqueado"),
      c("is_anonymized", "Anonimizado"),
      c("custom_fields", "Campos personalizados"),
      c("last_activity_at", "Última atividade"),
      c("created_at", "Criado em"),
      c("updated_at", "Atualizado em"),
    ],
  },
  {
    arquivo: "conversas.csv",
    tabela: "conversations",
    colunas: [
      c("id", "ID"),
      c("contact_id", "ID do contato"),
      c("channel", "Canal"),
      c("status", "Situação"),
      c("assigned_to_user_name", "Atendente"),
      c("is_group", "Grupo"),
      c("tags", "Etiquetas"),
      c("service_started_at", "Atendimento iniciado em"),
      c("service_closed_at", "Atendimento encerrado em"),
      c("last_message_at", "Última mensagem em"),
      c("created_at", "Criada em"),
    ],
  },
  {
    arquivo: "mensagens.csv",
    tabela: "messages",
    colunas: [
      c("id", "ID"),
      c("conversation_id", "ID da conversa"),
      c("contact_id", "ID do contato"),
      c("direction", "Direção"),
      c("type", "Tipo"),
      c("body", "Texto"),
      c("media_derived_text", "Transcrição ou descrição da mídia"),
      c("media_mime", "Tipo da mídia"),
      c("template_name", "Modelo"),
      c("status", "Situação"),
      c("sent_at", "Enviada em"),
      c("created_at", "Criada em"),
    ],
  },
  {
    arquivo: "funis.csv",
    tabela: "crm_pipelines",
    colunas: [
      c("id", "ID"),
      c("name", "Nome"),
      c("description", "Descrição"),
      c("is_archived", "Arquivado"),
      c("created_at", "Criado em"),
    ],
  },
  {
    arquivo: "etapas.csv",
    tabela: "crm_stages",
    colunas: [
      c("id", "ID"),
      c("pipeline_id", "ID do funil"),
      c("name", "Nome"),
      c("position", "Posição"),
      c("is_won", "Ganho"),
      c("is_lost", "Perdido"),
      c("is_archived", "Arquivada"),
    ],
  },
  {
    arquivo: "leads.csv",
    tabela: "crm_leads",
    colunas: [
      c("id", "ID"),
      c("title", "Título"),
      c("description", "Descrição"),
      c("contact_id", "ID do contato"),
      c("pipeline_id", "ID do funil"),
      c("stage_id", "ID da etapa"),
      c("status", "Situação"),
      c("value_cents", "Valor (centavos)"),
      c("currency", "Moeda"),
      c("source", "Origem"),
      c("tags", "Etiquetas"),
      c("owner_user_id", "ID do responsável"),
      c("expected_close_date", "Fechamento previsto"),
      c("closed_at", "Fechado em"),
      c("won_reason", "Motivo do ganho"),
      c("lost_reason", "Motivo da perda"),
      c("custom_fields", "Campos personalizados"),
      c("created_at", "Criado em"),
      c("updated_at", "Atualizado em"),
    ],
  },
  {
    arquivo: "historico-dos-leads.csv",
    tabela: "crm_lead_activities",
    colunas: [
      c("id", "ID"),
      c("lead_id", "ID do lead"),
      c("contact_id", "ID do contato"),
      c("type", "Tipo"),
      c("reason", "Motivo"),
      c("payload", "Detalhes"),
      c("actor_kind", "Quem fez"),
      c("performed_at", "Feito em"),
    ],
  },
  {
    arquivo: "tarefas.csv",
    tabela: "demandas",
    colunas: [
      c("id", "ID"),
      c("assunto", "Assunto"),
      c("estado", "Situação"),
      c("origem", "Origem"),
      c("dono_kind", "Tipo de responsável"),
      c("dono_user_id", "ID do responsável"),
      c("contact_id", "ID do contato"),
      c("lead_id", "ID do lead"),
      c("aberta_em", "Aberta em"),
      c("prazo_em", "Prazo"),
      c("proximo_passo", "Próximo passo"),
      c("proximo_passo_em", "Próximo passo em"),
      c("desfecho", "Desfecho"),
      c("fechada_em", "Fechada em"),
    ],
  },
  {
    arquivo: "agendamentos.csv",
    tabela: "calendar_appointments",
    colunas: [
      c("id", "ID"),
      c("title", "Título"),
      c("description", "Descrição"),
      c("status", "Situação"),
      c("starts_at", "Início"),
      c("ends_at", "Fim"),
      c("time_zone", "Fuso"),
      c("contact_id", "ID do contato"),
      c("guest_email", "E-mail do convidado"),
      c("location_kind", "Tipo de local"),
      c("location_details", "Local"),
      c("meeting_url", "Link da reunião"),
      c("notes", "Anotações"),
      c("cancellation_reason", "Motivo do cancelamento"),
      c("cancelled_at", "Cancelado em"),
      c("created_at", "Criado em"),
    ],
  },
];

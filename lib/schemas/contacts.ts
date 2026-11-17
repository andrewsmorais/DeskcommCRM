/**
 * Zod schemas for `/api/v1/contacts/*` endpoints (EPIC-05 waves 1, 2, 8).
 *
 * Contracts:
 *  - contactCreateSchema    → POST /api/v1/contacts
 *  - contactPatchSchema     → PATCH /api/v1/contacts/[id]
 *  - contactListQuerySchema → GET /api/v1/contacts (search/tag/source/cursor)
 *  - lgpdAnonymizeSchema    → POST /api/v1/lgpd/anonymize (irreversible)
 */
import { z } from "zod";

import { normalizarTag, normalizarTags } from "@/lib/contacts/tag-normalizada";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import { isValidCpf, PAIS_PADRAO, type PerfilDoPais } from "@/lib/legal/perfil-do-pais";

export const PHONE_REGEX = /^\+\d{8,15}$/;

/**
 * Teto de 32 KB no jsonb inteiro. O CHECK do banco só garante que é OBJETO —
 * sem limite de tamanho, um cliente da API escreveria megabytes numa coluna que
 * a listagem de contatos traz inteira, e o custo apareceria como "a tela de
 * contatos ficou lenta", longe da causa.
 */
const CUSTOM_FIELDS_MAX_BYTES = 32_768;

const customFieldsSchema = z
  .record(z.string().min(1).max(80), z.unknown())
  .refine((value) => JSON.stringify(value).length <= CUSTOM_FIELDS_MAX_BYTES, {
    message: "Campos personalizados excedem o limite de 32 KB",
  });

/**
 * O mod-11 da Receita Federal mora no PERFIL do país
 * (`lib/legal/perfil-do-pais.ts`), porque é ele quem responde pelo documento do
 * titular — aqui fica só o re-export, para não existirem duas implementações da
 * mesma regra. Quem importava deste módulo (rota de importação, testes,
 * `lib/schemas/index.ts`) continua importando.
 */
export { isValidCpf };

export const contactCreateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  display_name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone_number: z
    .string()
    .regex(PHONE_REGEX, "Telefone deve estar em formato E.164 (+5511999998888)")
    .optional(),
  cpf: z.string().refine(isValidCpf, "CPF inválido").optional(),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // O marcador nasce em caixa baixa, pela MESMA regra da tag de conversa: o
  // "VIP" gravado verbatim não casava com o filtro `?tag=vip` (issue #1224).
  tags: z.array(z.string()).transform(normalizarTags).optional(),
  source: z.string().min(1).default("manual"),
  source_metadata: z.record(z.string(), z.unknown()).optional(),
  consent: z.record(z.string(), z.unknown()).optional(),
  custom_fields: customFieldsSchema.optional(),
});
export type ContactCreate = z.infer<typeof contactCreateSchema>;

/**
 * Tipo e WhatsApp de um número (vindo do produto original, Spec 31 B2). Os
 * mesmos vocabulários do banco (`contacts_phone_type_check`,
 * `contacts_phone_whatsapp_check` e os de `contact_phones`, migration 0541):
 * uma palavra a mais aqui seria `23514` na gravação.
 */
export const TIPOS_DE_TELEFONE = ["fixo", "celular", "outro"] as const;
export const WHATSAPP_DO_TELEFONE = ["sim", "nao", "nao_sei"] as const;
export const telefoneTipoSchema = z.enum(TIPOS_DE_TELEFONE);
export const telefoneWhatsappSchema = z.enum(WHATSAPP_DO_TELEFONE);
export type TelefoneTipo = z.infer<typeof telefoneTipoSchema>;
export type TelefoneWhatsapp = z.infer<typeof telefoneWhatsappSchema>;

export const contactPatchSchema = contactCreateSchema.partial().extend({
  source: z.string().min(1).optional(),
  // Tipo e WhatsApp do telefone PRINCIPAL. Ausente = a coluna fica como está.
  phone_type: telefoneTipoSchema.optional(),
  phone_whatsapp: telefoneWhatsappSchema.optional(),
});
export type ContactPatch = z.infer<typeof contactPatchSchema>;

/**
 * O documento do titular vem do PERFIL DO PAÍS da organização (issue #1033).
 *
 * `contactCreateSchema` continua sendo a régua brasileira — é o schema que as
 * telas de cliente usam e o comportamento de quem já instalou. Estas fábricas
 * só trocam o campo do documento: tudo o mais é o MESMO schema, estendido, e
 * não uma segunda cópia — duas listas de campos divergem no dia em que uma
 * ganhar um campo novo.
 *
 * Por que fábrica e não ler o país aqui dentro: o schema é síncrono e puro, e a
 * resposta certa vem do banco (`perfilDaOrganizacao`), resolvida uma vez por
 * requisição na borda. O que NÃO se faz é deixar o corpo da requisição escolher
 * o país — quem decide é a organização, pela coluna dela (mesma doutrina da
 * moeda em `lib/catalogo/moeda-da-org.ts`).
 */
export function contactCreateSchemaDoPais(perfil: PerfilDoPais) {
  return contactCreateSchema.extend({
    cpf: z
      .string()
      .refine(perfil.documento.valida, perfil.documento.mensagemInvalido)
      .optional(),
  });
}

/** O mesmo, para o PATCH (`app/api/v1/contacts/[id]/route.ts`). */
export function contactPatchSchemaDoPais(perfil: PerfilDoPais) {
  return contactPatchSchema.extend({
    cpf: z
      .string()
      .refine(perfil.documento.valida, perfil.documento.mensagemInvalido)
      .optional(),
  });
}

export const CONTACT_ORDER_BY = [
  "last_activity_at",
  "created_at",
  "display_name",
  "email",
  "phone_number",
] as const;

export const contactListQuerySchema = z.object({
  search: z.string().optional(),
  // O filtro normaliza pelo MESMO caminho da escrita: `?tag=VIP` acha o que a
  // ficha gravou como "vip" (issue #1224).
  tag: z.string().transform(normalizarTag).optional(),
  source: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  order_by: z.enum(CONTACT_ORDER_BY).default("last_activity_at"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ContactListQuery = z.output<typeof contactListQuerySchema>;
export type ContactListQueryParams = z.input<typeof contactListQuerySchema>;
export type ContactOrderBy = (typeof CONTACT_ORDER_BY)[number];

export const lgpdAnonymizeSchema = z.object({
  contact_id: z.string().uuid(),
  justification: z.string().min(10).max(1000),
});
export type LgpdAnonymizeInput = z.infer<typeof lgpdAnonymizeSchema>;

/**
 * Juntar contatos duplicados.
 *
 * O principal fica FORA do array de secundários e o `refine` é o que garante
 * isso na borda — `fn_mesclar_contatos` recusa o mesmo caso com `22023`, mas um
 * 422 com a lista de campos é o que a tela consegue mostrar. As duas guardas
 * existem porque a rota não é a única porta: a RPC é alcançável por
 * `authenticated` (é assim que a RLS a autoriza), e ela precisa se defender só.
 *
 * O teto de 20 secundários por chamada não é arbitrário: a fusão trava as
 * linhas (`for update`) e reponta toda FK que aponta para elas: um lote grande
 * segura escrita de contato para a organização inteira enquanto roda.
 */
export const contactsMergeSchema = z
  .object({
    primary_contact_id: z.string().uuid(),
    secondary_contact_ids: z.array(z.string().uuid()).min(1).max(20),
  })
  .refine((v) => !v.secondary_contact_ids.includes(v.primary_contact_id), {
    message: "O contato principal não pode estar entre os que serão absorvidos.",
    path: ["secondary_contact_ids"],
  })
  .refine((v) => new Set(v.secondary_contact_ids).size === v.secondary_contact_ids.length, {
    message: "Contato repetido na seleção.",
    path: ["secondary_contact_ids"],
  });
export type ContactsMergeInput = z.infer<typeof contactsMergeSchema>;

/**
 * Telefone extra da ficha: `POST /api/v1/contacts/{id}/phones`. O número passa
 * pela MESMA leitura do canal (`normalizePhoneBR`, na rota), e não por esta
 * régua de formato: quem recusa o número inválido é a rota, com
 * `invalid_phone` (422), que é o código que a tela mostra.
 */
export const telefoneExtraCreateSchema = z.object({
  phone_number: z.string().trim().min(1).max(40),
  type: telefoneTipoSchema.optional(),
  whatsapp: telefoneWhatsappSchema.optional(),
  label: z.string().trim().max(60).optional(),
});
export type TelefoneExtraCreate = z.infer<typeof telefoneExtraCreateSchema>;

/**
 * `PATCH /api/v1/contacts/{id}/phones/{phoneId}`: pelo menos um campo. O número
 * do extra não muda aqui (para trocar, remove-se e adiciona-se). `label: null`
 * ou `""` apaga o rótulo.
 */
export const telefoneExtraPatchSchema = z
  .object({
    type: telefoneTipoSchema.optional(),
    whatsapp: telefoneWhatsappSchema.optional(),
    label: z.string().trim().max(60).nullable().optional(),
  })
  .refine((valor) => Object.values(valor).some((v) => v !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  });
export type TelefoneExtraPatch = z.infer<typeof telefoneExtraPatchSchema>;

/**
 * A frase que ensina o formato do telefone, por país. O perfil deste fork não
 * traz exemplo de número: fora do Brasil vale o E.164 genérico.
 */
export function mensagemDoTelefone(perfil: PerfilDoPais, idioma: Idioma = "pt-BR"): string {
  if (perfil.codigo !== PAIS_PADRAO) {
    return traduzir("Telefone deve estar em formato E.164 ({exemplo})", idioma).replace(
      "{exemplo}",
      "+15551234567",
    );
  }
  return traduzir(
    "Telefone deve ter DDD + número (ex.: {exemplo}) ou o formato E.164 ({exemploE164})",
    idioma,
  )
    .replace("{exemplo}", "11999998888")
    .replace("{exemploE164}", "+5511999998888");
}

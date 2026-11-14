/**
 * Monta a especificação OpenAPI das rotas mais expostas da API, a partir dos
 * MESMOS esquemas Zod que as rotas usam para validar a entrada — então a
 * especificação não tem como divergir do que a rota aceita.
 *
 * É o mapa que o schemathesis (https://github.com/schemathesis/schemathesis)
 * usa para bombardear a API com entradas válidas, inválidas e estranhas e
 * procurar erro 500 (entrada que a rota não esperava) — sempre contra o app
 * LOCAL do job de segurança, nunca contra um site no ar.
 *
 * Uso: pnpm exec tsx scripts/seguranca/openapi.ts > openapi.json
 *
 * A lista é curada à mão (as rotas que mais recebem dado de fora). Rota nova
 * exposta a cliente ou a integração merece entrar aqui.
 */
import { z } from "zod";

import { variaveisDaEmpresaSchema } from "@/lib/empresa/variaveis";
import { novaMensagemSchema, chaveDaConversaSchema } from "@/lib/equipe/chat";
import { preferenciasDeConversaSchema } from "@/lib/conversas/preferencias";
import { contactCreateSchema, contactListQuerySchema, contactPatchSchema } from "@/lib/schemas/contacts";
import { createLeadSchema, moveLeadSchema, updateLeadSchema } from "@/lib/schemas/leads";
import {
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  patchConversationSchema,
  sendMessageSchema,
} from "@/lib/schemas/messaging";
import { createNoteSchema } from "@/lib/schemas/notes";
import { produtoCreateSchema } from "@/lib/schemas/produtos";
import { propostaCreateSchema } from "@/lib/schemas/propostas";
import { snoozeSchema } from "@/lib/schemas/snooze";
import { createTemplateSchema, updateTemplateSchema } from "@/lib/schemas/templates";
import { inviteMemberSchema } from "@/lib/schemas/team";

type Metodo = "get" | "post" | "patch" | "delete";
type Rota = { caminho: string; metodo: Metodo; corpo?: z.ZodType; consulta?: z.ZodType };

const ROTAS: Rota[] = [
  { caminho: "/api/v1/health", metodo: "get" },
  { caminho: "/api/v1/contacts", metodo: "get", consulta: contactListQuerySchema },
  { caminho: "/api/v1/contacts", metodo: "post", corpo: contactCreateSchema },
  { caminho: "/api/v1/contacts/{id}", metodo: "get" },
  { caminho: "/api/v1/contacts/{id}", metodo: "patch", corpo: contactPatchSchema },
  { caminho: "/api/v1/conversations", metodo: "get", consulta: listConversationsQuerySchema },
  { caminho: "/api/v1/conversations/{id}", metodo: "get" },
  { caminho: "/api/v1/conversations/{id}", metodo: "patch", corpo: patchConversationSchema },
  { caminho: "/api/v1/conversations/{id}/messages", metodo: "get", consulta: listMessagesQuerySchema },
  { caminho: "/api/v1/conversations/{id}/notes", metodo: "post", corpo: createNoteSchema },
  { caminho: "/api/v1/conversations/{id}/snooze", metodo: "post", corpo: snoozeSchema },
  { caminho: "/api/v1/messages", metodo: "post", corpo: sendMessageSchema },
  { caminho: "/api/v1/leads", metodo: "post", corpo: createLeadSchema },
  { caminho: "/api/v1/leads/{id}", metodo: "patch", corpo: updateLeadSchema },
  { caminho: "/api/v1/leads/{id}/move", metodo: "post", corpo: moveLeadSchema },
  { caminho: "/api/v1/message-templates", metodo: "get" },
  { caminho: "/api/v1/message-templates", metodo: "post", corpo: createTemplateSchema },
  { caminho: "/api/v1/message-templates/{id}", metodo: "patch", corpo: updateTemplateSchema },
  { caminho: "/api/v1/products", metodo: "get" },
  { caminho: "/api/v1/products", metodo: "post", corpo: produtoCreateSchema },
  { caminho: "/api/v1/proposals", metodo: "get" },
  { caminho: "/api/v1/proposals", metodo: "post", corpo: propostaCreateSchema },
  { caminho: "/api/v1/team/invite", metodo: "post", corpo: inviteMemberSchema },
  { caminho: "/api/v1/settings/conversas", metodo: "get" },
  { caminho: "/api/v1/settings/conversas", metodo: "patch", corpo: preferenciasDeConversaSchema },
  { caminho: "/api/v1/settings/variaveis", metodo: "get" },
  { caminho: "/api/v1/settings/variaveis", metodo: "patch", corpo: z.object({ variaveis: variaveisDaEmpresaSchema }) },
  { caminho: "/api/v1/equipe/conversas", metodo: "get" },
  { caminho: "/api/v1/equipe/mensagens", metodo: "get", consulta: z.object({ com: chaveDaConversaSchema }) },
  { caminho: "/api/v1/equipe/mensagens", metodo: "post", corpo: novaMensagemSchema },
  { caminho: "/api/v1/equipe/lida", metodo: "post", corpo: z.object({ com: chaveDaConversaSchema }) },
];

/** O JSON Schema que o Zod gera, do lado da ENTRADA (o que a rota aceita). */
function esquema(s: z.ZodType): Record<string, unknown> {
  const j = z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete j.$schema;
  return j;
}

function parametrosDaConsulta(s: z.ZodType) {
  const j = esquema(s) as { properties?: Record<string, unknown>; required?: string[] };
  return Object.entries(j.properties ?? {}).map(([nome, schema]) => ({
    name: nome,
    in: "query",
    required: (j.required ?? []).includes(nome),
    schema,
  }));
}

const paths: Record<string, Record<string, unknown>> = {};
for (const r of ROTAS) {
  const op: Record<string, unknown> = {
    operationId: `${r.metodo}_${r.caminho.replace(/[^a-z0-9]+/gi, "_")}`,
    parameters: [
      ...(r.caminho.includes("{id}")
        ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }]
        : []),
      ...(r.consulta ? parametrosDaConsulta(r.consulta) : []),
    ],
    responses: { default: { description: "Resposta da rota ({ data } ou { error })." } },
  };
  if (r.corpo) op.requestBody = { required: true, content: { "application/json": { schema: esquema(r.corpo) } } };
  (paths[r.caminho] ??= {})[r.metodo] = op;
}

process.stdout.write(
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: { title: "DeskcommCRM — rotas expostas (varredura de segurança)", version: "1" },
      paths,
    },
    null,
    2,
  ),
);

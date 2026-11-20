import { z } from "zod";

export const createCallSchema = z.object({
  // Só o número (DDI+DDD+número, com ou sem "+"): o valor entra na string de
  // discagem do Asterisk, e "@", "/" ou "," ali escolhiam outro endpoint.
  toNumber: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/, "Informe só o número, com DDI e DDD."),
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  mode: z.enum(["ai", "human"]).default("ai"),
});

export const listCallsQuerySchema = z.object({
  direction: z.enum(["outbound", "inbound"]).optional(),
  status: z
    .enum(["ringing", "in_progress", "completed", "no_answer", "busy", "failed", "canceled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

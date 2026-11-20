import { z } from "zod";

/**
 * O anexo da nota interna (migration 0547): o trio que a rota de upload
 * (`POST /conversations/[id]/notes/media`) acabou de devolver. A posse do
 * caminho é conferida na rota da nota (`isMediaPathOwnedBy`).
 */
export const anexoDeNotaSchema = z.object({
  storage_path: z.string().min(1).max(512),
  media_mime: z.string().min(1).max(255),
  media_size_bytes: z.number().int().nonnegative(),
});

export const createNoteSchema = z
  .object({
    body: z.string().trim().max(4096),
    anexo: anexoDeNotaSchema.optional(),
  })
  .superRefine((valor, ctx) => {
    if (valor.anexo) return; // anexo sem legenda é nota válida
    if (valor.body.length === 0) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "Nota sem texto e sem anexo." });
    }
  });

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

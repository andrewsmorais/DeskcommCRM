/**
 * Chat no site — o que as duas rotas de gestão compartilham.
 */
import { z } from "zod";

import { env } from "@/lib/env";
import { configDoChatSchema, lerConfigDoChat } from "@/lib/channels/webchat/config";

export const entradaDoChatSchema = z
  .object({
    nome: z.string().trim().min(1).max(60),
    titulo: configDoChatSchema.shape.titulo.optional(),
    saudacao: configDoChatSchema.shape.saudacao.optional(),
    cor: configDoChatSchema.shape.cor.optional(),
    dominios: configDoChatSchema.shape.dominios.optional(),
    pedir_nome: configDoChatSchema.shape.pedir_nome.optional(),
  })
  .strict();

export const COLUNAS_DO_CHAT = "id, display_name, webchat_key, status, metadata, created_at";

export interface LinhaDoChat {
  id: string;
  display_name: string | null;
  webchat_key: string;
  status: string;
  metadata: unknown;
  created_at: string;
}

/** Endereço público da instalação — é de onde o site do cliente baixa o balão. */
export function enderecoPublico(): string {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

export function paraATela(linha: LinhaDoChat) {
  const base = enderecoPublico();
  return {
    id: linha.id,
    nome: linha.display_name === null ? "Chat do site" : linha.display_name,
    chave: linha.webchat_key,
    ligado: linha.status === "WORKING",
    criado_em: linha.created_at,
    ...lerConfigDoChat(linha.metadata),
    codigo: `<script async src="${base}/webchat/v1.js" data-chave="${linha.webchat_key}"></script>`,
  };
}

/**
 * GET /api/v1/chatbot-flows/[id]/estatisticas — a estatística por bloco do
 * fluxo (migration 0512), como na Umbler: quantas vezes cada bloco foi
 * concluído e quantas saíram por cada saída, nos últimos `dias` (7, 30 ou 90).
 *
 * `?formato=csv` devolve o mesmo em planilha (bloco, saída, conclusões, %).
 * Leitura com o client da sessão: a RLS só mostra a própria organização.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { resumirEstatistica, type LinhaDeEstatistica } from "@/lib/chatbot/estatistica";
import { grafoSchema, metaDoPasso, saidasDoPasso, ehTipoDePasso } from "@/lib/chatbot/passos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DIAS = new Set([7, 30, 90]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("agent");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const dias = DIAS.has(Number(url.searchParams.get("dias"))) ? Number(url.searchParams.get("dias")) : 30;
  const formato = url.searchParams.get("formato") === "csv" ? "csv" : "json";

  const db = await createClient();
  const { data: fluxo } = await db
    .from("chatbot_flows")
    .select("id, name, grafo")
    .eq("id", id)
    .eq("organization_id", auth.org.orgId)
    .maybeSingle();
  if (!fluxo) return fail("not_found", "Chatbot não encontrado.", 404, { requestId });

  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("chatbot_estatisticas")
    .select("node_id, saida, contagem")
    .eq("organization_id", auth.org.orgId)
    .eq("flow_id", id)
    .gte("dia", desde)
    .limit(20000);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const blocos = resumirEstatistica((data ?? []) as LinhaDeEstatistica[]);
  if (formato === "json") return ok({ dias, blocos }, { requestId });

  // CSV: com o nome do bloco e o rótulo da saída que a tela mostra.
  const g = grafoSchema.safeParse((fluxo as { grafo?: unknown }).grafo);
  const nos = new Map((g.success ? g.data.nodes : []).map((n) => [n.id, n]));
  const campo = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const linhas = [["Bloco", "Tipo", "Saída", "Conclusões", "% do bloco"].map(campo).join(";")];
  for (const b of blocos) {
    const no = nos.get(b.node_id);
    const tipo = no && ehTipoDePasso(no.type) ? no.type : null;
    const nomeDoTipo = tipo ? (metaDoPasso(tipo)?.nome ?? tipo) : "Bloco apagado";
    const rotulos = new Map(tipo ? saidasDoPasso(tipo, no?.data ?? {}).map((s) => [s.id, s.rotulo]) : []);
    for (const s of b.saidas)
      linhas.push(
        [b.node_id, nomeDoTipo, s.saida === "fim" ? "Fim do fluxo" : rotulos.get(s.saida) || s.saida, s.contagem, s.porcentagem]
          .map(campo)
          .join(";"),
      );
  }
  const nome = String((fluxo as { name?: string }).name ?? "chatbot").replace(/[^\w-]+/g, "_").slice(0, 60);
  return new Response(`﻿${linhas.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="estatistica-${nome}-${dias}dias.csv"`,
      "x-request-id": requestId,
    },
  });
}

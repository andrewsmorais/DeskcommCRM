/**
 * GET /api/v1/exportacao/<token> — baixa o ZIP de dados de uma organização.
 *
 * É PÚBLICA para o `proxy` (ver `lib/auth/public-paths.ts`) e autenticada pela
 * assinatura do link: o e-mail de aviso chega a quem já não tem sessão, e é
 * justamente aí que o arquivo é necessário. "Público" quer dizer "o proxy não
 * decide", nunca "sem autenticação".
 *
 * A organização vem do link, nunca de query ou corpo. Link inválido, expirado ou
 * adulterado devolve o mesmo 404 — não se diz qual dos três foi.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { segredoDaExportacao } from "@/lib/exportacao/link";
import { verificarLink } from "@/lib/exportacao/token";
import { criarZipDaConta } from "@/lib/exportacao/zip";
import { clientIp } from "@/lib/plataformas-de-anuncio/pagina-de-captura";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function nomeSeguro(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return base || "conta";
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  const ip = clientIp(req);
  if (ip && !(await checkRateLimit(`exportacao:${ip}`, 10, 60)).allowed) {
    return fail("rate_limited", "Too many requests.", 429, { requestId });
  }

  const link = verificarLink((await ctx.params).token, segredoDaExportacao());
  if (!link) return fail("not_found", "Not found.", 404, { requestId });

  const db = createAdminClient();
  const { data: org, error } = await db
    .from("organizations")
    .select("display_name")
    .eq("id", link.orgId)
    .maybeSingle();
  if (error || !org) return fail("not_found", "Not found.", 404, { requestId });

  const nome = String(org.display_name ?? "").trim() || "Conta";
  const agora = new Date();

  await audit({
    action: "org.exportacao_baixada",
    organizationId: link.orgId,
    resourceType: "organization",
    resourceId: link.orgId,
    requestId,
    ip,
    userAgent: req.headers.get("user-agent"),
    bypassedRls: true,
  });

  const arquivo = `dados-${nomeSeguro(nome)}-${agora.toISOString().slice(0, 10)}.zip`;
  return new Response(
    criarZipDaConta(db as unknown as import("@supabase/supabase-js").SupabaseClient, link.orgId, nome, agora),
    {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${arquivo}"`,
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    },
  );
}

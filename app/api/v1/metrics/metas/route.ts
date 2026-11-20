/**
 * GET /api/v1/metrics/metas — a meta do mês e o progresso contra ela
 *
 * ─── A pergunta que a tela não sabia responder ──────────────────────────────
 * O Desempenho mostrava só o realizado. "Estamos em quantos por cento da meta?"
 * não tinha resposta porque não havia DENOMINADOR: o alvo vivia na cabeça de
 * quem cobra o time. Esta rota lê o alvo cadastrado (`crm_metas`, migration
 * 0549) e conta o realizado na MESMA janela — nunca em janelas diferentes, que
 * fechariam a conta errado na virada do mês.
 *
 * ─── O realizado é "negócio GANHO fechado dentro da janela" ─────────────────
 * `status = 'won'` e `closed_at` em `[from, to)` — o par que a tela chama de
 * venda. Não é `created_at` (o negócio pode ter nascido em julho e fechado em
 * setembro; a venda é de setembro) e não é `value_cents` (somar VALOR é a fatia
 * 2, declarada fora). A leitura é com o client de sessão, então a RLS escopa a
 * organização por si.
 *
 * ─── Contagem por `count` exato, não por linhas ─────────────────────────────
 * `.select("id", { count: "exact", head: true })`: o PostgREST conta no banco e
 * devolve só o número. Trazer as linhas para contar daria 1000 no teto do
 * `max_rows` (`supabase/config.toml`) e um mês com 1.200 vendas apareceria como
 * 1.000 — o truncamento silencioso que a rota de funil documenta em `lerPaginado`.
 *
 * ─── Sem meta NÃO é zero ────────────────────────────────────────────────────
 * Sem linha em `crm_metas`, a resposta sai com `metas: []`, `motivo:
 * "sem_meta"` e uma `explicacao`. Zero significaria "realizou nada", que é uma
 * afirmação FALSA — a empresa pode ter vendido 30 e simplesmente não ter alvo.
 * A explicação sai no idioma de quem pediu (o `t` de sempre), porque quem a
 * escreveu foi o servidor.

 * A org vem do cookie validado (`requireRole`), NUNCA do query. Read-only ⇒ sem audit.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** O único indicador: quantidade de vendas ganhas. */
const INDICADOR = "vendas_ganhas";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

interface MetaCrua {
  id: string;
  periodo: string;
  indicador: string;
  pipeline_id: string | null;
  alvo: number | string;
}

/**
 * O 1º dia do mês da janela pedida, como `YYYY-MM-01`. Sai do TEXTO da ISO (que
 * carrega o fuso de quem pediu), não do instante em UTC.
 */
function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // Piso agent: o atendente vê a meta da empresa. A escrita é que exige manager.
  const authz = await requireRole("agent", {
    requestId,
    resource: "metrics",
    plano: "relatorios_completos",
  });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", t("Query inválida."), 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
  const from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  if (from.getTime() >= to.getTime()) {
    return fail("validation_failed", t("Janela inválida: 'from' deve ser anterior a 'to'."), 422, {
      requestId,
    });
  }
  const de = from.toISOString();
  const ate = to.toISOString();
  const periodo = parsed.data.from ? primeiroDiaDoMes(parsed.data.from) : `${de.slice(0, 7)}-01`;

  // Client de sessão: a RLS escopa a organização (e o recorte do atendente).
  const supabase = await createClient();
  const orgId = authz.org.orgId;

  const { data: metasCruas, error: erroMetas } = await supabase
    .from("crm_metas")
    .select("id, periodo, indicador, pipeline_id, alvo")
    .eq("organization_id", orgId)
    .eq("periodo", periodo)
    .eq("indicador", INDICADOR);
  if (erroMetas) {
    return fail("internal_error", `crm_metas: ${erroMetas.message}`, 500, { requestId });
  }
  const metas = (metasCruas ?? []) as MetaCrua[];

  let nomesDeFunil = new Map<string, string>();
  if (metas.some((m) => m.pipeline_id)) {
    const { data: funis, error } = await supabase
      .from("crm_pipelines")
      .select("id, name")
      .eq("organization_id", orgId);
    if (error) return fail("internal_error", `crm_pipelines: ${error.message}`, 500, { requestId });
    nomesDeFunil = new Map(
      ((funis ?? []) as Array<{ id: string; name: string }>).map((f) => [f.id, f.name]),
    );
  }

  const saida: Array<Record<string, unknown>> = [];
  for (const meta of metas) {
    const alvo = Number(meta.alvo);
    // Impossível pelo schema (`alvo > 0`): se chegar, é falha de dados, não 0%.
    if (!Number.isInteger(alvo) || alvo <= 0) {
      return fail(
        "internal_error",
        `crm_metas: alvo inválido (${String(meta.alvo)}) na meta ${meta.id}`,
        500,
        { requestId },
      );
    }

    let consulta = supabase
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "won")
      .gte("closed_at", de)
      .lt("closed_at", ate);
    if (meta.pipeline_id) consulta = consulta.eq("pipeline_id", meta.pipeline_id);

    const { count, error } = await consulta;
    if (error) return fail("internal_error", `crm_leads: ${error.message}`, 500, { requestId });
    const realizado = count ?? 0;

    saida.push({
      id: meta.id,
      escopo: meta.pipeline_id ? "funil" : "empresa",
      pipeline_id: meta.pipeline_id,
      pipeline_nome: meta.pipeline_id ? (nomesDeFunil.get(meta.pipeline_id) ?? null) : null,
      alvo,
      realizado,
      percentual: Math.round((realizado / alvo) * 100),
      // Passar da meta não vira dívida: "quanto falta" nunca é negativo.
      falta: Math.max(0, alvo - realizado),
      atingida: realizado >= alvo,
    });
  }

  const semMeta = saida.length === 0;
  return ok(
    {
      window: { from: de, to: ate },
      periodo,
      indicador: INDICADOR,
      metas: saida,
      motivo: semMeta ? "sem_meta" : null,
      explicacao: semMeta
        ? t(
            "A empresa ainda não definiu a meta deste mês. Quem é gerente ou administra pode cadastrá-la aqui mesmo, em Desempenho — a partir daí esta tela mostra o quanto já foi feito e o quanto falta.",
          )
        : null,
    },
    { requestId },
  );
}

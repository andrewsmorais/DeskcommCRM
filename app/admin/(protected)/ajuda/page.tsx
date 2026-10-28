import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { LIMITE_DE_MENSAGENS_POR_DIA, RETENCAO_DA_AJUDA_DIAS } from "@/lib/ajuda/registro";
import { loadAuthUser } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Perguntas da ajuda" };
export const dynamic = "force-dynamic";

/**
 * O que os clientes perguntam ao assistente do botão Ajuda — o laço de volta do
 * chat: pergunta que se repete é tela que confunde ou manual que falta.
 *
 * Lê `ajuda_mensagens` (migration 0494) de TODAS as organizações, por isso
 * mora em `/admin` e só abre para quem administra a instalação.
 */
type Linha = {
  id: string;
  organization_id: string;
  pergunta: string;
  resposta: string | null;
  escalou: boolean;
  tela: string | null;
  tokens_entrada: number | null;
  tokens_cache: number | null;
  tokens_saida: number | null;
  created_at: string;
};

async function lerPerguntas() {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("ajuda_mensagens")
    .select(
      "id, organization_id, pergunta, resposta, escalou, tela, tokens_entrada, tokens_cache, tokens_saida, created_at",
    )
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(200);
  const linhas = (data ?? []) as Linha[];

  const ids = [...new Set(linhas.map((l) => l.organization_id))];
  const { data: orgs } = ids.length
    ? await admin.from("organizations").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nome = new Map((orgs ?? []).map((o) => [o.id as string, (o.display_name as string) ?? ""]));
  return { linhas, nome };
}

export default async function Page() {
  const usuario = await loadAuthUser();
  if (!usuario?.is_platform_admin) notFound();
  const t = (s: string) => traduzir(s, usuario.idioma);

  const { linhas, nome } = await lerPerguntas();

  const escalaram = linhas.filter((l) => l.escalou).length;
  const tokens = linhas.reduce(
    (acc, l) => ({
      entrada: acc.entrada + (l.tokens_entrada ?? 0),
      cache: acc.cache + (l.tokens_cache ?? 0),
      saida: acc.saida + (l.tokens_saida ?? 0),
    }),
    { entrada: 0, cache: 0, saida: 0 },
  );
  const n = new Intl.NumberFormat("pt-BR");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Perguntas da ajuda")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("O que os clientes perguntaram ao assistente do botão Ajuda nos últimos 7 dias.")}{" "}
          {t("Cada empresa pode mandar")} {LIMITE_DE_MENSAGENS_POR_DIA}{" "}
          {t("mensagens a cada 24 horas; as perguntas são apagadas depois de")}{" "}
          {RETENCAO_DA_AJUDA_DIAS} {t("dias.")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("Perguntas")}</p>
          <p className="text-2xl font-semibold" data-testid="ajuda-total">
            {n.format(linhas.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("Pediram uma pessoa")}</p>
          <p className="text-2xl font-semibold">{n.format(escalaram)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("Tokens (entrada / cache / saída)")}</p>
          <p className="text-sm font-semibold">
            {n.format(tokens.entrada)} / {n.format(tokens.cache)} / {n.format(tokens.saida)}
          </p>
        </Card>
      </div>

      {linhas.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t("Nenhuma pergunta nos últimos 7 dias.")}
        </Card>
      ) : (
        <div className="space-y-3">
          {linhas.map((l) => (
            <Card key={l.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {nome.get(l.organization_id) || l.organization_id}
                </span>
                <span>
                  {new Date(l.created_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </span>
                {l.tela ? <span>{l.tela}</span> : null}
                {l.escalou ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                    {t("pediu uma pessoa")}
                  </span>
                ) : null}
              </div>
              <p className="font-medium whitespace-pre-wrap">{l.pergunta}</p>
              {l.resposta ? (
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t("Ver resposta")}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{l.resposta}</p>
                </details>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

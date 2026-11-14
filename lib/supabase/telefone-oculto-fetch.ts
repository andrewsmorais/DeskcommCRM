/**
 * O `fetch` do cliente do Supabase do servidor, com o TELEFONE OCULTO aplicado
 * (migration 0517): para quem o gerente marcou, todo número que o PostgREST
 * devolve sai mascarado antes de chegar à rota ou à tela.
 *
 * É aqui, e não em cada uma das ~190 leituras de `phone_number`, porque é o
 * único ponto por onde TODA leitura feita como o usuário passa. Leitura com a
 * service role (`createAdminClient`) não passa por aqui — é do servidor, não
 * de uma pessoa.
 *
 * Custo: só a resposta JSON que tem campo de telefone é olhada, e a pergunta
 * "esta pessoa vê telefone?" é feita UMA vez por cliente. Banco sem a 0517 (a
 * função não existe) responde "vê" — a coluna também não existe, então não há
 * ninguém marcado.
 */
import { mascararTelefonesEm, talvezTenhaTelefone } from "@/lib/contatos/telefone-oculto";

type Fetch = typeof fetch;

function urlDe(input: Parameters<Fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function fetchComTelefoneOculto(base: Fetch, orgAtiva: string | null): Fetch {
  let decisao: Promise<boolean> | null = null;

  const perguntar = async (url: string, init?: RequestInit): Promise<boolean> => {
    try {
      const raiz = url.slice(0, url.indexOf("/rest/v1/"));
      const headers = new Headers(init?.headers);
      headers.set("content-type", "application/json");
      headers.delete("prefer");
      const r = await base(`${raiz}/rest/v1/rpc/fn_eu_oculto_telefone`, {
        method: "POST",
        headers,
        body: JSON.stringify({ p_org: orgAtiva }),
      });
      if (!r.ok) return false;
      return (await r.json()) === true;
    } catch {
      return false;
    }
  };

  return async (input, init) => {
    const res = await base(input, init);
    const url = urlDe(input);
    if (!url.includes("/rest/v1/") || url.includes("/rpc/fn_eu_oculto_telefone")) return res;
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return res;
    const texto = await res.clone().text();
    if (!talvezTenhaTelefone(texto)) return res;
    decisao ??= perguntar(url, init);
    if (!(await decisao)) return res;
    let corpo: string;
    try {
      corpo = JSON.stringify(mascararTelefonesEm(JSON.parse(texto)));
    } catch {
      return res;
    }
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(corpo, { status: res.status, statusText: res.statusText, headers });
  };
}

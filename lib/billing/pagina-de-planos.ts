/**
 * Onde o cliente escolhe e paga o plano: a página de vendas (repositório
 * separado), que tem o checkout do Asaas. `PAGINA_DE_PLANOS_URL` aponta para
 * ela; o padrão é a seção de preços do chataionline.io.
 *
 * O `org_id` vai junto para a página reconhecer que a conta já existe e só
 * falta o plano (`Pricing.tsx` lê `?org_id=`), em vez de oferecer um cadastro
 * novo que terminaria em "e-mail já cadastrado". A página continua exigindo a
 * sessão do próprio usuário: o id na URL não concede nada.
 */
const PADRAO = "https://chataionline.io/#precos";

export function enderecoDosPlanos(
  orgId?: string | null,
  ambiente: Record<string, string | undefined> = process.env,
): string {
  const base = (ambiente.PAGINA_DE_PLANOS_URL ?? "").trim() || PADRAO;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    url = new URL(PADRAO);
  }
  if (orgId) url.searchParams.set("org_id", orgId);
  return url.toString();
}

/**
 * A CHAVE QUE ASSINA o que o servidor entrega para voltar depois — link de
 * exportação, `state` de OAuth, cookie de vínculo do OAuth.
 *
 * ─── Por que a raiz NÃO é `INTERNAL_SECRET`, `INTERNAL_CRON_SECRET` nem `CRON_SECRET` ──
 *
 * As três são BEARER: `lib/auth/cron-auth.ts` e o tick do relógio aceitam
 * qualquer uma delas como `Authorization: Bearer …`, e o produto manda o
 * operador colá-las FORA da instalação — no cron-job.org, num segredo do GitHub
 * Actions (`docs/runbooks/relogio-http.md`), no Vercel Cron, que injeta
 * `CRON_SECRET` e o `lib/env.ts` copia para `INTERNAL_CRON_SECRET`. Uma
 * credencial distribuída para DISPARAR rotinas idempotentes era, ao mesmo tempo,
 * a chave que fabricava:
 *
 *   - o link `/api/v1/exportacao/<token>` de QUALQUER organização (os ids não
 *     são segredo), e com ele o ZIP inteiro dela — contatos, conversas, funil;
 *   - o `state` do OAuth de qualquer organização, com o qual o callback gravava
 *     a loja ou a conta de quem atacava no lugar da integração da vítima.
 *
 * Quem tem o agendador não deveria ter nada disso. Separar as chaves é o que
 * faz a credencial do agendador valer só o que ela foi entregue para valer.
 *
 * ─── Por que `SUPABASE_SERVICE_ROLE_KEY`, e por que isso não dá poder a ninguém ──
 *
 * Ela é obrigatória em toda instalação (`lib/env.ts`), já está no `.env` do
 * app e do worker, e NUNCA é entregue a agendador nenhum. E quem a tem já lê o
 * banco inteiro, ignorando RLS: derivar dela não cria autoridade nova para
 * ninguém — o portador já podia baixar qualquer exportação direto do banco.
 *
 * É também o que faz este conserto não pedir nada ao operador: a doutrina de
 * packaging proíbe bump de versão que exija editar o `.env` à mão, e uma chave
 * NOVA obrigatória exigiria. `LINK_SIGNING_SECRET` existe para quem quiser
 * separar ainda mais (ou girar só estas assinaturas sem girar o banco); é
 * opcional e, ausente ou curta, a raiz é a service role.
 *
 * ─── Por que DERIVADA por rótulo ──────────────────────────────────────────────
 *
 * Cada uso assina com a sua própria chave, `HMAC(raiz, "crm:assinatura:<rótulo>")`.
 * Um link de exportação não pode servir de `state`, nem o `state` de um provedor
 * servir de cookie de vínculo de outro: com a mesma chave em tudo, o formato
 * de um artefato que por acaso coincidisse com o de outro viraria uma porta
 * entre eles. Os rótulos em uso moram em `ROTULOS_DE_ASSINATURA`, num lugar só,
 * para colisão ser visível na leitura e reprovada em teste. O prefixo não cita
 * a marca: `tests/unit/branding.test.ts` reprova marca nova em `lib/`, e um
 * separador de domínio não precisa de nome de produto para separar.
 *
 * ─── O que acontece quando a raiz muda ───────────────────────────────────────
 *
 * Girar a service role (ou definir/girar `LINK_SIGNING_SECRET`) mata os links
 * de exportação em circulação e os fluxos de OAuth abertos (dez minutos). É o
 * comportamento certo: o botão gera outro link, a conexão se refaz com um
 * clique. O mesmo vale para a atualização que trouxe este arquivo.
 */
import { createHmac } from "node:crypto";

/** Abaixo disto a raiz é adivinhável — melhor não assinar que fingir. */
const TAMANHO_MINIMO_DA_RAIZ = 32;

/**
 * Todo rótulo em uso, num lugar só. Rótulo novo entra aqui — e
 * `tests/unit/chave-de-assinatura.test.ts` reprova dois usos com o mesmo valor.
 */
export const ROTULOS_DE_ASSINATURA = {
  exportacao: "exportacao-da-conta",
  estadoDaAgenda: "agenda-google:estado",
  vinculoDaAgenda: "agenda-google:vinculo",
  estadoDaLoja: "nuvemshop:estado",
  vinculoDaLoja: "nuvemshop:vinculo",
  estadoDeAnuncios: "google-ads:estado",
  vinculoDeAnuncios: "google-ads:vinculo",
} as const;

function raiz(): string {
  const dedicada = process.env.LINK_SIGNING_SECRET?.trim() ?? "";
  if (dedicada.length >= TAMANHO_MINIMO_DA_RAIZ) return dedicada;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (servico.length >= TAMANHO_MINIMO_DA_RAIZ) return servico;
  return "";
}

/**
 * A chave (hex) com que o uso `rotulo` assina. `""` quando não há raiz
 * utilizável — e cada chamador já recusa chave vazia ou curta (link não sai,
 * `state` não é emitido), nunca assina com um padrão inventado.
 */
export function chaveDeAssinatura(rotulo: string): string {
  const r = raiz();
  if (!r || !rotulo) return "";
  return createHmac("sha256", r).update(`crm:assinatura:${rotulo}`, "utf8").digest("hex");
}

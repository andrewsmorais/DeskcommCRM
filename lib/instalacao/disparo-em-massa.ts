/**
 * DISPARO EM MASSA — campanhas e prospecção fria — é módulo opcional da
 * instalação, desligado por padrão (`lib/instalacao/modulos.ts`).
 *
 * ─── Por que desligado ──────────────────────────────────────────────────────
 *
 * Decisão do dono do ChatAI Online (22/10/2026): o WhatsApp dos clientes entra
 * por QR code (WAHA), e o que derruba número conectado assim é mandar mensagem
 * para quem não pediu — lista de campanha e esteira fria de prospecção. O
 * produto vende atendimento: responder quem chamou. Follow-up continua, porque
 * fala com quem já conversou com a empresa.
 *
 * ─── O que o desligado faz ──────────────────────────────────────────────────
 *
 * - Telas `/app/campaigns` e `/app/prospecting`: `notFound()` no layout.
 * - Rotas `/api/v1/campaigns`, `/campaign-templates`, `/campaign-suppressions`
 *   e `/prospecting`: 404, a mesma resposta de rota que não existe (o padrão
 *   de `lib/crm-b2b/route-helpers.ts`). Bloquear só o menu deixaria a rota
 *   alcançável para quem digitar o caminho ou chamar a API.
 * - Crons `campaign-worker` e `prospecting`: não enviam nada. Uma campanha que
 *   estava rodando quando o módulo foi desligado PARA — falha fechada.
 * - Itens do menu somem (`lib/navigation/catalogo.ts`, campo `modulo`).
 *
 * Nada é apagado: as linhas de campanha, destinatário e supressão ficam no
 * banco, e religar em `/admin/sistema` devolve tudo como estava.
 */
import { fail } from "@/lib/api/wrappers";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

/** O disparo em massa está ligado nesta instalação? Falha fechada. */
export async function disparoEmMassaLigado(): Promise<boolean> {
  return moduloLigado(createAdminClient(), "disparo_em_massa");
}

/**
 * Primeira linha de toda rota de campanha e de prospecção: com o módulo
 * desligado devolve 404; ligado, `null` e a rota segue.
 */
export async function seDisparoEmMassaDesligado(requestId: string): Promise<Response | null> {
  if (await disparoEmMassaLigado()) return null;
  return fail("not_found", "Not found.", 404, { requestId });
}

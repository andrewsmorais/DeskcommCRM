import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "@/lib/api/wrappers";
import { roleAtLeast } from "@/lib/auth/types";

/**
 * Ficha marcada "pessoal" ou "sempre atendimento humano": tirar o número dela
 * ou apagá-la é coisa de gerente.
 *
 * Auditoria de 18/11, achado 11. As duas marcas moram na FICHA. Quando um
 * atendente tira o telefone da ficha marcada (ou a apaga), o cliente volta a
 * escrever, nasce uma ficha nova SEM marca e a trava da IA deixa de valer — o
 * veto que só gerente podia pôr foi desfeito por quem não podia tirá-lo.
 *
 * Roda ANTES de qualquer efeito: apagar a ficha leva o histórico junto e não
 * tem volta. Quem não consegue ler a ficha (RLS) cai no 404 normal da rota; aqui
 * só interessa o caso "existe e está marcada".
 *
 * Devolve a resposta 403 pronta, ou `null` quando pode seguir.
 */
export async function recusaSeFichaMarcada(args: {
  supabase: SupabaseClient;
  organizationId: string;
  contactId: string;
  papel: string | null | undefined;
  requestId: string;
}): Promise<Response | null> {
  if (roleAtLeast(args.papel, "manager")) return null;
  const { data, error } = await args.supabase
    .from("contacts")
    .select("is_personal, ai_opt_out")
    .eq("organization_id", args.organizationId)
    .eq("id", args.contactId)
    .maybeSingle();
  if (error) {
    // Falha de leitura não autoriza seguir: o efeito seguinte não tem volta.
    return fail("internal_error", "Não foi possível conferir a ficha.", 500, {
      requestId: args.requestId,
    });
  }
  const ficha = data as { is_personal?: boolean | null; ai_opt_out?: boolean | null } | null;
  if (ficha?.is_personal || ficha?.ai_opt_out) {
    return fail(
      "forbidden_role",
      "Esta ficha está marcada como pessoal ou sempre atendimento humano; só um gerente pode tirar o número dela ou apagá-la.",
      403,
      { requestId: args.requestId },
    );
  }
  return null;
}

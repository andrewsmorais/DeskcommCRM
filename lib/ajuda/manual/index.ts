/**
 * O manual inteiro, por `href`. Cada grupo do menu mora no seu arquivo.
 * Cobertura vigiada por `tests/unit/ajuda-manual-cobre-todas-as-telas.test.ts`.
 */
import type { ManualDoGrupo } from "@/lib/ajuda/manual/tipos";
import { MANUAL_CRM } from "@/lib/ajuda/manual/crm";
import { MANUAL_IA } from "@/lib/ajuda/manual/ia";
import { MANUAL_ATENDIMENTO } from "@/lib/ajuda/manual/atendimento";
import { MANUAL_CANAIS } from "@/lib/ajuda/manual/canais";
import { MANUAL_ANALISE } from "@/lib/ajuda/manual/analise";
import { MANUAL_ORGANIZACAO } from "@/lib/ajuda/manual/organizacao";

export { GUIAS } from "@/lib/ajuda/manual/guias";

export const MANUAL: ManualDoGrupo = {
  ...MANUAL_CRM,
  ...MANUAL_IA,
  ...MANUAL_ATENDIMENTO,
  ...MANUAL_CANAIS,
  ...MANUAL_ANALISE,
  ...MANUAL_ORGANIZACAO,
};

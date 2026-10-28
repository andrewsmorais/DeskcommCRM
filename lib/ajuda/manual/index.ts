/**
 * O manual inteiro, por `href`. Cada grupo do menu mora no seu arquivo.
 * Cobertura vigiada por `tests/unit/ajuda-manual-cobre-todas-as-telas.test.ts`.
 */
import type { ManualDoGrupo } from "@/lib/ajuda/manual/tipos";
import { MANUAL_CRM } from "@/lib/ajuda/manual/crm";

export { GUIAS } from "@/lib/ajuda/manual/guias";

export const MANUAL: ManualDoGrupo = {
  ...MANUAL_CRM,
};

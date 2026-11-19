/**
 * A recusa do BANCO quando uma escrita passa do limite do plano (migration
 * 0563, gatilho `fn_cota_do_plano_na_escrita`). A rota normalmente conta antes;
 * isto traduz a recusa do banco — corrida, ou caminho que não contava — no
 * mesmo 403 de limite que a tela já sabe mostrar, em vez de um erro 500.
 */
import { fail } from "@/lib/api/wrappers";

const ROTULO: Record<string, string> = {
  chatbots: "chatbots ligados",
  pipelines: "funis",
  agentes_ia: "agentes de IA",
  usuarios: "pessoas na equipe",
  whatsapp: "números de WhatsApp",
};

/** O limite que o banco recusou, ou `null` se o erro é outro. */
export function limiteRecusadoPeloBanco(erro: unknown): string | null {
  const msg =
    erro && typeof erro === "object" && "message" in erro ? String((erro as { message: unknown }).message) : "";
  const m = /plano_limite_atingido:([a-z_]+)/.exec(msg);
  return m ? m[1]! : null;
}

export function respostaDoLimiteDoBanco(erro: unknown, requestId: string): Response | null {
  const limite = limiteRecusadoPeloBanco(erro);
  if (!limite) return null;
  return fail(
    "billing_limit",
    `Seu plano não permite mais ${ROTULO[limite] ?? "itens deste tipo"}. Mude de plano em Configurações › Plano e cobrança.`,
    403,
    { requestId },
  );
}

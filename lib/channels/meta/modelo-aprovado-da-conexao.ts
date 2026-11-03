/**
 * Um modelo aprovado do canal (`meta_templates.id`), pronto para sair NESTA
 * conexão — a regra que o passo de follow-up e o passo "Enviar template" do
 * chatbot seguem. Morava em `lib/agent-engine/agent/followup-turn.ts`; saiu
 * para cá quando o chatbot passou a precisar dela, porque duas cópias da mesma
 * régua divergem no primeiro conserto.
 *
 * `null` = o id não é de modelo do canal nesta organização.
 *
 * O id aponta uma linha, mas quem vale é a definição da conexão da conversa
 * (`definicaoNaConexao`, a mesma regra do `send_template` do agente): dois números
 * podem espelhar o mesmo nome, e disparar a linha de outra conta é recusa certa.
 * Número do WhatsApp por QR Code (WAHA) não tem modelo nenhum: a resposta é
 * `recusado`, com o motivo.
 *
 * O fluxo não tem de onde tirar valor para variável, então modelo com `{{1}}` é
 * recusado com o motivo — mandar o marcador cru ao cliente seria pior.
 */
import type pg from "pg";

import { definicaoNaConexao } from "@/lib/channels/linha-do-espelho";
import { renderTemplateBody } from "@/lib/channels/meta/render-template";
import { isStatusSendable } from "@/lib/channels/meta/template-binding";
import { deriveTemplateContract } from "@/lib/channels/meta/template-contract";

export type ModeloDaConexao =
  | {
      tipo: "modelo_aprovado";
      body: string;
      modelo: { name: string; language: string; values: Record<string, string> };
    }
  | { tipo: "recusado"; motivo: string };

export async function resolverModeloAprovadoNaConexao(
  pool: pg.Pool,
  organizationId: string,
  channelSessionId: string,
  metaTemplateId: string,
): Promise<ModeloDaConexao | null> {
  const { rows } = await pool.query<{ name: string; language: string }>(
    `select name, language from meta_templates where organization_id = $1 and id = $2 limit 1`,
    [organizationId, metaTemplateId],
  );
  const alvo = rows[0];
  if (alvo === undefined) return null;
  const linha = await definicaoNaConexao<{
    components: unknown;
    parameter_format: string;
    status: string;
  }>(pool, ["components", "parameter_format", "status"], {
    organizationId,
    name: alvo.name,
    language: alvo.language,
    channelSessionId,
  });
  if (linha === null) {
    return {
      tipo: "recusado",
      motivo: `O modelo "${alvo.name}" não existe no número desta conversa.`,
    };
  }
  if (!isStatusSendable(linha.status)) {
    return {
      tipo: "recusado",
      motivo: `O modelo "${alvo.name}" está ${linha.status} na plataforma — só modelo aprovado pode ser enviado.`,
    };
  }
  const meta = {
    name: alvo.name,
    language: alvo.language,
    parameterFormat: linha.parameter_format,
  };
  const contrato = deriveTemplateContract({
    name: alvo.name,
    language: alvo.language,
    parameter_format: linha.parameter_format,
    components: linha.components as never,
  });
  if (contrato.slots.length > 0) {
    return {
      tipo: "recusado",
      motivo: `O modelo "${alvo.name}" tem variáveis, e o fluxo não tem de onde tirar os valores. Use um modelo sem variáveis.`,
    };
  }
  return {
    tipo: "modelo_aprovado",
    body: renderTemplateBody(linha.components, {}, meta),
    modelo: { name: alvo.name, language: alvo.language, values: {} },
  };
}

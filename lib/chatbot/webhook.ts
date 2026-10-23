/**
 * A chamada do passo "WebHook" do chatbot — o único ponto do chatbot que fala
 * com a rede de fora. O motor (motor.ts) para no passo com `pendente`; o
 * executor chama `chamarWebhookDoChatbot` e devolve a resposta ao motor.
 *
 * Guardas, as mesmas das automações (lib/automation/actions/call-webhook.ts):
 *   - anti-SSRF em duas camadas: o texto da URL (`assertSafeOutboundUrl`:
 *     esquema, https em produção, IP literal, faixa privada) e o IP resolvido
 *     (`assertDestinoResolvidoSeguro`), para um nome que aponta para dentro da
 *     VPS não virar porta de entrada;
 *   - redirect nunca seguido (`redirect: "manual"`): o destino aprovado é o
 *     que foi validado, não o que ele mandar seguir;
 *   - UMA tentativa, com teto de 8 s: o contato está esperando no WhatsApp, e
 *     repetir só atrasaria a resposta; a falha segue pela saída "Falhou";
 *   - resposta lida até 64 KB.
 *
 * O corpo enviado é uma PROJEÇÃO fixa (nunca a linha do banco): ids, nome,
 * telefone e e-mail do contato, a última mensagem e as respostas guardadas
 * no fluxo. Com segredo, sai a assinatura no mesmo formato das automações
 * (`X-Webhook-Signature: t=<ts>,v1=<hmac>`), documentado em
 * docs/integracao/webhooks-de-saida.md.
 */
import { createHmac, randomUUID } from "node:crypto";

import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import type { ConfigDe } from "./passos";
import type { RespostaDoWebhook } from "./motor";

export const TEMPO_DO_WEBHOOK_MS = 8_000;
export const TETO_DA_RESPOSTA = 64 * 1024;

export type EnvioDoWebhook = {
  fluxoId: string;
  passoId: string;
  conversationId: string;
  contato: { id: string; nome: string | null; telefone: string | null; email: string | null };
  mensagem: string | null;
  respostas: Record<string, string>;
};

/** `{{variavel}}` na URL, codificada (a resposta do contato nunca muda a estrutura da URL). */
export function urlComVariaveis(url: string, dados: Record<string, string>): string {
  return url.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g, (_, nome: string) =>
    encodeURIComponent(dados[nome] ?? ""),
  );
}

export function corpoDoWebhook(envio: EnvioDoWebhook, agora: Date): Record<string, unknown> {
  return {
    evento: "chatbot.webhook",
    enviado_em: agora.toISOString(),
    fluxo: { id: envio.fluxoId, passo: envio.passoId },
    conversa: { id: envio.conversationId },
    contato: envio.contato,
    mensagem: envio.mensagem,
    respostas: envio.respostas,
  };
}

export async function chamarWebhookDoChatbot(
  c: ConfigDe<"webhook">,
  envio: EnvioDoWebhook,
  segredos: { segredo: string | null; autorizacao: string | null },
  opts: { fetch?: typeof fetch; agora?: Date; pularChecagemDeRede?: boolean } = {},
): Promise<RespostaDoWebhook & { erro?: string }> {
  const agora = opts.agora ?? new Date();
  const url = urlComVariaveis(c.url, envio.respostas);
  try {
    assertSafeOutboundUrl(url);
    if (!opts.pularChecagemDeRede) await assertDestinoResolvidoSeguro(new URL(url).hostname);
  } catch (err) {
    return { ok: false, status: null, corpo: null, erro: err instanceof Error ? err.message : "unsafe_url" };
  }

  const entrega = randomUUID();
  const carimbo = Math.floor(agora.getTime() / 1000);
  const corpo = c.metodo === "POST" ? JSON.stringify(corpoDoWebhook(envio, agora)) : "";
  const cabecalhos: Record<string, string> = {
    Accept: "application/json",
    "X-Webhook-Delivery": entrega,
    "X-Webhook-Timestamp": String(carimbo),
  };
  if (c.metodo === "POST") cabecalhos["Content-Type"] = "application/json";
  if (segredos.segredo) {
    const v1 = createHmac("sha256", segredos.segredo).update(`${carimbo}.${entrega}.${corpo}`).digest("hex");
    cabecalhos["X-Webhook-Signature"] = `t=${carimbo},v1=${v1}`;
  }
  if (segredos.autorizacao) cabecalhos.Authorization = segredos.autorizacao;

  try {
    const res = await (opts.fetch ?? fetch)(url, {
      method: c.metodo,
      headers: cabecalhos,
      ...(c.metodo === "POST" ? { body: corpo } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(TEMPO_DO_WEBHOOK_MS),
    });
    const texto = (await res.text()).slice(0, TETO_DA_RESPOSTA);
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    const ok = res.status >= 200 && res.status < 300;
    return { ok, status: res.status, corpo: json, ...(ok ? {} : { erro: `http_${res.status}` }) };
  } catch (err) {
    const nome = err instanceof Error ? err.name : "";
    return { ok: false, status: null, corpo: null, erro: nome === "TimeoutError" ? "timeout" : "rede" };
  }
}

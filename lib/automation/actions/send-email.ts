/**
 * Ação `send_email` — "Enviar e-mail".
 *
 * Sai pelo MESMO caminho de todo e-mail do produto (`lib/email/roteador.ts`:
 * SMTP da instalação, ou Resend). Sem nenhum dos dois configurado, o resultado é
 * `skipped: email_not_configured` — a regra não "falha", porque o operador ainda
 * não ligou o e-mail, e a mensagem do log diz o que fazer.
 *
 * Quem recebe é uma ESCOLHA FECHADA, nunca um endereço digitado na regra (uma
 * regra com endereço livre viraria um relé de e-mail para qualquer pessoa):
 *   - `contato`     — o e-mail do contato do evento, com as MESMAS guardas das
 *                      outras ações que falam com cliente (bloqueado, pessoal,
 *                      "sempre humano", recusa registrada). Sem e-mail, não envia;
 *   - `dono_do_lead`, `gerentes`, `{ usuario_id }` — a equipe, resolvida na
 *                      própria organização do evento.
 *
 * O texto é escapado antes de virar HTML e o assunto perde quebras de linha
 * (nada de cabeçalho extra por um nome de contato malicioso).
 */
import { registerAction } from "@/lib/automation/actions";
import { renderTemplate } from "@/lib/automation/template";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import { sendEmail } from "@/lib/email/roteador";
import { logger } from "@/lib/logger";
import { recusaRegistrada } from "@/lib/lgpd/recusa-registrada";

type Destinatario = "contato" | "dono_do_lead" | "gerentes" | { usuario_id: string };

const EMAIL_SIMPLES = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export function destinatarioDeEmail(bruto: unknown): Destinatario | null {
  if (bruto === "contato" || bruto === "dono_do_lead" || bruto === "gerentes") return bruto;
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    const id = (bruto as { usuario_id?: unknown }).usuario_id;
    if (typeof id === "string" && id.trim()) return { usuario_id: id.trim() };
  }
  return null;
}

export function assuntoSeguro(texto: string): string {
  return texto.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function escapar(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function corpoEmHtml(texto: string): string {
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.5">${escapar(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1c1917">${paragrafos}</div>`;
}

type ContatoDoContexto = {
  id: string;
  email?: string | null;
  is_blocked?: boolean;
  is_personal?: boolean;
  ai_opt_out?: boolean;
  consent?: unknown;
};

/** Os endereços de destino, ou o motivo de não haver nenhum. */
async function resolverEnderecos(
  ctx: ActionCtx,
  para: Destinatario,
): Promise<{ ok: true; enderecos: string[] } | { ok: false; reason: string }> {
  if (para === "contato") {
    const c = ctx.context.contact as ContatoDoContexto | undefined;
    if (!c) return { ok: false, reason: "no_contact" };
    if (c.is_blocked || c.is_personal || c.ai_opt_out) return { ok: false, reason: "contact_blocked" };
    if (recusaRegistrada(c.consent)) return { ok: false, reason: "consent_declined" };
    const email = typeof c.email === "string" ? c.email.trim() : "";
    if (!email || !EMAIL_SIMPLES.test(email)) return { ok: false, reason: "no_email" };
    return { ok: true, enderecos: [email] };
  }

  let ids: string[] = [];
  if (para === "dono_do_lead") {
    const lead = ctx.context.lead as { owner_user_id?: string | null } | undefined;
    if (lead?.owner_user_id) ids = [lead.owner_user_id];
  } else {
    // gerentes OU uma pessoa: SEMPRE conferida como membro ativo desta organização.
    let q = ctx.admin
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", ctx.organizationId)
      .is("revoked_at", null);
    q = para === "gerentes" ? q.in("role", ["manager", "admin"]) : q.eq("user_id", para.usuario_id);
    const { data, error } = await q;
    if (error) return { ok: false, reason: "lookup_failed" };
    ids = (data ?? []).map((r) => (r as { user_id: string }).user_id);
  }
  if (para === "dono_do_lead" && ids.length) {
    // O dono também só vale se ainda for membro ativo.
    const { data } = await ctx.admin
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", ctx.organizationId)
      .is("revoked_at", null)
      .in("user_id", ids);
    ids = (data ?? []).map((r) => (r as { user_id: string }).user_id);
  }
  if (!ids.length) return { ok: false, reason: "no_recipient" };

  const enderecos: string[] = [];
  for (const id of ids.slice(0, 20)) {
    const { data } = await ctx.admin.auth.admin.getUserById(id);
    const email = data?.user?.email?.trim();
    if (email && EMAIL_SIMPLES.test(email)) enderecos.push(email);
  }
  return enderecos.length ? { ok: true, enderecos } : { ok: false, reason: "no_email" };
}

async function execute(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail> {
  const assuntoBruto = typeof config.assunto === "string" ? config.assunto : "";
  const mensagemBruta = typeof config.mensagem === "string" ? config.mensagem : "";
  const para = destinatarioDeEmail(config.destinatario);
  if (!assuntoBruto.trim() || !mensagemBruta.trim() || !para) {
    return { type: "send_email", status: "skipped", detail: { reason: "missing_input" } };
  }

  const alvo = await resolverEnderecos(ctx, para);
  if (!alvo.ok) {
    return { type: "send_email", status: "skipped", detail: { reason: alvo.reason } };
  }

  const assunto = assuntoSeguro(renderTemplate(assuntoBruto, ctx.context));
  const texto = renderTemplate(mensagemBruta, ctx.context).trim();
  if (!assunto || !texto) {
    return { type: "send_email", status: "skipped", detail: { reason: "empty_after_render" } };
  }

  let enviados = 0;
  let ultimoErro: string | null = null;
  for (const to of alvo.enderecos) {
    const r = await sendEmail({
      to,
      subject: assunto,
      html: corpoEmHtml(texto),
      text: texto,
      tags: [{ name: "origem", value: "automacao" }],
    });
    if (r.ok) enviados += 1;
    else ultimoErro = r.error ?? "send_failed";
  }

  if (enviados === 0) {
    // Sem e-mail ligado na instalação não é falha da regra: o operador ainda não configurou.
    if (ultimoErro === "not_configured") {
      return { type: "send_email", status: "skipped", detail: { reason: "email_not_configured" } };
    }
    logger.warn("automation_send_email_failed", { organization_id: ctx.organizationId, error: ultimoErro });
    return { type: "send_email", status: "failed", error: ultimoErro ?? "send_failed" };
  }
  return {
    type: "send_email",
    status: "success",
    detail: { enviados, total: alvo.enderecos.length },
  };
}

registerAction({ type: "send_email", execute });

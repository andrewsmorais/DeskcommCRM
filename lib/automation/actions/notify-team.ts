/**
 * Ação `notify_team` — "Mensagem para a equipe".
 *
 * Um recado INTERNO: vai ao celular/navegador de quem a regra escolheu e nunca
 * ao cliente. É irmã da `create_task` (mesmo caminho de aviso, `enviarPushAoUsuario`),
 * mas sem tarefa: serve para "avise o responsável que o negócio foi ganho" ou
 * "chame os gerentes quando chegar um lead quente".
 *
 * Quem recebe: `dono_do_lead`, `gerentes` (todo gerente e administrador ativo) ou
 * uma pessoa escolhida. Cada entrega confere, no momento, que a pessoa ainda é
 * membro ativo DESTA organização (`enviarPushAoUsuario`), e a lista de gerentes sai
 * da própria organização do evento — nunca de config (id de usuário de fora não
 * entra por aqui).
 *
 * Se ninguém foi alcançado (sem dono, sem inscrição de aviso, avisos desligados no
 * servidor), a ação NÃO falha em silêncio: abre um item na Central de avisos com o
 * texto, para o recado não se perder. O resultado da ação fica no log da regra
 * (`automation.rule_executed` já audita a execução).
 */
import { registerAction } from "@/lib/automation/actions";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";
import { truncar } from "@/lib/notifications/push_payload";
import { enviarPushAoUsuario } from "@/lib/notifications/web_push";

const TITULO_PADRAO = "Aviso da automação";

type Destinatario = "dono_do_lead" | "gerentes" | { usuario_id: string };

export function destinatarioDaConfig(bruto: unknown): Destinatario | null {
  if (bruto === "dono_do_lead" || bruto === "gerentes") return bruto;
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    const id = (bruto as { usuario_id?: unknown }).usuario_id;
    if (typeof id === "string" && id.trim()) return { usuario_id: id.trim() };
  }
  return null;
}

/** `{{lead.title}}` e `{{contact.name}}`; sem dado, o marcador fica à vista. */
export function interpolarAviso(
  texto: string,
  lead: { title?: string | null } | undefined,
  contact: { name?: string | null; display_name?: string | null } | undefined,
): string {
  const titulo = lead?.title?.trim();
  const nome = nomeDoContato(contact ?? null);
  let saida = texto;
  if (titulo) saida = saida.replaceAll("{{lead.title}}", titulo);
  if (nome) saida = saida.replaceAll("{{contact.name}}", nome);
  return saida.trim();
}

async function execute(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail> {
  const mensagemBruta = typeof config.mensagem === "string" ? config.mensagem : "";
  const tituloBruto = typeof config.titulo === "string" ? config.titulo.trim() : "";
  const para = destinatarioDaConfig(config.destinatario);
  if (!mensagemBruta.trim() || !para) {
    return { type: "notify_team", status: "skipped", detail: { reason: "missing_input" } };
  }

  const lead = ctx.context.lead as
    | { id: string; title?: string | null; owner_user_id?: string | null }
    | undefined;
  const contact = ctx.context.contact as
    | { id: string; name?: string | null; display_name?: string | null }
    | undefined;
  const mensagem = interpolarAviso(mensagemBruta, lead, contact);
  const titulo = interpolarAviso(tituloBruto || TITULO_PADRAO, lead, contact) || TITULO_PADRAO;

  // Quem recebe — sempre da organização do evento.
  let usuarios: string[] = [];
  if (para === "dono_do_lead") {
    if (lead?.owner_user_id) usuarios = [lead.owner_user_id];
  } else if (para === "gerentes") {
    const { data, error } = await ctx.admin
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", ctx.organizationId)
      .is("revoked_at", null)
      .in("role", ["manager", "admin"]);
    if (error) return { type: "notify_team", status: "failed", error: error.message };
    usuarios = (data ?? []).map((r) => (r as { user_id: string }).user_id);
  } else {
    usuarios = [para.usuario_id];
  }

  let alcancados = 0;
  for (const userId of usuarios) {
    try {
      const r = await enviarPushAoUsuario(ctx.organizationId, userId, {
        title: titulo.slice(0, 200),
        body: truncar(mensagem),
        tag: `equipe:${ctx.ruleId}:${ctx.event.id}`,
        href: lead ? "/app/pipeline" : "/app/contacts",
      });
      if (r.sent > 0) alcancados += 1;
    } catch (err) {
      logger.warn("notify_team_push_failed", {
        organization_id: ctx.organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Ninguém alcançado: o recado vai para a Central em vez de sumir.
  let naCentral = false;
  if (alcancados === 0) {
    const { error } = await ctx.admin.from("agent_inbox_items").insert({
      organization_id: ctx.organizationId,
      kind: "other",
      severity: "info",
      title: titulo.slice(0, 200),
      body: mensagem.slice(0, 1000),
    });
    if (error) {
      return { type: "notify_team", status: "failed", error: error.message };
    }
    naCentral = true;
  }

  return {
    type: "notify_team",
    status: "success",
    detail: { destinatarios: usuarios.length, alcancados, na_central: naCentral },
  };
}

registerAction({ type: "notify_team", execute });

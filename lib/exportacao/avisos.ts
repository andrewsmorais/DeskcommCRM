/**
 * Os avisos por e-mail do ciclo de vida da conta — a casca que lê, decide e envia.
 *
 * A DECISÃO mora em `ciclo-de-vida.ts` (pura); aqui só se lê o banco, manda o
 * e-mail e grava que mandou. As dependências entram por parâmetro justamente
 * para o comportamento poder ser provado sem banco nem e-mail de verdade.
 *
 * ─── Três garantias que esta peça dá ────────────────────────────────────────
 *
 * 1. **Nunca avisa duas vezes o mesmo aviso.** O que foi enviado fica em
 *    `organizations.settings.ciclo_de_vida`, preso à data de fim do acesso a que
 *    se refere: se a conta renova e depois termina de novo, o fim é outro e o
 *    ciclo recomeça do zero.
 * 2. **Só marca como enviado o que alguém recebeu.** Sem transporte de e-mail,
 *    sem destinatário ou sem segredo para assinar o link, nada é gravado — o
 *    aviso continua devido e sai assim que a causa for corrigida.
 * 3. **Nunca manda sem link.** Um e-mail que diz "baixe seus dados" e não tem
 *    como baixar é pior que e-mail nenhum.
 *
 * Os destinatários são os ADMINISTRADORES da organização, um e-mail por pessoa
 * (ninguém vê o endereço do outro), e nenhum endereço vai para o log.
 */
import { audit } from "@/lib/audit";
import { marcaDaSaida, emailDeSuporte } from "@/lib/branding/saida";
import { emailConfigurado, sendEmail } from "@/lib/email/roteador";
import { construirEmailDeExportacao } from "@/lib/email/templates/exportacao-de-dados";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  acessoEncerrado,
  avisoDevido,
  exclusaoEm,
  exclusaoLiberadaEm,
  fimDoAcesso,
  lembreteDispensado,
  type Aviso,
} from "./ciclo-de-vida";
import { ultimoDownload } from "./download";
import { urlDeExportacao } from "./link";

export interface LinhaDeAssinatura {
  readonly organization_id: string;
  readonly status: string;
  readonly current_period_end: string | null;
  readonly expires_at: string | null;
  readonly canceled_at: string | null;
}

export interface EstadoDoCiclo {
  /** O fim do acesso (ISO) a que estes avisos se referem. */
  readonly fim: string;
  readonly avisos: Partial<Record<Aviso, string>>;
}

export interface DadosDaOrganizacao {
  readonly nome: string;
  readonly redigida: boolean;
  readonly estado: EstadoDoCiclo | null;
  /** Último download COMPLETO do ZIP (`download.ts`), ou `null`. */
  readonly baixadoEm: string | null;
}

export interface Dependencias {
  agora(): Date;
  /** A assinatura MAIS RECENTE de cada organização que tem alguma. */
  assinaturas(): Promise<LinhaDeAssinatura[]>;
  organizacao(orgId: string): Promise<DadosDaOrganizacao | null>;
  gravarEstado(orgId: string, estado: EstadoDoCiclo): Promise<void>;
  destinatarios(orgId: string): Promise<string[]>;
  /** `true` quando o transporte aceitou a mensagem. */
  enviar(args: { para: string; orgId: string; orgNome: string; aviso: Aviso; url: string; exclusaoEm: Date }): Promise<boolean>;
  emailPronto(): Promise<boolean>;
  gerarUrl(orgId: string, expiraEm: Date): string | null;
  auditar(orgId: string, aviso: Aviso, enviados: number): Promise<void>;
}

export interface ResultadoDosAvisos {
  readonly avaliadas: number;
  readonly enviados: { orgId: string; aviso: Aviso; destinatarios: number }[];
  /** O que SERIA enviado, quando a rodada é simulação. */
  readonly simulados: { orgId: string; aviso: Aviso }[];
  readonly semDestinatario: number;
  readonly semLink: number;
  readonly falhasDeEnvio: number;
  readonly semEmail: boolean;
  /** Lembretes que não saíram porque a pessoa já tinha baixado os dados. */
  readonly jaBaixaram: { orgId: string; aviso: Aviso }[];
}

export async function executarAvisos(
  dep: Dependencias,
  opcoes: { simular?: boolean } = {},
): Promise<ResultadoDosAvisos> {
  const agora = dep.agora();
  const resultado = {
    avaliadas: 0,
    enviados: [] as ResultadoDosAvisos["enviados"],
    simulados: [] as ResultadoDosAvisos["simulados"],
    semDestinatario: 0,
    semLink: 0,
    falhasDeEnvio: 0,
    semEmail: false,
    jaBaixaram: [] as ResultadoDosAvisos["jaBaixaram"],
  };

  if (!opcoes.simular && !(await dep.emailPronto())) {
    return { ...resultado, semEmail: true };
  }

  for (const assinatura of await dep.assinaturas()) {
    if (!acessoEncerrado(assinatura, agora)) continue;
    const fim = fimDoAcesso(assinatura);
    if (!fim) continue;
    resultado.avaliadas += 1;

    const org = await dep.organizacao(assinatura.organization_id);
    if (!org || org.redigida) continue;

    const mesmoCiclo = org.estado?.fim === fim.toISOString();
    const jaEnviados = mesmoCiclo ? (org.estado?.avisos ?? {}) : {};
    const aviso = avisoDevido(fim, agora, jaEnviados);
    if (!aviso) continue;

    // Já baixou depois do encerramento: não insiste. Nada é gravado como
    // enviado — se o download for de antes deste fim, a regra já o ignora.
    if (lembreteDispensado(aviso, fim, org.baixadoEm)) {
      resultado.jaBaixaram.push({ orgId: assinatura.organization_id, aviso });
      continue;
    }

    if (opcoes.simular) {
      resultado.simulados.push({ orgId: assinatura.organization_id, aviso });
      continue;
    }

    const exclusao = exclusaoEm(fim);
    // O link vale até o fim da folga do aviso final: cobre as três mensagens, e
    // é o MESMO instante em que a exclusão fica liberada (`exclusao.ts`).
    const expiraEm = exclusaoLiberadaEm(fim);
    const url = dep.gerarUrl(assinatura.organization_id, expiraEm);
    if (!url) {
      resultado.semLink += 1;
      continue;
    }

    const para = await dep.destinatarios(assinatura.organization_id);
    if (para.length === 0) {
      resultado.semDestinatario += 1;
      continue;
    }

    let entregues = 0;
    for (const endereco of para) {
      const ok = await dep.enviar({
        para: endereco,
        orgId: assinatura.organization_id,
        orgNome: org.nome,
        aviso,
        url,
        exclusaoEm: exclusao,
      });
      if (ok) entregues += 1;
      else resultado.falhasDeEnvio += 1;
    }

    if (entregues > 0) {
      await dep.gravarEstado(assinatura.organization_id, {
        fim: fim.toISOString(),
        avisos: { ...jaEnviados, [aviso]: agora.toISOString() },
      });
      resultado.enviados.push({ orgId: assinatura.organization_id, aviso, destinatarios: entregues });
      await dep.auditar(assinatura.organization_id, aviso, entregues);
    }
  }

  return resultado;
}

// ───────────────────────────── implementação real ─────────────────────────────

function estadoDe(settings: unknown): EstadoDoCiclo | null {
  if (!settings || typeof settings !== "object") return null;
  const bruto = (settings as Record<string, unknown>).ciclo_de_vida;
  if (!bruto || typeof bruto !== "object") return null;
  const { fim, avisos } = bruto as { fim?: unknown; avisos?: unknown };
  if (typeof fim !== "string" || !avisos || typeof avisos !== "object") return null;
  const limpos: Partial<Record<Aviso, string>> = {};
  for (const chave of ["encerramento", "d7", "dia"] as const) {
    const v = (avisos as Record<string, unknown>)[chave];
    if (typeof v === "string") limpos[chave] = v;
  }
  return { fim, avisos: limpos };
}

type ClienteAdmin = ReturnType<typeof createAdminClient>;

/**
 * A assinatura MAIS RECENTE de cada organização que tem alguma. Organização sem
 * assinatura nenhuma (a do dono, as de teste) não aparece — e por isso nunca é
 * avisada nem excluída por estes crons.
 *
 * Compartilhada com `exclusao.ts` de propósito: os dois crons TÊM de enxergar o
 * mesmo "fim do acesso", senão a exclusão poderia correr numa data que nenhum
 * e-mail anunciou.
 */
export async function lerAssinaturasMaisRecentes(db: ClienteAdmin): Promise<LinhaDeAssinatura[] | null> {
  const { data, error } = await db
    .from("subscriptions")
    .select("organization_id, status, current_period_end, expires_at, canceled_at, created_at")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(5000);
  if (error) {
    logger.warn("exportacao_leitura_de_assinaturas_falhou", { detail: error.message });
    return null;
  }
  // A mais recente de cada organização: histórico de assinaturas não conta.
  const vistas = new Set<string>();
  const maisRecentes: LinhaDeAssinatura[] = [];
  for (const l of (data ?? []) as unknown as LinhaDeAssinatura[]) {
    if (vistas.has(l.organization_id)) continue;
    vistas.add(l.organization_id);
    maisRecentes.push(l);
  }
  return maisRecentes;
}

export async function lerOrganizacao(db: ClienteAdmin, orgId: string): Promise<DadosDaOrganizacao | null> {
  const { data, error } = await db
    .from("organizations")
    .select("display_name, settings, redacted_at")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  // Nome da ORGANIZAÇÃO, não de contato — por isso não passa por `nomeDoContato`.
  const nomeDaOrganizacao = typeof data.display_name === "string" ? data.display_name.trim() : "";
  return {
    nome: nomeDaOrganizacao || "Sua conta",
    redigida: Boolean(data.redacted_at),
    estado: estadoDe(data.settings),
    baixadoEm: ultimoDownload(data.settings),
  };
}

export function dependenciasReais(): Dependencias {
  const db = createAdminClient();
  return {
    agora: () => new Date(),

    async assinaturas() {
      return (await lerAssinaturasMaisRecentes(db)) ?? [];
    },

    organizacao: (orgId) => lerOrganizacao(db, orgId),

    async gravarEstado(orgId, estado) {
      // Relê logo antes de gravar: `settings` é compartilhado com o resto da
      // tela de Configurações, e sobrescrever o que acabou de mudar seria pior
      // que um aviso repetido.
      const { data } = await db.from("organizations").select("settings").eq("id", orgId).maybeSingle();
      const atual =
        data?.settings && typeof data.settings === "object" && !Array.isArray(data.settings)
          ? (data.settings as Record<string, unknown>)
          : {};
      const { error } = await db
        .from("organizations")
        .update({ settings: { ...atual, ciclo_de_vida: estado } as never })
        .eq("id", orgId);
      if (error) logger.warn("exportacao_avisos_gravar_estado_falhou", { orgId, detail: error.message });
    },

    async destinatarios(orgId) {
      const { data } = await db
        .from("user_organizations")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("role", "admin")
        .is("revoked_at", null)
        .limit(5);
      const enderecos = new Set<string>();
      for (const linha of data ?? []) {
        const { data: usuario } = await db.auth.admin.getUserById(linha.user_id);
        const email = usuario?.user?.email?.trim().toLowerCase();
        if (email) enderecos.add(email);
      }
      return [...enderecos];
    },

    async enviar({ para, orgId, orgNome, aviso, url, exclusaoEm: quando }) {
      const marca = await marcaDaSaida(orgId);
      const suporte = await emailDeSuporte();
      const { subject, html, text } = construirEmailDeExportacao({
        aviso,
        orgName: orgNome,
        marca,
        urlDeDownload: url,
        exclusaoEm: quando,
        suporte,
      });
      const r = await sendEmail({
        to: para,
        subject,
        html,
        text,
        fromName: marca.nome,
        ...(suporte ? { replyTo: suporte } : {}),
        tags: [
          { name: "tipo", value: "exportacao-de-dados" },
          { name: "aviso", value: aviso },
        ],
      });
      if (!r.ok) logger.warn("exportacao_avisos_envio_falhou", { orgId, aviso, erro: r.error ?? "desconhecido" });
      return r.ok;
    },

    emailPronto: () => emailConfigurado(),
    gerarUrl: (orgId, expiraEm) => urlDeExportacao(orgId, expiraEm),

    async auditar(orgId, aviso, enviados) {
      await audit({
        action: "org.exportacao_aviso_enviado",
        organizationId: orgId,
        resourceType: "organization",
        resourceId: orgId,
        bypassedRls: true,
        metadata: { aviso, destinatarios: enviados },
      });
    },
  };
}

/**
 * E-mail do ciclo de vida da conta: o acesso terminou, e é hora de baixar os dados.
 *
 * Três avisos, uma mensagem só com três tons (`lib/exportacao/ciclo-de-vida.ts`).
 * O texto não promete a exclusão numa data: diz que depois dela os dados
 * PODEM ser excluídos, que é o que os Termos afirmam.
 *
 * A marca é a de SAÍDA (`marcaDaSaida`): nome e cor da instalação, nunca o nome
 * do produto escrito à mão aqui. Todo valor que vem de fora passa por
 * `escapeHtml` — o nome da organização é digitado pelo cliente.
 */
import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";
import type { Aviso } from "@/lib/exportacao/ciclo-de-vida";

export interface ExportacaoEmailOptions {
  aviso: Aviso;
  orgName: string;
  marca: MarcaDeSaida;
  /** O link de download — já assinado e completo. */
  urlDeDownload: string;
  /** Quando os dados podem passar a ser excluídos. */
  exclusaoEm: Date;
  /** E-mail de suporte da instalação; vazio = sem a linha de contato. */
  suporte: string;
}

const TITULOS: Record<Aviso, string> = {
  encerramento: "Seu acesso terminou. Baixe seus dados.",
  d7: "Faltam 7 dias para o fim do prazo de download dos seus dados",
  dia: "Hoje termina o prazo para baixar seus dados",
};

const ABERTURAS: Record<Aviso, string> = {
  encerramento:
    "O acesso da sua conta terminou. Seus dados continuam guardados, e você pode baixá-los pelo link abaixo até",
  d7: "O prazo para baixar os dados da sua conta termina em 7 dias, em",
  dia: "Este é o último dia do prazo para baixar os dados da sua conta:",
};

function dataLonga(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" });
}

export function construirEmailDeExportacao(opts: ExportacaoEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const marca = opts.marca.nome;
  const prazo = dataLonga(opts.exclusaoEm);
  const subject = `${TITULOS[opts.aviso]} — ${marca}`;

  const logo = opts.marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${escapeHtml(opts.marca.logoUrl)}" alt="${escapeHtml(marca)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";
  const contato = opts.suporte
    ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.5">Dúvidas? Responda este e-mail ou escreva para <a href="mailto:${escapeHtml(opts.suporte)}" style="color:${opts.marca.accent}">${escapeHtml(opts.suporte)}</a>.</p>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    ${logo}
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:${NEUTROS_DE_SAIDA.texto}">${escapeHtml(TITULOS[opts.aviso])}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">Conta: <strong>${escapeHtml(opts.orgName)}</strong></p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(ABERTURAS[opts.aviso])} <strong>${escapeHtml(prazo)}</strong>. Depois dessa data, seus dados poderão ser excluídos definitivamente.</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(opts.urlDeDownload)}" style="display:inline-block;padding:12px 24px;background:${opts.marca.accent};color:${opts.marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">Baixar meus dados</a>
    </p>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5">O arquivo é um ZIP com planilhas de contatos, conversas, mensagens, leads, tarefas e agendamentos. Fotos, áudios e documentos enviados nas conversas não vão junto.</p>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5">Se você voltar a assinar antes dessa data, nada é excluído.</p>
    ${contato}
    <p style="margin:24px 0 8px;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">Este link é pessoal: quem o tiver consegue baixar os dados da conta. Não o encaminhe.</p>
    <p style="margin:0;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">Se o botão não abrir, copie este endereço: <span style="word-break:break-all;color:${opts.marca.accent}">${escapeHtml(opts.urlDeDownload)}</span></p>
  </div>
</body>
</html>`;

  const text = [
    TITULOS[opts.aviso],
    "",
    `Conta: ${opts.orgName}`,
    `${ABERTURAS[opts.aviso]} ${prazo}. Depois dessa data, seus dados poderão ser excluídos definitivamente.`,
    "",
    `Baixar meus dados: ${opts.urlDeDownload}`,
    "",
    "O arquivo é um ZIP com planilhas de contatos, conversas, mensagens, leads, tarefas e agendamentos. Fotos, áudios e documentos enviados nas conversas não vão junto.",
    "Se você voltar a assinar antes dessa data, nada é excluído.",
    opts.suporte ? `Dúvidas: ${opts.suporte}` : "",
    "",
    "Este link é pessoal: quem o tiver consegue baixar os dados da conta. Não o encaminhe.",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Os links de um texto do chatbot e se são seguros de mandar. PURO.
 *
 * Bloqueia o que não é endereço de página: `javascript:`, `data:`,
 * `vbscript:` e `file:` — no WhatsApp eles não abrem nada útil e são o
 * formato clássico de golpe. `http://` passa, mas a tela sugere `https://`
 * (o celular avisa "não seguro" em várias páginas). A conferência é do
 * DESENHO: um link que chega inteiro dentro de uma `{{variavel}}` (o
 * `{{link_checkout}}` de uma venda) não existe ainda e não é conferido aqui.
 * Não é filtro de golpe: um https:// para um site ruim passa.
 */
import { reVariavel } from "@/lib/empresa/variaveis";
export type ProblemaDoLink = "protocolo_perigoso" | "sem_https" | "malformado";
export type LinkDoTexto = { link: string; problema: ProblemaDoLink | null };

const PERIGOSOS = /\b(javascript|data|vbscript|file):[^\s]*/gi;
const WEB = /\bhttps?:\/\/[^\s<>"']+/gi;

export function linksDoTexto(texto: string): LinkDoTexto[] {
  const achados: LinkDoTexto[] = [];
  for (const m of texto.matchAll(PERIGOSOS))
    achados.push({ link: m[0], problema: "protocolo_perigoso" });
  for (const m of texto.matchAll(WEB)) {
    const link = m[0].replace(/[).,;!?]+$/, "");
    let problema: ProblemaDoLink | null = null;
    try {
      const u = new URL(link.replace(reVariavel(), "x"));
      if (!u.hostname.includes(".") && u.hostname !== "localhost") problema = "malformado";
      else if (u.protocol === "http:") problema = "sem_https";
    } catch {
      problema = "malformado";
    }
    achados.push({ link, problema });
  }
  return achados;
}

/** Só os que impedem ligar o fluxo (o http:// é só aviso). */
export function linksQueBloqueiam(texto: string): LinkDoTexto[] {
  return linksDoTexto(texto).filter(
    (l) => l.problema === "protocolo_perigoso" || l.problema === "malformado",
  );
}

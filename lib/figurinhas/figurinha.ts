/**
 * FIGURINHAS SALVAS — o "Figurinhas" da Umbler Talk (migration 0516).
 *
 * O WhatsApp só aceita figurinha WebP, 512×512, de até 100 KB (as estáticas), e
 * o canal por QR code NÃO converte ("PNG e JPEG não são convertidos"). Então
 * toda figurinha entra na biblioteca já no formato certo: a que veio do
 * computador (PNG, JPG, WebP ou GIF) e a que o contato mandou.
 *
 * Figurinha animada vira estática (o primeiro quadro): animada exige outro
 * formato de envio, e uma figurinha parada é melhor que uma que não sai.
 */
import { createHash } from "node:crypto";

import sharp from "sharp";

export const LADO = 512;
export const MAX_ENTRADA = 5 * 1024 * 1024;
export const MAX_SAIDA = 100 * 1024;
export const MAX_POR_EMPRESA = 200;
export const MIME = "image/webp";

const FORMATOS_ACEITOS = new Set(["png", "jpeg", "webp", "gif"]);

export class FigurinhaInvalida extends Error {}

/** O arquivo vira figurinha (WebP 512×512 até 100 KB), ou explica por que não. */
export async function paraFigurinha(entrada: Buffer): Promise<Buffer> {
  if (entrada.byteLength === 0) throw new FigurinhaInvalida("Arquivo vazio.");
  if (entrada.byteLength > MAX_ENTRADA) throw new FigurinhaInvalida("Imagem maior que 5 MB.");
  let formato: string | undefined;
  try {
    formato = (await sharp(entrada, { animated: false }).metadata()).format;
  } catch {
    throw new FigurinhaInvalida("Isto não é uma imagem.");
  }
  if (!formato || !FORMATOS_ACEITOS.has(formato))
    throw new FigurinhaInvalida("Use uma imagem PNG, JPG, WebP ou GIF.");
  const base = sharp(entrada, { animated: false })
    .rotate()
    .resize(LADO, LADO, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  for (const qualidade of [80, 65, 50, 35, 20]) {
    const saida = await base.clone().webp({ quality: qualidade }).toBuffer();
    if (saida.byteLength <= MAX_SAIDA) return saida;
  }
  throw new FigurinhaInvalida("Esta imagem tem detalhe demais para virar figurinha (passa de 100 KB).");
}

export function hashDaFigurinha(arquivo: Buffer): string {
  return createHash("sha256").update(arquivo).digest("hex");
}

export function caminhoDaFigurinha(orgId: string, hash: string): string {
  return `${orgId}/figurinhas/${hash}.webp`;
}

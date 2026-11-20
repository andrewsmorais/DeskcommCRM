// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { caminhoDaFigurinha, FigurinhaInvalida, hashDaFigurinha, MAX_SAIDA, paraFigurinha } from "./figurinha";

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 30, b: 90, alpha: 1 } } })
    .png()
    .toBuffer();

describe("figurinha — o formato que o WhatsApp aceita", () => {
  it("PNG retangular vira WebP 512×512 com fundo transparente, até 100 KB", async () => {
    const saida = await paraFigurinha(await png(800, 300));
    const meta = await sharp(saida).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([512, 512]);
    expect(meta.hasAlpha).toBe(true);
    expect(saida.byteLength).toBeLessThanOrEqual(MAX_SAIDA);
  });

  it("recusa o que não é imagem e arquivo vazio", async () => {
    await expect(paraFigurinha(Buffer.from("não sou imagem"))).rejects.toBeInstanceOf(FigurinhaInvalida);
    await expect(paraFigurinha(Buffer.alloc(0))).rejects.toBeInstanceOf(FigurinhaInvalida);
  });

  it("recusa formato que não é de foto (SVG)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(paraFigurinha(svg)).rejects.toThrow(/PNG, JPG, WebP ou GIF/);
  });

  it("o mesmo arquivo tem o mesmo nome (sem duplicar na biblioteca)", async () => {
    const a = await paraFigurinha(await png(100, 100));
    const b = await paraFigurinha(await png(100, 100));
    expect(hashDaFigurinha(a)).toBe(hashDaFigurinha(b));
    expect(caminhoDaFigurinha("org", hashDaFigurinha(a))).toMatch(/^org\/figurinhas\/[0-9a-f]{64}\.webp$/);
  });
});

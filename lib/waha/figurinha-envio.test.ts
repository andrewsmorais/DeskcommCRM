// @vitest-environment node
/**
 * Envio de figurinha com um WAHA de verdade (servidor HTTP local, receptor
 * real): o 2026.8.2+ recebe em `/api/sendSticker`; o anterior, que não tem a
 * rota (404), recebe a mesma figurinha como imagem — ela sai em vez de sumir.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WahaClient } from "./client";
import { wahaSendPlanFor } from "./media-send";

let servidor: Server;
let base = "";
let temSticker = true;
const recebidos: { url: string; corpo: Record<string, unknown> }[] = [];

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      recebidos.push({ url: req.url ?? "", corpo: JSON.parse(b || "{}") });
      if (req.url === "/api/sendSticker" && !temSticker) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id: "true_1@c.us_ABC" }));
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

const plano = () => wahaSendPlanFor("sticker", { url: "https://storage.example/f.webp", mime: "image/webp" });

describe("figurinha no WAHA", () => {
  it("WAHA 2026.8.2+: sai por sendSticker", async () => {
    recebidos.length = 0;
    temSticker = true;
    await new WahaClient(base, "k").sendMedia("s1", "5511999998888@c.us", plano());
    expect(recebidos.map((r) => r.url)).toEqual(["/api/sendSticker"]);
    expect(recebidos[0]!.corpo).toEqual({
      session: "s1",
      chatId: "5511999998888@c.us",
      file: { url: "https://storage.example/f.webp", mimetype: "image/webp" },
    });
  });

  it("WAHA antigo (sem a rota): a mesma figurinha sai como imagem", async () => {
    recebidos.length = 0;
    temSticker = false;
    await new WahaClient(base, "k").sendMedia("s1", "5511999998888@c.us", plano());
    expect(recebidos.map((r) => r.url)).toEqual(["/api/sendSticker", "/api/sendImage"]);
  });
});

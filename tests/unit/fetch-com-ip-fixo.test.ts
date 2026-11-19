/**
 * DNS REBINDING NA BUSCA DO SITE DO PROSPECTO (auditoria 18/11, nº 21).
 *
 * O ataque: o nome responde um IP público na hora da conferência e um IP
 * interno na hora da conexão. Antes, a guarda resolvia uma vez e o `fetch`
 * resolvia DE NOVO — e a segunda resposta era a que valia.
 *
 * Aqui o resolvedor é um contador: a 1ª resposta é pública, a 2ª é o
 * `127.0.0.1` de um servidor HTTP de verdade nesta máquina. O conserto prova-se
 * por três medidas: (a) o resolvedor é chamado UMA vez por pedido; (b) a conexão
 * vai ao endereço conferido, nunca ao segundo; (c) um nome cuja resposta já traz
 * um endereço interno é recusado sem conexão nenhuma.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  criarFetchComIpFixo,
  enderecosPublicos,
  lookupFixo,
  type ResolverDns,
} from "@/lib/net/fetch-com-ip-fixo";

let servidor: http.Server;
let porta = 0;
let visitas = 0;

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    visitas += 1;
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`interno:${req.headers.host}`);
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  porta = (servidor.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

describe("fetch com IP fixado", () => {
  it("um nome que já responde endereço interno é recusado, sem conexão", async () => {
    const antes = visitas;
    const resolver: ResolverDns = async () => [{ address: "127.0.0.1", family: 4 }];
    const f = criarFetchComIpFixo(resolver);
    await expect(f(`http://site-do-prospecto.example:${porta}/`)).rejects.toThrow("fetch failed");
    expect(visitas).toBe(antes);
  });

  it("basta UM endereço interno na resposta para recusar o nome inteiro", async () => {
    const resolver: ResolverDns = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ];
    await expect(enderecosPublicos("misto.example", resolver)).rejects.toThrow();
  });

  it("rebinding: resolve UMA vez, e a conexão vai ao endereço conferido", async () => {
    // A régua do teste aceita o servidor local como "público", para a conexão
    // acontecer de verdade. O resolvedor muda de resposta a cada chamada: a 1ª
    // é o servidor, a 2ª um endereço que não atende. Se o fetch resolvesse de
    // novo ao conectar (o defeito), iria ao segundo e falharia.
    let chamadas = 0;
    const resolver: ResolverDns = async () => {
      chamadas += 1;
      return chamadas === 1
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: "203.0.113.200", family: 4 }];
    };
    const f = criarFetchComIpFixo(resolver, () => false);
    const r = await f(`http://rebind.example:${porta}/`, { signal: AbortSignal.timeout(3000) });
    expect(chamadas).toBe(1);
    expect(r.status).toBe(200);
    // O site recebe o PRÓPRIO nome no Host (o certificado, em https, é conferido
    // contra ele): fixar o IP não troca a identidade do pedido.
    expect(await r.text()).toBe(`interno:rebind.example:${porta}`);
    expect(r.url).toBe(`http://rebind.example:${porta}/`);
  });

  it("redirecionamento não é seguido: volta para quem chamou revalidar", async () => {
    const outro = http.createServer((_req, res) => {
      res.writeHead(302, { location: "http://169.254.169.254/" });
      res.end();
    });
    await new Promise<void>((r) => outro.listen(0, "127.0.0.1", r));
    const p = (outro.address() as AddressInfo).port;
    try {
      const f = criarFetchComIpFixo(async () => [{ address: "127.0.0.1", family: 4 }], () => false);
      const r = await f(`http://desvio.example:${p}/`, { redirect: "manual" });
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("http://169.254.169.254/");
    } finally {
      await new Promise<void>((r) => outro.close(() => r()));
    }
  });

  it("o lookup fixo só responde ao nome conferido", () => {
    const lk = lookupFixo("a.example", [{ address: "203.0.113.5", family: 4 }]);
    let erro: unknown = null;
    lk("b.example", {}, (e) => {
      erro = e;
    });
    expect(erro).not.toBeNull();
    let ip = "";
    lk("a.example", {}, (_e, address) => {
      ip = String(address);
    });
    expect(ip).toBe("203.0.113.5");
  });
});

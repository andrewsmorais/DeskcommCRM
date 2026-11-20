import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWahaMedia, pathDeArquivoDoWaha } from "@/lib/messaging/media/waha-source";
import { MediaTooLargeError } from "@/lib/messaging/media/types";

const WAHA_BASE = "http://localhost:3030";

describe("fetchWahaMedia", () => {
  beforeEach(() => {
    vi.stubEnv("WAHA_API_BASE_URL", WAHA_BASE);
    vi.stubEnv("WAHA_API_KEY", "hash123");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("baixa a mídia com X-Api-Key e retorna buffer + mime", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const media = await fetchWahaMedia(`${WAHA_BASE}/api/files/abc.jpg`);
    expect(media.mime).toBe("image/jpeg");
    expect(media.buffer.byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/abc.jpg`,
      expect.objectContaining({ headers: { "X-Api-Key": "hash123" } }),
    );
  });

  it("reescreve host arbitrário p/ a base do WAHA (anti-SSRF por construção)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new ArrayBuffer(2), { status: 200, headers: { "content-type": "image/jpeg" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchWahaMedia("http://evil.example.com/api/files/x.jpg?q=1");
    // Host trocado pela base E query descartada: só o path conferido viaja.
    expect(fetchMock).toHaveBeenCalledWith(`${WAHA_BASE}/api/files/x.jpg`, expect.anything());
  });

  it("reescreve a porta interna anunciada pelo WAHA p/ a base real", async () => {
    // WAHA anuncia localhost:3000 (porta interna do container); no host é 3030.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new ArrayBuffer(2), { status: 200, headers: { "content-type": "image/webp" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchWahaMedia("http://localhost:3000/api/files/sessao/sticker.webp", null, "sessao");
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/sessao/sticker.webp`,
      expect.anything(),
    );
  });

  it("propaga status HTTP de erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(fetchWahaMedia(`${WAHA_BASE}/api/files/gone.jpg`)).rejects.toThrow(
      "waha_media_404",
    );
  });

  it("rejeita mídia acima de 50MB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new ArrayBuffer(8), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": String(60 * 1024 * 1024) },
        }),
      ),
    );
    await expect(fetchWahaMedia(`${WAHA_BASE}/api/files/big.mp4`)).rejects.toThrow(
      MediaTooLargeError,
    );
  });

  it("usa hintMime quando o content-type vem vazio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new ArrayBuffer(2), { status: 200 })),
    );
    const media = await fetchWahaMedia(`${WAHA_BASE}/api/files/x`, "audio/ogg; codecs=opus");
    expect(media.mime).toBe("audio/ogg; codecs=opus");
  });

  it("recusa mediaUrl malformada antes de qualquer rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWahaMedia("not-a-url")).rejects.toThrow("waha_media_untrusted_path");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Auditoria de 18/11, achado 1: `messages.media_url` de mensagem ENVIADA é
 * escrita pelo atendente, e o path dela virava um GET autenticado na API
 * administrativa do WAHA. Só o armazém de arquivos da sessão da mensagem passa.
 */
describe("fetchWahaMedia só alcança o armazém de arquivos da sessão", () => {
  beforeEach(() => {
    vi.stubEnv("WAHA_API_BASE_URL", WAHA_BASE);
    vi.stubEnv("WAHA_API_KEY", "hash123");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const RECUSADAS: Array<[string, string]> = [
    ["lista de sessões da instalação", "https://93.184.215.14/api/sessions?all=true"],
    ["conversas de outra sessão", "https://93.184.215.14/api/org_99999999_fedcba98/chats?limit=5"],
    ["grupos de outra sessão", "http://waha:3000/api/org_outra/groups"],
    ["arquivo na pasta de OUTRA sessão", "http://waha:3000/api/files/org_outra/x.jpg"],
    ["pasta e arquivo além do esperado", "http://waha:3000/api/files/sessao/sub/x.jpg"],
    ["barra codificada", "http://waha:3000/api/files/sessao%2F..%2F..%2Fsessions"],
    ["subida de diretório resolvida", "http://waha:3000/api/files/../sessions"],
    ["raiz da API", "http://waha:3000/api"],
  ];

  for (const [nome, url] of RECUSADAS) {
    it(`recusa ${nome} sem fazer requisição`, async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(fetchWahaMedia(url, null, "sessao")).rejects.toThrow("waha_media_untrusted_path");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("aceita o arquivo da própria sessão e o arquivo sem pasta", () => {
    expect(
      pathDeArquivoDoWaha("http://localhost:3000/api/files/sessao/false_5511999@c.us_3EB0.oga", "sessao"),
    ).toBe("/api/files/sessao/false_5511999@c.us_3EB0.oga");
    expect(pathDeArquivoDoWaha("http://localhost:3000/api/files/true_1@lid_AB.jpeg", "sessao")).toBe(
      "/api/files/true_1@lid_AB.jpeg",
    );
  });

  it("arquivo dentro de pasta exige saber a sessão da mensagem", () => {
    expect(pathDeArquivoDoWaha("http://localhost:3000/api/files/sessao/x.jpg", null)).toBeNull();
  });
});

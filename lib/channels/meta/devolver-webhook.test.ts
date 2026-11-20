import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: vi.fn() }));
vi.mock("./webhook-override", () => ({ desfazerWebhookDoNumero: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

import { devolverWebhookDoNumero, revogacaoDoCanalOficial } from "./devolver-webhook";
import { desfazerWebhookDoNumero } from "./webhook-override";

const admin = {} as never;
const comCredencial = { meta_token_encrypted: "cifrado", meta_phone_number_id: "123" };

beforeEach(() => vi.clearAllMocks());

describe("devolverWebhookDoNumero", () => {
  it("sem credencial na linha nem chama a Meta", async () => {
    expect(await devolverWebhookDoNumero(admin, { meta_token_encrypted: null, meta_phone_number_id: "123" }, {})).toBe(
      "sem_credencial",
    );
    expect(desfazerWebhookDoNumero).not.toHaveBeenCalled();
  });

  it("credencial ilegível vira sem_credencial, sem chamar a Meta", async () => {
    vi.mocked(decryptWebhookSecret).mockResolvedValue(null);
    expect(await devolverWebhookDoNumero(admin, comCredencial, {})).toBe("sem_credencial");
    expect(desfazerWebhookDoNumero).not.toHaveBeenCalled();
  });

  it("a Meta devolveu: desfeito, com o token decifrado", async () => {
    vi.mocked(decryptWebhookSecret).mockResolvedValue("token");
    vi.mocked(desfazerWebhookDoNumero).mockResolvedValue({ ok: true, url: null } as never);
    expect(await devolverWebhookDoNumero(admin, comCredencial, {})).toBe("desfeito");
    expect(desfazerWebhookDoNumero).toHaveBeenCalledWith({ phoneNumberId: "123", token: "token" });
  });

  it("a Meta recusou: falhou, sem lançar", async () => {
    vi.mocked(decryptWebhookSecret).mockResolvedValue("token");
    vi.mocked(desfazerWebhookDoNumero).mockResolvedValue({ ok: false, etapa: "x", motivo: "y" } as never);
    expect(await devolverWebhookDoNumero(admin, comCredencial, {})).toBe("falhou");
  });

  it("rede caída: falhou, sem lançar — quem chama segue desligando o canal", async () => {
    vi.mocked(decryptWebhookSecret).mockResolvedValue("token");
    vi.mocked(desfazerWebhookDoNumero).mockRejectedValue(new Error("ECONNRESET"));
    expect(await devolverWebhookDoNumero(admin, comCredencial, {})).toBe("falhou");
  });
});

describe("revogacaoDoCanalOficial", () => {
  it("apaga a credencial e troca a URL do webhook a cada chamada", () => {
    const a = revogacaoDoCanalOficial();
    const b = revogacaoDoCanalOficial();
    expect(a.meta_token_encrypted).toBeNull();
    expect(a.webhook_path_token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.webhook_path_token).not.toBe(b.webhook_path_token);
  });
});

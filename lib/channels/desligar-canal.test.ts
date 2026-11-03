/**
 * O desligamento que a exclusão da conta pede sem saber o provedor: por QR Code
 * faz logout e remove a sessão (e recusa tudo se o servidor do QR não estiver
 * configurado); oficial devolve o webhook antes de apagar a credencial.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const servidor = { logoutSession: vi.fn(), deleteSession: vi.fn() };
let configurado = true;
vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => (configurado ? servidor : null) }));

const devolver = vi.fn();
vi.mock("./meta/devolver-webhook", () => ({
  devolverWebhookDoNumero: (...a: unknown[]) => devolver(...a),
  revogacaoDoCanalOficial: () => ({ meta_token_encrypted: null, webhook_path_token: "novo" }),
}));

import { prepararDesligamento, type CanalParaDesligar } from "./desligar-canal";

const db = {} as never;
const qr: CanalParaDesligar = {
  id: "a",
  provider: "waha",
  waha_session_name: "org_a",
  meta_token_encrypted: null,
  meta_phone_number_id: null,
};
const oficial: CanalParaDesligar = {
  id: "b",
  provider: "meta_cloud",
  waha_session_name: null,
  meta_token_encrypted: "cifrado",
  meta_phone_number_id: "123",
};

beforeEach(() => {
  configurado = true;
  vi.clearAllMocks();
});

describe("prepararDesligamento", () => {
  it("QR Code: logout e remoção, sem patch extra", async () => {
    const d = prepararDesligamento(db, [qr]);
    expect(d.faltaServidorDoQrCode).toBe(false);
    expect(await d.desligar(qr, {})).toEqual({ patch: {}, webhookPendente: false });
    expect(servidor.logoutSession).toHaveBeenCalledWith("org_a");
    expect(servidor.deleteSession).toHaveBeenCalledWith("org_a");
  });

  it("QR Code sem servidor configurado: avisa antes de tirar qualquer canal", () => {
    configurado = false;
    const d = prepararDesligamento(db, [qr, oficial]);
    expect(d.faltaServidorDoQrCode).toBe(true);
    expect(d.canaisPorQrCode).toBe(1);
    expect(prepararDesligamento(db, [oficial]).faltaServidorDoQrCode).toBe(false);
  });

  it("provider nulo conta como QR Code (linha antiga)", () => {
    expect(prepararDesligamento(db, [{ ...qr, provider: null }]).canaisPorQrCode).toBe(1);
  });

  it("oficial: devolve o webhook e revoga; pendente só se a devolução falhou", async () => {
    const d = prepararDesligamento(db, [oficial]);
    devolver.mockResolvedValueOnce("desfeito");
    expect(await d.desligar(oficial, { origem: "x" })).toEqual({
      patch: { meta_token_encrypted: null, webhook_path_token: "novo" },
      webhookPendente: false,
    });
    expect(devolver).toHaveBeenCalledWith(db, oficial, { origem: "x" });
    devolver.mockResolvedValueOnce("falhou");
    expect((await d.desligar(oficial, {})).webhookPendente).toBe(true);
    expect(servidor.logoutSession).not.toHaveBeenCalled();
  });
});

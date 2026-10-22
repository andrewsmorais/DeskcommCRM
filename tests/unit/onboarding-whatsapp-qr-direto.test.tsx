/**
 * O passo do telefone abre JÁ no código por celular (entrada do produto), com a
 * API oficial e o provedor parceiro atrás de "Escolher outra forma", e com o
 * vídeo explicativo opcional acima do código.
 *
 * Complementa `onboarding-escolhe-como-conecta.test.tsx`, que guarda o modo em
 * que a tela PERGUNTA (`qrDireto={false}`): aqui o modo direto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/app/actions/onboarding/skipWhatsapp", () => ({
  skipWhatsapp: vi.fn(),
  markWhatsappConfigured: vi.fn(),
}));
vi.mock("@/components/connections/CanalOficialClient", () => ({
  CanalOficialClient: () => <div data-testid="dublê-oficial" />,
}));
vi.mock("@/components/connections/CanalParceiroClient", () => ({
  CanalParceiroClient: () => <div data-testid="dublê-parceiro" />,
}));

import { ConnectWhatsappClient } from "@/app/onboarding/connect-whatsapp/_client";
import { VideoDaConexao, urlDeVideoSegura } from "@/app/onboarding/connect-whatsapp/_video";

let chamadas: string[] = [];

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { method?: string }) => {
      chamadas.push(`${init?.method ?? "GET"} ${String(url)}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { status: "SCAN_QR_CODE", session: "org_teste", channel_session_id: "cs_1" },
        }),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar() {
  return render(<ConnectWhatsappClient qrDireto wahaConfigured sessionName="org_teste" oficialPodeReceber />);
}

describe("qrDireto: o passo abre gerando o código", () => {
  it("sobe a sessão sem ninguém ter escolhido, e não mostra a pergunta", async () => {
    montar();

    await waitFor(() => {
      expect(chamadas.some((c) => c.startsWith("POST") && c.includes("/onboarding/whatsapp/session"))).toBe(true);
    });
    expect(screen.queryByText(/como você já usa esse número/i)).toBeNull();
  });

  it("a API oficial continua a um clique, e dá para voltar ao código", async () => {
    montar();

    fireEvent.click(screen.getByTestId("voltar-para-escolha"));
    await waitFor(() => expect(screen.getByTestId("forma-oficial")).toBeTruthy());

    fireEvent.click(screen.getByTestId("forma-oficial").querySelector("input")!);
    await waitFor(() => expect(screen.getByTestId("dublê-oficial")).toBeTruthy());
  });

  it("as saídas existem na tela do código", () => {
    montar();
    expect(screen.getByRole("button", { name: /pular por enquanto/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /conectei em outro lugar/i })).toBeTruthy();
  });
});

describe("vídeo da conexão", () => {
  it("só aceita https; o resto vira vazio e a tela não mostra vídeo", () => {
    expect(urlDeVideoSegura("https://cdn.exemplo.com/a.mp4")).toBe("https://cdn.exemplo.com/a.mp4");
    expect(urlDeVideoSegura("http://cdn.exemplo.com/a.mp4")).toBe("");
    expect(urlDeVideoSegura("javascript:alert(1)")).toBe("");
    expect(urlDeVideoSegura("não é url")).toBe("");
    expect(urlDeVideoSegura("")).toBe("");
  });

  it("sem URL não renderiza nada", () => {
    const { container } = render(<VideoDaConexao url="" />);
    expect(container.firstChild).toBeNull();
  });

  it("arquivo vira <video>, embed vira <iframe>", () => {
    const a = render(<VideoDaConexao url="https://cdn.exemplo.com/a.mp4" />);
    expect(a.container.querySelector("video")).toBeTruthy();
    a.unmount();
    const b = render(<VideoDaConexao url="https://www.youtube.com/embed/abc" />);
    expect(b.container.querySelector("iframe")).toBeTruthy();
  });
});

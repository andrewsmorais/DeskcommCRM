import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  concluir: vi.fn(async (_respondeu: boolean) => undefined),
  pular: vi.fn(async () => undefined),
}));
vi.mock("@/app/actions/onboarding/marcarTeste", () => ({
  marcarTesteFeito: actions.concluir,
  pularTeste: actions.pular,
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { TestarClient } from "./_client";

const fetchMock = vi.fn<typeof fetch>();

function montar() {
  return render(<TestarClient nome="Sofia" agenteId="agente-1" versaoId="versao-2" />);
}

async function concluir(respondeu: boolean) {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(actions.concluir).toHaveBeenCalledWith(respondeu));
}

beforeEach(() => {
  actions.concluir.mockClear();
  actions.pular.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("onboarding: ver a resposta real do ensaio", () => {
  it.each(["ok", "completed"])(
    "mostra resposta com status %s e registra que respondeu",
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json({ data: { status, final_text: "  Olá! Como posso ajudar?  " } }),
      );
      montar();
      fireEvent.click(screen.getByRole("button", { name: "Mandar mensagem" }));

      expect(await screen.findByText("Olá! Como posso ajudar?")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/ai/agents/agente-1/versions/versao-2/test",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("sample_message"),
        }),
      );
      await concluir(true);
    },
  );

  it("mostra os motivos de bloqueio mesmo que haja texto, sem registrar sucesso", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: {
          status: "blocked",
          final_text: "Esta mensagem não foi liberada.",
          impediments: [{ code: "missing_context", message: "Faltam os materiais necessários." }],
        },
      }),
    );
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Mandar mensagem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Faltam os materiais necessários.");
    expect(screen.queryByText("Sofia respondeu")).toBeNull();
    await concluir(false);
  });

  it("não conta status ok sem resposta efetiva como sucesso", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { status: "ok", final_text: "   " } }));
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Mandar mensagem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não devolveu texto nenhum");
    await concluir(false);
  });

  it("preserva falha do turno e aponta para a configuração dentro do onboarding", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: {
          status: "failed",
          final_text: "Não deve contar.",
          error_message: "Credencial não validada.",
        },
      }),
    );
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Mandar mensagem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Credencial não validada.");
    expect(screen.getByRole("link", { name: "Treinar" })).toHaveAttribute(
      "href",
      "/onboarding/setup-ai",
    );
    await concluir(false);
  });

  it("preserva a orientação de falha HTTP e não registra sucesso", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { message: "Confira a credencial do agente." } }, { status: 422 }),
    );
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Mandar mensagem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Confira a credencial do agente.");
    await concluir(false);
  });

  it("sem versão salva mantém a pendência, permite continuar e liga os passos corretos", async () => {
    render(<TestarClient nome="Sofia" agenteId="agente-1" versaoId={null} />);

    expect(screen.getByRole("status")).toHaveTextContent(/rascunho/i);
    expect(screen.queryByRole("button", { name: "Mandar mensagem" })).toBeNull();
    expect(screen.getByRole("link", { name: "Treinar" })).toHaveAttribute(
      "href",
      "/onboarding/setup-ai",
    );
    expect(screen.getByRole("link", { name: "Conectar WhatsApp" })).toHaveAttribute(
      "href",
      "/onboarding/connect-whatsapp",
    );
    await concluir(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rascunho salvo mostra que não está no ar e permite ensaiar sem publicação", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: { status: "ok", final_text: "Vamos agendar?" } }),
    );
    render(<TestarClient nome="Sofia" agenteId="agente-1" versaoId="draft-1" versaoEmRascunho />);

    expect(screen.getByRole("status")).toHaveTextContent(/rascunho.*ainda não foi para o ar/i);
    fireEvent.click(screen.getByRole("button", { name: "Mandar mensagem" }));
    expect(await screen.findByText("Vamos agendar?")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/ai/agents/agente-1/versions/draft-1/test");
    await concluir(true);
  });

  it("sem agente oferece voltar a treinar e preserva a opção de pular", async () => {
    render(<TestarClient nome={null} agenteId={null} versaoId={null} />);

    expect(screen.getByRole("link", { name: "Treinar" })).toHaveAttribute(
      "href",
      "/onboarding/setup-ai",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pular" }));
    await waitFor(() => expect(actions.pular).toHaveBeenCalledOnce());
  });

  it("falha de leitura da versão pede atualização e não diz que falta configurar", () => {
    render(<TestarClient nome="Sofia" agenteId="agente-1" versaoId={null} falhaAoCarregarVersao />);

    expect(screen.getByRole("alert")).toHaveTextContent("Tente atualizar esta página");
    expect(screen.queryByText("Configure e salve uma versão antes de testar.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mandar mensagem" })).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const createNoteMock = vi.fn();
const uploadMock = vi.fn(async (_args: { conversationId: string; file: File; destino?: string }) => ({
  storage_path: "org/conv-1/note-1.pdf",
  media_mime: "application/pdf",
  media_size_bytes: 3,
  kind: "document" as const,
}));

vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: createNoteMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useGruposDeRespostas: () => ({ data: [], isLoading: false }),
  useMessageTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/inbox/useDraftReply", () => ({
  useDraftReply: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { Composer } from "@/components/inbox/Composer";

function renderComposer() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
}

describe("Composer + modo nota interna", () => {
  beforeEach(() => {
    sendMock.mockClear();
    createNoteMock.mockClear();
  });

  it("modo reply (default): envia normal via useSendMessage", () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText(/mensagem/i), { target: { value: "oi cliente" } });
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "conv-1", body: "oi cliente", type: "text" }),
      expect.anything(),
    );
    expect(createNoteMock).not.toHaveBeenCalled();
  });

  it("limpa o input na hora do envio, sem esperar onSuccess da API", () => {
    sendMock.mockImplementation(() => {
      /* simula request lento — onSuccess não é chamado */
    });
    renderComposer();
    const input = screen.getByLabelText(/mensagem/i);
    fireEvent.change(input, { target: { value: "oi cliente" } });
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    expect(input).toHaveValue("");
  });

  it("alterna pra modo nota interna: some rascunho/áudio, o anexo FICA (vai para a nota), muda placeholder", () => {
    renderComposer();
    expect(screen.getByRole("button", { name: /anexar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sugerir resposta/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));

    // Anexo na nota interna (migration 0547): o "+" continua, e anexa à nota.
    expect(screen.getByRole("button", { name: /anexar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sugerir resposta/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /gravar áudio/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/nota interna/i)).toBeInTheDocument();
  });

  it("modo nota interna: enviar chama useCreateNote e NÃO useSendMessage", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));

    fireEvent.change(screen.getByPlaceholderText(/nota interna/i), { target: { value: "cliente ligou reclamando" } });
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    expect(createNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "conv-1", body: "cliente ligou reclamando" }),
      expect.anything(),
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("anexo em nota interna: sobe pela rota da NOTA e vira nota — nada vai ao cliente", async () => {
    uploadMock.mockClear();
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));
    fireEvent.click(screen.getByRole("button", { name: /anexar/i }));
    const inputDoc = document.querySelector('input[accept^=".pdf"]') as HTMLInputElement;
    const doc = new File([new Uint8Array([1, 2, 3])], "comprovante.pdf", { type: "application/pdf" });
    fireEvent.change(inputDoc, { target: { files: [doc] } });

    expect(await screen.findByText("Anexar à nota interna")).toBeInTheDocument();
    expect(screen.getByTestId("previa-nota-interna")).toHaveTextContent("Só a equipe vê");
    fireEvent.change(screen.getByLabelText(/legenda/i), { target: { value: "comprovante do pix" } });
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    await vi.waitFor(() =>
      expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conv-1", destino: "nota" })),
    );
    await vi.waitFor(() =>
      expect(createNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: "conv-1",
          body: "comprovante do pix",
          anexo: expect.objectContaining({ storage_path: "org/conv-1/note-1.pdf" }),
        }),
        expect.anything(),
      ),
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});

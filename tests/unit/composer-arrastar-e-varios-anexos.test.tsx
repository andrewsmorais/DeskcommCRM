import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Arrastar arquivo para o campo e escolher vários anexos de uma vez (S1).
 *
 * Trazido do produto original (#3708 e #4364), adaptado à fila do fork: os três
 * gestos — "+", Ctrl+V e soltar — caem na MESMA fila, que mostra a prévia um
 * arquivo por vez ("1 de N"). O que estes casos seguram:
 *   - soltar arquivo abre a mesma prévia do "+", e vários soltos viram a fila;
 *   - o `dragover` de arquivo é cancelado (senão o navegador abre o PDF no lugar
 *     da conversa), e o de TEXTO não (o navegador segue dono do gesto);
 *   - caixa travada (janela de 24h fechada) não aceita o drop;
 *   - o realce aparece ao entrar e some ao soltar.
 */

const uploadMock = vi.fn(async ({ file }: { file: File }) => ({
  storage_path: `org/conv/${file.name}`,
  media_mime: file.type,
  media_size_bytes: file.size,
  kind: "document" as const,
}));
const sendMock = vi.fn(
  (_payload: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
);

vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, isPending: false }),
}));

vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => true }));

import { Composer } from "@/components/inbox/Composer";

function pdf(nome: string) {
  return new File([new Uint8Array([1, 2, 3])], nome, { type: "application/pdf" });
}

/** DataTransfer falso: o que o handler lê (`types` e `files`). */
function arrasto(files: File[], types = ["Files"]) {
  return { files, types, dropEffect: "none" } as unknown as DataTransfer;
}

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Composer conversationId="conv-1" {...props} />
    </QueryClientProvider>,
  );
}

const area = () => screen.getByTestId("composer");

describe("Composer — arrastar arquivo", () => {
  beforeEach(() => {
    uploadMock.mockClear();
    sendMock.mockClear();
  });

  it("soltar um arquivo abre a prévia e o envio sobe e manda ESSE arquivo", async () => {
    renderComposer();
    fireEvent.drop(area(), { dataTransfer: arrasto([pdf("contrato.pdf")]) });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    await waitFor(() =>
      expect(uploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: "conv-1", file: expect.objectContaining({ name: "contrato.pdf" }) }),
      ),
    );
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ conversation_id: "conv-1", media_storage_path: "org/conv/contrato.pdf" }),
        expect.anything(),
      ),
    );
  });

  it("vários arquivos soltos de uma vez saem todos, em ordem, um por prévia", async () => {
    renderComposer();
    fireEvent.drop(area(), { dataTransfer: arrasto([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]) });

    expect(await screen.findByText(/1 de 3/)).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(await screen.findByRole("button", { name: /^enviar$/i }));
      await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(i + 1));
    }
    const caminhos = sendMock.mock.calls.map(
      (c) => (c[0] as { media_storage_path: string }).media_storage_path,
    );
    expect(caminhos).toEqual(["org/conv/a.pdf", "org/conv/b.pdf", "org/conv/c.pdf"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("o dragover de ARQUIVO é cancelado — a conversa não vira um PDF na aba", () => {
    renderComposer();
    const seguiu = fireEvent.dragOver(area(), { dataTransfer: arrasto([pdf("x.pdf")]) });
    expect(seguiu).toBe(false);
  });

  it("CONTROLE: arrastar TEXTO não é cancelado nem vira anexo", () => {
    renderComposer();
    const seguiu = fireEvent.dragOver(area(), { dataTransfer: arrasto([], ["text/plain"]) });
    expect(seguiu).toBe(true);
    fireEvent.drop(area(), { dataTransfer: arrasto([], ["text/plain"]) });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("com a janela de 24h fechada o drop não abre prévia nem sobe nada", () => {
    renderComposer({ janelaFechada: "A janela de 24h fechou" } as unknown as Partial<React.ComponentProps<typeof Composer>>);
    const seguiu = fireEvent.dragOver(area(), { dataTransfer: arrasto([pdf("x.pdf")]) });
    expect(seguiu, "recusar o anexo não é deixar o navegador abrir o arquivo").toBe(false);
    fireEvent.drop(area(), { dataTransfer: arrasto([pdf("x.pdf")]) });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("o realce aparece ao entrar com arquivo e some ao soltar", async () => {
    renderComposer();
    fireEvent.dragEnter(area(), { dataTransfer: arrasto([pdf("x.pdf")]) });
    expect(screen.getByTestId("arraste-de-arquivo")).toHaveTextContent("Solte o arquivo para anexar");
    fireEvent.drop(area(), { dataTransfer: arrasto([pdf("x.pdf")]) });
    expect(screen.queryByTestId("arraste-de-arquivo")).not.toBeInTheDocument();
  });

  it("um dragleave de FILHO não apaga o realce; sair de fato apaga", () => {
    renderComposer();
    fireEvent.dragEnter(area(), { dataTransfer: arrasto([pdf("x.pdf")]) });
    fireEvent.dragEnter(area(), { dataTransfer: arrasto([pdf("x.pdf")]) }); // entrou num filho
    fireEvent.dragLeave(area(), { dataTransfer: arrasto([]) }); // saiu do filho
    expect(screen.getByTestId("arraste-de-arquivo")).toBeInTheDocument();
    fireEvent.dragLeave(area(), { dataTransfer: arrasto([]) });
    expect(screen.queryByTestId("arraste-de-arquivo")).not.toBeInTheDocument();
  });
});

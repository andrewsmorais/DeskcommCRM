/**
 * RESPOSTA RÁPIDA COM FOTO: A INTERNET CAI NO MEIO DO ENVIO, E A FOTO NÃO PODE
 * CHEGAR DUAS VEZES AO CLIENTE.
 *
 * O caso: o atendente escolhe a resposta rápida com foto e clica Enviar. O
 * servidor recebe, manda ao WhatsApp — e a resposta se perde no caminho (rede
 * caiu, Wi-Fi trocou). A tela mostra erro e o diálogo continua aberto com
 * "Enviar". Clicar de novo NÃO pode virar uma segunda foto no celular do
 * cliente.
 *
 * O que impede: (1) o arquivo já subido não sobe de novo — o retry usa o MESMO
 * caminho no Storage; (2) com o mesmo conteúdo, o envio repete a MESMA chave de
 * idempotência, e o servidor devolve o recibo do primeiro em vez de mandar de
 * novo (`app/api/v1/messages/route.ts`, `lib/api/idempotency.ts`).
 *
 * Também cobre o caso do produto original (#2526): numa resposta com duas
 * fotos, se a 2ª falha, o retry não reenvia a 1ª nem repete a legenda.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ApiClientModule from "@/lib/api/client";

const h = vi.hoisted(() => ({
  falharUploadNaChamada: 0,
  uploads: 0,
  falharPostNaChamada: 0,
  posts: 0,
}));

const uploadMock = vi.fn(async ({ file }: { file: File }) => {
  h.uploads += 1;
  if (h.uploads === h.falharUploadNaChamada) throw new Error("upload_failed");
  // Cada subida ganha um caminho NOVO no Storage, como na rota real.
  return { storage_path: `org/conv/out-${h.uploads}-${file.name}`, media_mime: "image/jpeg", media_size_bytes: 3, kind: "image" as const };
});

// O envio de verdade (useSendMessage real): só o apiClient é dublê.
const postMock = vi.fn(async (_url: string, body: unknown, _opts?: { idempotencyKey?: string; timeoutMs?: number }) => {
  h.posts += 1;
  if (h.posts === h.falharPostNaChamada) throw new TypeError("Failed to fetch");
  return { data: { id: `m-${h.posts}`, conversation_id: "conv-1", ...(body as object) } };
});

vi.mock("@/lib/api/client", async (orig) => {
  const real = await orig<typeof ApiClientModule>();
  return { ...real, apiClient: { ...real.apiClient, post: (...a: Parameters<typeof postMock>) => postMock(...a) } };
});
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useGruposDeRespostas: () => ({ data: [] }),
  useMessageTemplates: () => ({
    data: [
      {
        id: "tpl-1",
        title: "Catalogo",
        body: "Veja o modelo",
        shortcut: "cat",
        owner_user_id: null,
        midias: [
          { storage_path: "o/templates/tpl-1/a.jpg", media_mime: "image/jpeg", media_size_bytes: 3 },
          { storage_path: "o/templates/tpl-1/b.jpg", media_mime: "image/jpeg", media_size_bytes: 3 },
        ],
      },
    ],
  }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  usePermission: () => true,
  useActiveOrg: () => ({ orgId: "org-1", role: "agent" }),
  useUser: () => ({ id: "u-1" }),
  usePaisDaOrgAtiva: () => null,
}));

import { Composer } from "@/components/inbox/Composer";
import { TETO_DE_MIDIA_MS } from "@/lib/waha/teto-de-midia";

async function escolherResposta() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "/cat" } });
  fireEvent.click(await within(await screen.findByRole("listbox")).findByText("Catalogo"));
  await screen.findByRole("dialog");
}

const enviar = () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^enviar$/i }));
const envios = () =>
  postMock.mock.calls.map(([, body, opts]) => ({
    caminho: (body as { media_storage_path?: string }).media_storage_path,
    legenda: (body as { body?: string }).body,
    chave: opts?.idempotencyKey,
  }));

beforeEach(() => {
  h.uploads = 0;
  h.falharUploadNaChamada = 0;
  h.posts = 0;
  h.falharPostNaChamada = 0;
  uploadMock.mockClear();
  postMock.mockClear();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  })) as never;
});

describe("resposta rápida com foto — a internet cai no meio do envio", () => {
  it("o retry da MESMA foto não sobe o arquivo de novo e repete a MESMA chave", async () => {
    h.falharPostNaChamada = 1; // o primeiro envio "se perde" na volta
    await escolherResposta();

    enviar();
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    // O diálogo continua aberto, na mesma foto, com a legenda.
    await waitFor(() => expect(screen.getByText("1 de 2")).toBeInTheDocument());

    enviar(); // o atendente tenta de novo
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));

    const [primeiro, segundo] = envios();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(segundo!.caminho).toBe(primeiro!.caminho);
    expect(segundo!.chave).toBe(primeiro!.chave);
    expect(segundo!.legenda).toBe("Veja o modelo");
  });

  it("depois que a 1ª foto saiu, a 2ª é envio novo: outro arquivo, outra chave, sem legenda", async () => {
    await escolherResposta();
    enviar();
    await waitFor(() => expect(screen.getByText("2 de 2")).toBeInTheDocument());
    enviar();
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));
    const [a, b] = envios();
    expect(b!.caminho).not.toBe(a!.caminho);
    expect(b!.chave).not.toBe(a!.chave);
    expect([a!.legenda, b!.legenda]).toEqual(["Veja o modelo", undefined]);
  });

  it("a 2ª foto falha no upload: o retry não reenvia a 1ª nem repete a legenda (#2526)", async () => {
    h.falharUploadNaChamada = 2;
    await escolherResposta();
    enviar();
    await waitFor(() => expect(screen.getByText("2 de 2")).toBeInTheDocument());
    enviar(); // upload da 2ª falha
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
    enviar(); // retry
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));
    expect(envios().map((e) => e.legenda)).toEqual(["Veja o modelo", undefined]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("envio com mídia espera mais que o prazo padrão: a tela não desiste antes do servidor", async () => {
    await escolherResposta();
    enviar();
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0]![2]?.timeoutMs).toBeGreaterThan(TETO_DE_MIDIA_MS);
  });
});

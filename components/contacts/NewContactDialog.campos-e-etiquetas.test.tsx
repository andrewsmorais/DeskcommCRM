/**
 * Novo contato: campos personalizados do funil e etiquetas sugeridas ao digitar.
 * Roda o diálogo de verdade, com o `fetch` devolvendo o funil padrão (com um campo
 * obrigatório) e o vocabulário de etiquetas da organização.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewContactDialog } from "@/components/contacts/NewContactDialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useOrgAtivaId: () => "org-1" }));

const posts: Array<Record<string, unknown>> = [];

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  posts.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/v1/pipelines/default")) {
        return json({
          data: {
            pipeline: {
              id: "p1",
              settings: {
                fields: [
                  { key: "empresa", label: "Empresa", type: "text", required: true },
                  { key: "cidade", label: "Cidade", type: "text" },
                ],
              },
            },
            stages: [],
          },
        });
      }
      if (String(url).includes("/api/v1/contact-tags")) return json({ data: ["vip", "recompra", "novo-cliente"] });
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return json({ data: { contact: { id: "c1" }, action: "created" } }, 201);
      }
      return json({ data: [] });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NewContactDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("NewContactDialog · campos do funil e etiquetas sugeridas", () => {
  it("mostra os campos do funil e grava os preenchidos em custom_fields", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(await screen.findByLabelText(/Empresa/), "Padaria Sol");
    await user.type(screen.getByLabelText(/Telefone/i), "+5511999998888");
    await user.click(screen.getByRole("button", { name: /Criar contato/i }));
    await waitFor(() => expect(posts).toHaveLength(1));
    // `cidade` ficou vazio: não vira chave.
    expect(posts[0]).toMatchObject({ custom_fields: { empresa: "Padaria Sol" } });
    expect((posts[0]!.custom_fields as Record<string, unknown>).cidade).toBeUndefined();
  });

  it("campo obrigatório vazio avisa e não chama o servidor", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByLabelText(/Empresa/);
    await user.type(screen.getByLabelText(/Telefone/i), "+5511999998888");
    await user.click(screen.getByRole("button", { name: /Criar contato/i }));
    expect(await screen.findByText(/Preencha o campo "Empresa"/)).toBeTruthy();
    expect(posts).toHaveLength(0);
  });

  it("sugere etiquetas ao digitar e o toque completa a parte em edição", async () => {
    const user = userEvent.setup();
    montar();
    const campo = (await screen.findByLabelText(/Tags/)) as HTMLInputElement;
    await user.type(campo, "vip, re");
    const sugestao = await screen.findByRole("button", { name: "+ recompra" });
    expect(screen.queryByRole("button", { name: "+ vip" })).toBeNull();
    await user.click(sugestao);
    expect(campo.value).toBe("vip, recompra, ");
  });
});

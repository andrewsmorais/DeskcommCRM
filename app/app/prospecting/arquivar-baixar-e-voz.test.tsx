/**
 * Prospecção — os três gestos vindos do produto original, pela tela:
 *
 * 1. ARQUIVAR (#4359): a campanha arquivada sai de "Suas campanhas" e aparece em
 *    "Ver arquivadas"; nunca nos dois lugares, nunca em nenhum. Arquivada não
 *    oferece "Retomar fila" (voltaria a enviar escondida).
 * 2. BAIXAR LISTA (#4360): o número do botão usa a MESMA régua da rota do arquivo
 *    — só quem ainda não recebeu mensagem.
 * 3. SUA VOZ: o formulário só aparece com o valor gravado em mãos, e o Salvar
 *    grava pela rota da organização.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api/client";

import { ProspectingClient } from "./_client";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const ATIVA = "11111111-1111-4111-8111-111111111111";
const ARQUIVADA = "22222222-2222-4222-8222-222222222222";
const CONFIG = {
  agent_id: "a",
  channel_session_id: "c",
  pipeline_id: "p",
  stage_id: "s1",
  qualified_stage_id: "s2",
  instruction: "Oferecer atendimento",
  qualification: "Tem interesse",
  daily_limit: 10,
  interval_minutes: 15,
  legal_basis_ref: "legítimo interesse",
};

function empresa(nome: string, phone: string | null) {
  return {
    key: nome,
    name: nome,
    phone,
    website: null,
    category: null,
    address: null,
    maps_url: null,
    rating: null,
    reviews: null,
    emails: [],
    socials: [],
  };
}

function candidato(id: string, campanha: string, status: string, attempted_at: string | null, phone: string | null) {
  return {
    id,
    campaign_id: campanha,
    data: empresa(id, phone),
    status,
    attempted_at,
    progress: status,
    message_status: null,
    error: null,
    conversation_id: null,
  };
}

const ESTADO = {
  configured: true,
  campaigns: [
    { id: ATIVA, name: "Clínicas SP", status: "paused", search_status: "succeeded", error: null, config: CONFIG, arquivada_em: null, result_count: 3, skipped_count: 0, cost_usd: null, next_send_at: "2026-11-14T10:00:00Z" },
    { id: ARQUIVADA, name: "Busca zerada", status: "paused", search_status: "succeeded", error: null, config: CONFIG, arquivada_em: "2026-11-10T10:00:00Z", result_count: 0, skipped_count: 0, cost_usd: null, next_send_at: "2026-11-14T10:00:00Z" },
  ],
  candidates: [
    candidato("a", ATIVA, "queued", null, "+5511988880001"),
    candidato("b", ATIVA, "sent", "2026-11-12T10:00:00Z", "+5511988880002"),
    candidato("c", ATIVA, "new", null, null),
  ],
  agents: [],
  channels: [],
  stages: [],
};

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProspectingClient />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === "/api/v1/settings/prospeccao")
      return { data: { personalizacao: { vendedor_nome: "Ana" } } } as never;
    return { data: ESTADO } as never;
  });
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
  vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("prospecção — arquivar, baixar lista e voz", () => {
  it("a arquivada não aparece na lista principal; aparece em 'Ver arquivadas', sem Retomar", async () => {
    renderizar();
    expect(await screen.findByRole("heading", { name: "Clínicas SP" })).toBeTruthy();
    expect(screen.queryByText("Busca zerada")).toBeNull();
    // A ativa está pausada e não arquivada: oferece retomar.
    expect(screen.getByRole("button", { name: "Retomar fila" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ver arquivadas (1)" }));
    expect(await screen.findByRole("heading", { name: "Busca zerada" })).toBeTruthy();
    expect(screen.queryByText("Clínicas SP")).toBeNull();
    expect(screen.getByText("Arquivada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retomar fila" })).toBeNull();
    expect(screen.getByRole("button", { name: "Desarquivar" })).toBeTruthy();
  });

  it("Arquivar manda a ação pela rota da prospecção", async () => {
    renderizar();
    fireEvent.click(await screen.findByRole("button", { name: "Arquivar" }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith("/api/v1/prospecting", { action: "arquivar", id: ATIVA }),
    );
  });

  it("'Baixar lista' conta só quem ainda não recebeu mensagem e tem telefone", async () => {
    renderizar();
    // a: na fila com telefone (entra) · b: já abordada · c: sem telefone.
    expect(await screen.findByRole("button", { name: "Baixar lista (1)" })).toBeTruthy();
  });

  it("'Sua voz' abre com o valor gravado e salva pela rota da organização", async () => {
    renderizar();
    const nome = (await screen.findByLabelText("Seu nome")) as HTMLInputElement;
    expect(nome.value).toBe("Ana");
    fireEvent.change(screen.getByLabelText("O que você faz"), {
      target: { value: "IA para clínicas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar minha voz" }));
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith("/api/v1/settings/prospeccao", {
        vendedor_nome: "Ana",
        vendedor_apresentacao: "IA para clínicas",
        vendedor_diferencial: undefined,
      }),
    );
  });
});

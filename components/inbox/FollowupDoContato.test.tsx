/**
 * O follow-up na conversa (vindo do produto original): a seção some sem nada
 * rodando, mostra o que está vivo com "Parar" para quem pode, e oferece
 * "Iniciar" só quando o servidor diz `pode_inscrever`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { FollowupDoContato } from "./FollowupDoContato";

const CONTATO = "11111111-1111-4111-8111-111111111111";
const FLUXO = { id: "22222222-2222-4222-8222-222222222222", name: "Reativação", status: "active", active_version_id: "v1" };

function responder(enrollments: unknown[], podeInscrever: boolean, fluxos: unknown[] = [FLUXO]) {
  get.mockImplementation(async (url: string) =>
    url.includes("/enrollments")
      ? { data: enrollments, meta: { pode_inscrever: podeInscrever } }
      : { data: fluxos },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FollowupDoContato", () => {
  it("sem follow-up vivo e sem fluxo ativo, a seção não aparece", async () => {
    responder([], true, []);
    const { container } = render(<FollowupDoContato contactId={CONTATO} somenteLeitura={false} podeParar />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelector('[data-testid="inbox-followup"]')).toBeNull());
  });

  it("follow-up vivo aparece com o nome do fluxo e o botão Parar", async () => {
    responder(
      [{ id: "e1", pointer_id: FLUXO.id, contact_id: CONTATO, status: "active", started_at: "2026-11-14T10:00:00Z", updated_at: "2026-11-14T10:00:00Z" }],
      true,
    );
    render(<FollowupDoContato contactId={CONTATO} somenteLeitura={false} podeParar />);
    expect(await screen.findByText("Reativação")).toBeTruthy();
    fireEvent.click(screen.getByTestId("parar-followup"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/ai/followups/enrollments/e1/cancel", {}));
  });

  it("Iniciar só aparece quando o servidor diz que pode, e manda só fluxo + contato", async () => {
    responder([], false);
    const { unmount } = render(<FollowupDoContato contactId={CONTATO} somenteLeitura={false} podeParar={false} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("iniciar-followup")).toBeNull();
    unmount();

    responder([], true);
    render(<FollowupDoContato contactId={CONTATO} somenteLeitura={false} podeParar={false} />);
    const escolha = await screen.findByTestId("escolher-fluxo-followup");
    fireEvent.change(escolha, { target: { value: FLUXO.id } });
    fireEvent.click(screen.getByTestId("iniciar-followup"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/ai/followups/enrollments", { pointer_id: FLUXO.id, contact_id: CONTATO }),
    );
  });
});

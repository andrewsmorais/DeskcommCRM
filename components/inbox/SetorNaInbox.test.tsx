/**
 * Setores de atendimento (migration 0496) na Inbox:
 *   - o filtro de setor só aparece quando a empresa tem setores, e escolher um
 *     manda `setor_id` para a lista;
 *   - o Transferir ganha a aba "Setor": manda a conversa ao setor escolhido, ou
 *     a tira do setor atual (só quando há um).
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const VENDAS = "aaaaaaaa-0000-4000-8000-00000000000a";
const SUPORTE = "aaaaaaaa-0000-4000-8000-00000000000b";
const mudar = vi.fn();
const estado: { setores: { id: string; nome: string; descricao: null; membros: string[] }[] } = {
  setores: [],
};

vi.mock("@/hooks/inbox/useSetores", () => ({
  useSetores: () => ({ data: estado.setores }),
  useMudarSetorDaConversa: () => ({ mutate: mudar, isPending: false }),
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  useChannelSessions: () => ({ data: [], isLoading: false, isError: false }),
  channelLabel: () => "?",
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "eu" },
    activeOrg: { orgId: "org-1", role: "manager", visibility_mode: "all" },
  }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/inbox/useTransferConversation", () => ({
  useTransferConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useContinuarPorOutroNumero", () => ({
  useContinuarPorOutroNumero: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: {} }),
}));

// O Select do Radix não abre em jsdom (pointer capture): vira uma lista de
// botões com o mesmo contrato, como em NumeroForaDoAr.test.tsx.
vi.mock("@/components/ui/select", () => {
  const Ctx = React.createContext<(v: string) => void>(() => {});
  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (v: string) => void;
      children: React.ReactNode;
    }) => <Ctx.Provider value={onValueChange}>{children}</Ctx.Provider>,
    SelectTrigger: ({ children, ...rest }: { children: React.ReactNode }) => (
      <div {...rest}>{children}</div>
    ),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({
      value,
      disabled,
      children,
    }: {
      value: string;
      disabled?: boolean;
      children: React.ReactNode;
    }) => {
      const escolher = React.useContext(Ctx);
      return (
        <button
          type="button"
          role="option"
          aria-selected={false}
          disabled={disabled}
          onClick={() => escolher(value)}
        >
          {children}
        </button>
      );
    },
  };
});

import { InboxFilters, type InboxFiltersValue } from "./InboxFilters";
import { ReassignDialog } from "./ReassignDialog";

const VALOR: InboxFiltersValue = { tab: "all", search: "", onlyUnread: false };
const setor = (id: string, nome: string) => ({ id, nome, descricao: null, membros: [] });

describe("filtro de setor", () => {
  beforeEach(() => {
    estado.setores = [];
  });

  it("sem setores, o filtro não aparece", () => {
    render(<InboxFilters value={VALOR} onChange={vi.fn()} />);
    expect(screen.queryByTestId("filtro-setor")).toBeNull();
  });

  it("com setores, escolher um manda o setor_id; 'Todos' tira o filtro", async () => {
    estado.setores = [setor(VENDAS, "Vendas"), setor(SUPORTE, "Suporte")];
    const onChange = vi.fn();
    render(<InboxFilters value={{ ...VALOR, setor_id: SUPORTE }} onChange={onChange} />);
    expect(screen.getByTestId("filtro-setor")).toBeTruthy();
    await userEvent.click(screen.getByRole("option", { name: "Vendas" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ setor_id: VENDAS }));
    await userEvent.click(screen.getByRole("option", { name: "Todos os setores" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ setor_id: undefined }));
  });

  it("filtro ligado num setor que foi excluído continua visível e nomeado", () => {
    estado.setores = [setor(VENDAS, "Vendas")];
    render(<InboxFilters value={{ ...VALOR, setor_id: SUPORTE }} onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Setor removido" })).toBeTruthy();
  });
});

describe("Transferir → aba Setor", () => {
  beforeEach(() => {
    mudar.mockReset();
    estado.setores = [setor(VENDAS, "Vendas"), setor(SUPORTE, "Suporte")];
  });

  it("manda a conversa ao setor escolhido; o setor atual não é escolhível", async () => {
    render(
      <ReassignDialog conversationId="conv-1" open onOpenChange={vi.fn()} setorAtual={VENDAS} />,
    );
    await userEvent.click(screen.getByTestId("aba-transferir-setor"));
    expect(screen.getByRole("option", { name: /Vendas/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("option", { name: "Suporte" }));
    await userEvent.click(screen.getByTestId("btn-enviar-ao-setor"));
    expect(mudar).toHaveBeenCalledWith(
      { conversation_id: "conv-1", setor_id: SUPORTE },
      expect.anything(),
    );
  });

  it("'Tirar do setor' só existe quando a conversa tem setor, e manda null", async () => {
    const { unmount } = render(
      <ReassignDialog conversationId="conv-1" open onOpenChange={vi.fn()} setorAtual={null} />,
    );
    await userEvent.click(screen.getByTestId("aba-transferir-setor"));
    expect(screen.queryByRole("option", { name: "Tirar do setor" })).toBeNull();
    unmount();

    render(
      <ReassignDialog conversationId="conv-1" open onOpenChange={vi.fn()} setorAtual={VENDAS} />,
    );
    await userEvent.click(screen.getByTestId("aba-transferir-setor"));
    await userEvent.click(screen.getByRole("option", { name: "Tirar do setor" }));
    await userEvent.click(screen.getByTestId("btn-enviar-ao-setor"));
    expect(mudar).toHaveBeenCalledWith(
      { conversation_id: "conv-1", setor_id: null },
      expect.anything(),
    );
  });

  it("sem setores, a aba não aparece", () => {
    estado.setores = [];
    render(<ReassignDialog conversationId="conv-1" open onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("aba-transferir-setor")).toBeNull();
  });
});

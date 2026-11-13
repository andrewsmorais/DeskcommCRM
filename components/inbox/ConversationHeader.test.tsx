import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "./ConversationHeader";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * "Fechar" e "Arquivar" usavam `window.confirm()` — mesmo defeito documentado
 * em `app/app/tasks/_components/ListaDeTarefas.tsx`: bloqueado em iframe,
 * ignora o tema, não passa por `t()`. Agora usam o `AlertDialog` da casa
 * (docs/doctrine/destrutivo-pede-confirmacao.md): o botão só ABRE o diálogo,
 * a mutação só dispara no clique de DENTRO dele.
 */

const closeMutate = vi.hoisted(() => vi.fn());
const arquivarMutate = vi.hoisted(() => vi.fn());
const startCall = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: null } }),
  // O cadeado da conversa privada (migration 0495) pergunta por "inbox.privacy.any".
  usePermission: () => false,
}));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Setores (migration 0496): sem setor nenhum a tela é a de antes.
vi.mock("@/hooks/inbox/useSetores", () => ({
  useSetores: () => ({ data: [] }),
  useMudarSetorDaConversa: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: closeMutate, isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: arquivarMutate, isPending: false }),
}));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/usePauseAiAttendance", () => ({
  usePauseAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({
  useAutomaticoAtivo: () => ({ data: false }),
}));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));
vi.mock("@/components/inbox/ReassignDialog", () => ({ ReassignDialog: () => null }));
vi.mock("@/components/inbox/SnoozeButton", () => ({ SnoozeButton: () => null }));
vi.mock("@/components/inbox/IniciarChatbotButton", () => ({ IniciarChatbotButton: () => null }));
// Configurações › Conversas: o comportamento do Fechar muda por teste.
let comportamentoDoFechar = "atendente_escolhe";
vi.mock("@/hooks/inbox/usePreferenciasDeConversa", () => ({
  usePreferenciasDeConversa: () => ({
    data: {
      assinatura: "atendente_escolhe",
      finalizar: {
        comportamento: comportamentoDoFechar,
        mensagem_padrao: "Obrigado! Até a próxima.",
        chatbot_padrao: null,
      },
      meu: { nome: "Ana", assinatura: null, mensagem_de_finalizacao: null },
    },
  }),
  lerAssinarLembrado: () => false,
}));
// Os chatbots de início manual (o chatbot de encerramento do Fechar).
vi.mock("@/hooks/inbox/useChatbotManual", () => ({
  useChatbotsManuais: () => ({ data: [{ id: "fluxo-1", name: "Pesquisa de satisfação", is_active: true }] }),
}));
vi.mock("@/components/inbox/JanelaSelo", () => ({ JanelaSelo: () => null }));
vi.mock("@/components/inbox/ChannelLogo", () => ({ ChannelLogo: () => null }));
vi.mock("@/hooks/voice/useVoiceSessionStatus", () => ({
  useVoiceSessionStatus: () => ({ data: { configured: true, paired: true } }),
}));
vi.mock("@/components/voice/VoiceCallContext", () => ({
  useVoiceCall: () => ({ call: null, startCall }),
}));

function conversa(status: string): ConversationWithContact {
  return {
    id: "conv-1",
    organization_id: "org-1",
    contact_id: "contato-1",
    channel_session_id: "sess-1",
    channel: "whatsapp",
    status,
    status_changed_at: new Date().toISOString(),
    service_revision: 3,
    assigned_to_user_id: null,
    assigned_to_user_name: null,
    assignee_kind: null,
    assigned_at: null,
    last_inbound_at: null,
    last_outbound_at: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count_for_assignee: 0,
    is_group: false,
    group_chat_id: null,
    tags: [],
    metadata: {},
    snooze_until: null,
    contacts: null,
    channel_sessions: null,
  } as unknown as ConversationWithContact;
}

beforeEach(() => {
  comportamentoDoFechar = "atendente_escolhe";
  closeMutate.mockReset();
  arquivarMutate.mockReset();
  startCall.mockReset();
});

describe("ConversationHeader — chamada de voz na Inbox", () => {
  it("mostra Chamar e liga para o contato da conversa", async () => {
    const user = userEvent.setup();
    const atual = conversa("open");
    atual.contacts = {
      id: "contato-1",
      display_name: "Raphael",
      name: "Raphael",
      phone_number: "+5511999999999",
      tags: [],
      is_blocked: false,
      is_anonymized: false,
    };
    render(<ConversationHeader conversation={atual} />);

    await user.click(screen.getByRole("button", { name: "Chamar" }));
    expect(startCall).toHaveBeenCalledWith("contato-1");
  });

  it("não oferece chamada individual para um grupo", () => {
    const atual = conversa("open");
    atual.is_group = true;
    atual.contacts = {
      id: "contato-1",
      display_name: "Grupo",
      name: "Grupo",
      phone_number: "+5511999999999",
      tags: [],
      is_blocked: false,
      is_anonymized: false,
    };
    render(<ConversationHeader conversation={atual} />);
    expect(screen.queryByRole("button", { name: "Chamar" })).toBeNull();
  });
});

describe("ConversationHeader — Fechar com despedida ou chatbot de encerramento", () => {
  it("despedida: o botão só libera com texto, e o Fechar leva a mensagem junto", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    const dialogo = await screen.findByRole("alertdialog");

    await user.click(within(dialogo).getByTestId("encerramento-mensagem"));
    // Abre com a despedida padrão da empresa; apagada, o botão trava.
    expect((within(dialogo).getByRole("textbox") as HTMLTextAreaElement).value).toBe("Obrigado! Até a próxima.");
    await user.clear(within(dialogo).getByRole("textbox"));
    const fechar = within(dialogo).getByRole("button", { name: "Fechar" });
    expect((fechar as HTMLButtonElement).disabled).toBe(true);

    await user.type(within(dialogo).getByRole("textbox"), "Obrigado pelo contato!");
    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(closeMutate).toHaveBeenCalledTimes(1));
    expect(closeMutate).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      expected_revision: 3,
      encerramento: { tipo: "mensagem", texto: "Obrigado pelo contato!" },
    });
  });

  it("chatbot de encerramento: escolhe o fluxo e o botão vira Acionar chatbot", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    const dialogo = await screen.findByRole("alertdialog");

    await user.click(within(dialogo).getByTestId("encerramento-chatbot"));
    expect((within(dialogo).getByRole("button", { name: "Acionar chatbot" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.selectOptions(within(dialogo).getByRole("combobox"), "fluxo-1");
    await user.click(within(dialogo).getByRole("button", { name: "Acionar chatbot" }));

    await waitFor(() => expect(closeMutate).toHaveBeenCalledTimes(1));
    expect(closeMutate.mock.calls[0]?.[0]).toEqual({
      conversation_id: "conv-1",
      expected_revision: 3,
      encerramento: { tipo: "chatbot", chatbot_flow_id: "fluxo-1" },
    });
  });
});

describe("ConversationHeader — o Fechar obedece a Configurações › Conversas", () => {
  it("empresa exige despedida: a janela já abre com a mensagem padrão e sem opções", async () => {
    comportamentoDoFechar = "mensagem";
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).queryByTestId("encerramento-nenhum")).toBeNull();
    expect((within(dialogo).getByRole("textbox") as HTMLTextAreaElement).value).toBe("Obrigado! Até a próxima.");
    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledTimes(1));
    expect(closeMutate.mock.calls[0]?.[0]).toMatchObject({
      encerramento: { tipo: "mensagem", texto: "Obrigado! Até a próxima." },
    });
  });

  it("empresa só finaliza: nenhuma opção de despedida ou chatbot", async () => {
    comportamentoDoFechar = "so_finalizar";
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).queryByTestId("encerramento-mensagem")).toBeNull();
    expect(within(dialogo).queryByTestId("encerramento-chatbot")).toBeNull();
  });
});

describe("ConversationHeader — Fechar e Arquivar por AlertDialog", () => {
  it("Fechar pede confirmação e só encerra no clique de dentro do diálogo", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);

    await user.click(screen.getByRole("button", { name: "Fechar" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Fechar esta conversa?")).toBeTruthy();
    expect(closeMutate).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(closeMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    const dialogo2 = await screen.findByRole("alertdialog");
    await user.click(within(dialogo2).getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(closeMutate).toHaveBeenCalledTimes(1));
    expect(closeMutate).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      expected_revision: 3,
    });
  });

  it("Arquivar, numa conversa aberta, avisa que o atendimento é encerrado junto", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);

    await user.click(screen.getByRole("button", { name: "Arquivar" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Arquivar esta conversa?")).toBeTruthy();
    expect(
      within(dialogo).getByText(
        "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
      ),
    ).toBeTruthy();
    expect(arquivarMutate).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Arquivar" }));
    await waitFor(() => expect(arquivarMutate).toHaveBeenCalledTimes(1));
    expect(arquivarMutate).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      expected_revision: 3,
    });
  });

  it("Arquivar, numa conversa já encerrada, não repete o aviso de encerramento", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("closed")} />);

    await user.click(screen.getByRole("button", { name: "Arquivar" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Arquivar esta conversa?")).toBeTruthy();
    expect(
      screen.queryByText(
        "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
      ),
    ).toBeNull();
  });
});

describe("ConversationHeader — busca dentro da conversa (#1793)", () => {
  it("o botão só existe com quem o atenda, e só abre a busca — nenhuma ação de atendimento", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ConversationHeader conversation={conversa("open")} />);
    expect(screen.queryByRole("button", { name: "Buscar nesta conversa" })).toBeNull();

    const buscar = vi.fn();
    rerender(
      <ConversationHeader conversation={conversa("open")} onBuscar={buscar} buscaAberta={false} />,
    );
    const botao = screen.getByRole("button", { name: "Buscar nesta conversa" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    await user.click(botao);
    expect(buscar).toHaveBeenCalledOnce();
    expect(closeMutate).not.toHaveBeenCalled();
    expect(arquivarMutate).not.toHaveBeenCalled();
  });
});

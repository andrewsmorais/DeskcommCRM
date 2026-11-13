import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { requireRole } from "@/lib/auth/require-role";
import { pedirChatbotManual } from "@/lib/chatbot/iniciar-manual";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { POST } from "./route";

/**
 * FECHAR COM DESPEDIDA OU CHATBOT DE ENCERRAMENTO — a ordem dos efeitos.
 *
 * O que este arquivo segura, e que a tela não consegue provar sozinha:
 *   - despedida que não sai NÃO encerra (fechar sem a despedida pedida é
 *     fechar a porta na cara do cliente sem ele saber);
 *   - revisão velha NÃO manda despedida (a trava vale antes do efeito);
 *   - chatbot de encerramento NÃO encerra aqui — quem encerra é o passo
 *     "Finalizar conversa" do fluxo, e o fluxo é exigido com esse passo;
 *   - sem encerramento, a rota segue exatamente como era.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));
vi.mock("@/lib/chatbot/iniciar-manual", () => ({ pedirChatbotManual: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

const ORG = "40000000-0000-4000-8000-000000000001";
const CONV = "40000000-0000-4000-8000-000000000002";
const USER = "40000000-0000-4000-8000-000000000003";
const FLUXO = "40000000-0000-4000-8000-000000000004";

let revisaoNoBanco = 3;
const rpc = vi.fn();

/** Client do usuário: só lê a conversa (id, org, revisão). */
function clienteDoUsuario() {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({
      data: { id: CONV, organization_id: ORG, service_revision: revisaoNoBanco },
      error: null,
    }),
  };
  return { from: () => consulta };
}

function pedido(corpo: unknown) {
  return new Request(`http://localhost/api/v1/conversations/${CONV}/close`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }) as unknown as NextRequest;
}
const contexto = { params: Promise.resolve({ id: CONV }) };

beforeEach(() => {
  vi.clearAllMocks();
  revisaoNoBanco = 3;
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER, idioma: "pt-BR" },
    org: { orgId: ORG, role: "agent" },
  } as never);
  vi.mocked(createClient).mockResolvedValue(clienteDoUsuario() as never);
  rpc.mockResolvedValue({ data: { id: CONV, organization_id: ORG, status: "closed" }, error: null });
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
});

describe("POST /conversations/[id]/close — encerramento", () => {
  it("sem encerramento: só fecha, como sempre foi", async () => {
    const r = await POST(pedido({ expected_revision: 3 }), contexto);
    expect(r.status).toBe(200);
    expect(sendMessageHandler).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("fn_service_status", expect.objectContaining({ p_status: "closed", p_expected: 3 }));
  });

  it("despedida: sai em nome de quem fechou e só DEPOIS encerra, na revisão de agora", async () => {
    vi.mocked(sendMessageHandler).mockImplementation(async () => {
      revisaoNoBanco = 4; // a resposta humana mexeu no atendimento
      return { status: "sending" } as never;
    });
    const r = await POST(
      pedido({ expected_revision: 3, encerramento: { tipo: "mensagem", texto: "  Obrigado!  " } }),
      contexto,
    );
    expect(r.status).toBe(200);
    const [, ctxDoEnvio, corpo] = vi.mocked(sendMessageHandler).mock.calls[0]!;
    expect(ctxDoEnvio).toMatchObject({ organization_id: ORG, actor: { type: "user", id: USER, role: "agent" } });
    expect(corpo).toMatchObject({ conversation_id: CONV, type: "text", body: "Obrigado!" });
    expect(vi.mocked(sendMessageHandler).mock.invocationCallOrder[0]!).toBeLessThan(rpc.mock.invocationCallOrder[0]!);
    expect(rpc).toHaveBeenCalledWith("fn_service_status", expect.objectContaining({ p_expected: 4 }));
  });

  it("despedida que não sai: 422 e a conversa continua aberta", async () => {
    vi.mocked(sendMessageHandler).mockResolvedValue({ status: "failed" } as never);
    const r = await POST(pedido({ encerramento: { tipo: "mensagem", texto: "Tchau" } }), contexto);
    expect(r.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("despedida que lança: 422 e a conversa continua aberta", async () => {
    vi.mocked(sendMessageHandler).mockRejectedValue(new Error("WhatsApp desconectado"));
    const r = await POST(pedido({ encerramento: { tipo: "mensagem", texto: "Tchau" } }), contexto);
    expect(r.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("revisão velha: 409 e NENHUMA despedida sai", async () => {
    revisaoNoBanco = 5;
    const r = await POST(
      pedido({ expected_revision: 3, encerramento: { tipo: "mensagem", texto: "Tchau" } }),
      contexto,
    );
    expect(r.status).toBe(409);
    expect(sendMessageHandler).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("despedida vazia é recusada antes de qualquer efeito", async () => {
    const r = await POST(pedido({ encerramento: { tipo: "mensagem", texto: "   " } }), contexto);
    expect(r.status).toBe(422);
    expect(sendMessageHandler).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("chatbot de encerramento: aciona exigindo o passo Finalizar e NÃO encerra", async () => {
    vi.mocked(pedirChatbotManual).mockResolvedValue({
      ok: true,
      conversationId: CONV,
      contactId: "c",
      flowId: FLUXO,
    });
    const r = await POST(pedido({ encerramento: { tipo: "chatbot", chatbot_flow_id: FLUXO } }), contexto);
    expect(r.status).toBe(200);
    expect(vi.mocked(pedirChatbotManual).mock.calls[0]![2]).toMatchObject({
      orgId: ORG,
      conversationId: CONV,
      flowId: FLUXO,
      userId: USER,
      exigirFinalizar: true,
    });
    expect(rpc).not.toHaveBeenCalled();
    const corpo = (await r.json()) as { data: { encerramento: string } };
    expect(corpo.data.encerramento).toBe("chatbot");
  });

  it("chatbot recusado (sem o passo Finalizar, por exemplo): devolve o erro e não encerra", async () => {
    vi.mocked(pedirChatbotManual).mockResolvedValue({
      ok: false,
      status: 422,
      code: "validation_failed",
      mensagem: 'O chatbot de encerramento precisa ter o passo "Finalizar conversa", que é quem encerra o atendimento.',
    });
    const r = await POST(pedido({ encerramento: { tipo: "chatbot", chatbot_flow_id: FLUXO } }), contexto);
    expect(r.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { AgentRow } from "@/hooks/ai/useAgent";
import type { AgentVersionRow } from "@/hooks/ai/useAgentVersions";

const mocks = vi.hoisted(() => ({ create: vi.fn(), publish: vi.fn(), push: vi.fn(), refetch: vi.fn(), catalogo: { error: false } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }), usePathname: () => "/app/ai/agents/new", useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/app/ai/agents/[id]/_actions", () => ({ createMcpAgentAction: mocks.create, publishAgentAction: mocks.publish, saveAgentDraftAction: vi.fn() }));
vi.mock("@/hooks/ai/useMcpToolCatalog", () => ({ useMcpToolCatalog: () => ({ data: mocks.catalogo.error ? undefined : { tools: [{ id: "crm_find_free_slots", name: "crm_find_free_slots", risco: "seguro", pacotes: ["vender"], marcavel: true, rotulo: "Consultar horários" }], desligadas: [] }, isError: mocks.catalogo.error, isLoading: false, refetch: mocks.refetch }) }));
vi.mock("@/app/app/ai/agents/[id]/_components/ToolPicker", () => ({ ToolPicker: ({ value }: { value: string[] }) => <div data-testid="capacidades-selecionadas">{value.join(",")}</div> }));
vi.mock("@/app/app/ai/agents/[id]/_components/ModelPicker", () => ({ ModelPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="Modelo" value={value} onChange={(event) => onChange(event.target.value)} />, useModelMeta: () => null }));
vi.mock("@/app/app/ai/agents/[id]/_components/CredentialPicker", () => ({ CHAVE_DA_INSTALACAO: "__instalacao__", STATUS_LABEL: {}, findCredential: () => undefined, CredentialPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="Chave" value={value} onChange={(event) => onChange(event.target.value)} /> }));
vi.mock("@/app/app/ai/agents/[id]/_components/FollowupFlowPicker", () => ({ FollowupFlowPicker: () => null }));

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalogo.error = false;
  mocks.create.mockResolvedValue({ ok: true, data: { agent_id: "agente-novo" } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });

function abrir(edit = false) {
  const contexto = { credentials: [], channelSessions: [], provedorPadrao: "openai", provedoresDaInstalacao: ["openai"] };
  return render(<QueryClientProvider client={client}>{edit ? <AgentForm {...contexto} mode="edit" agent={{ id: "a1", name: "Existente" } as AgentRow} draft={null} published={null} base={{ system_prompt: "Instruções já aprovadas pela empresa", provider: "openai", tool_ids: [] } as unknown as AgentVersionRow} /> : <AgentForm {...contexto} mode="create" nomeDaOrganizacao="Clínica Aurora" />}</QueryClientProvider>);
}
function instrucoes() {
  const campo = screen.getAllByRole("textbox").find((element) => element.tagName === "TEXTAREA" && element.className.includes("font-mono"));
  if (!campo) throw new Error("instruções ausentes");
  return campo as HTMLTextAreaElement;
}

describe("objetivo no formulário de criação", () => {
  it("selecionar não altera o rascunho; aplicar deixa as sugestões editáveis", () => {
    abrir();
    const original = instrucoes().value;
    fireEvent.click(screen.getByRole("radio", { name: "Agendamento" }));
    expect(instrucoes()).toHaveValue(original);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar modelo inicial" }));
    expect(screen.getByLabelText("Nome", { exact: true })).toHaveValue("Agendamento — Clínica Aurora");
    expect(instrucoes().value).toContain("Clínica Aurora");
    fireEvent.change(instrucoes(), { target: { value: "Texto personalizado da recepção" } });
    expect(instrucoes()).toHaveValue("Texto personalizado da recepção");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("trocar objetivo preserva texto editado até o comando explícito substituir", () => {
    abrir();
    fireEvent.change(instrucoes(), { target: { value: "Texto próprio aprovado pelo cliente" } });
    fireEvent.click(screen.getByRole("radio", { name: "Suporte" }));
    expect(instrucoes()).toHaveValue("Texto próprio aprovado pelo cliente");
    fireEvent.click(screen.getByRole("button", { name: "Substituir pelas sugestões do objetivo" }));
    expect(instrucoes().value).toContain("Entenda o problema");
  });

  it("salva pelo caminho de rascunho sem escolher canal nem publicar", async () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "modelo-do-cliente" } });
    fireEvent.change(screen.getByLabelText("Chave"), { target: { value: "__instalacao__" } });
    fireEvent.click(screen.getByRole("radio", { name: "Agendamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Substituir pelas sugestões do objetivo" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar agente" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Agendamento — Clínica Aurora", version: expect.objectContaining({ model: "modelo-do-cliente", provider: "openai", credential_id: null, channel_session_id: null, tool_ids: ["crm_find_free_slots"], pipeline_ids: [], knowledge_source_ids: [] }) }));
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/app/ai/agents/agente-novo");
  });

  it("edição não oferece objetivo e mantém as instruções gravadas", () => {
    abrir(true);
    expect(screen.queryByRole("radio", { name: "Agendamento" })).not.toBeInTheDocument();
    expect(instrucoes()).toHaveValue("Instruções já aprovadas pela empresa");
  });

  it("falha no catálogo impede aplicar e oferece tentar novamente", () => {
    mocks.catalogo.error = true;
    abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Vendas" }));
    expect(screen.getByRole("button", { name: "Aplicar modelo inicial" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});

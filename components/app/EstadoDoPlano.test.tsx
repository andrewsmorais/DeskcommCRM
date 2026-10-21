import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

import { FalhaNaLeituraDoPlano, ResumoDoPlano } from "./EstadoDoPlano";

beforeEach(() => vi.clearAllMocks());

describe("contexto do plano no início da configuração", () => {
  it("mostra o plano persistido sem promover pagamento pendente a teste ativo", () => {
    render(
      <ResumoDoPlano
        billing={{ plan_name: "Impulso", billing_cycle: "monthly", status: "pending" }}
      />,
    );
    expect(screen.getByRole("region", { name: "Plano escolhido" })).toHaveTextContent("Impulso");
    expect(screen.getByText("Mensal · Pagamento pendente")).toBeInTheDocument();
    expect(screen.queryByText(/período de teste/i)).not.toBeInTheDocument();
  });

  it("a falha de consulta é explícita e oferece nova leitura", () => {
    render(<FalhaNaLeituraDoPlano reason="consulta_indisponivel" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível consultar seu plano");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("distingue catálogo desconhecido de ausência de assinatura", () => {
    render(<FalhaNaLeituraDoPlano reason="plano_desconhecido" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sua assinatura foi encontrada");
    expect(screen.queryByText(/nenhuma assinatura/i)).not.toBeInTheDocument();
  });
});

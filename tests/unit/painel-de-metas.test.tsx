/**
 * O painel da meta no Desempenho: os desfechos carregando / erro / vazio / ok.
 * O mais importante é o VAZIO: "sem meta" não vira "0 de 0" (afirmaria que a
 * empresa não vendeu nada). Percentual acima de 100 não gera falta negativa.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

vi.mock("@/app/actions/settings/definirMetaMensal", () => ({
  definirMetaMensal: vi.fn(async () => ({ ok: true })),
}));

import { MetaDoMesPanel, type MetaDaEmpresa } from "@/app/app/metrics/_components/MetaDoMesPanel";

afterEach(cleanup);

const EMPRESA: MetaDaEmpresa = {
  id: "m1",
  escopo: "empresa",
  pipeline_id: null,
  pipeline_nome: null,
  alvo: 10,
  realizado: 3,
  percentual: 30,
  falta: 7,
  atingida: false,
};

function renderizar(props: Partial<Parameters<typeof MetaDoMesPanel>[0]> = {}) {
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(IdiomaProvider, {
        locale: "pt-BR",
        children: createElement(MetaDoMesPanel, {
          estado: "ok",
          periodo: "2026-09-01",
          metas: [EMPRESA],
          podeConfigurar: true,
          mesAtual: "2026-09",
          ...props,
        }),
      }),
    ),
  );
}

describe("MetaDoMesPanel", () => {
  it("mostra os quatro números da meta", () => {
    const { container } = renderizar();
    expect(container.querySelector('[data-meta="percentual"]')?.textContent).toBe("30%");
    expect(container.querySelector('[data-meta="realizado"]')?.textContent).toBe("3");
    expect(container.querySelector('[data-meta="alvo"]')?.textContent).toBe("10");
    expect(container.querySelector('[data-meta="falta"]')?.textContent).toBe("7");
  });

  it("sem meta explica e NÃO mostra zero fingindo medição", () => {
    const { container } = renderizar({ estado: "vazio", metas: [], periodo: null });
    expect(screen.getByText("Nenhuma meta cadastrada para este mês.")).toBeTruthy();
    expect(container.querySelector('[data-meta="realizado"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Definir a meta" })).toBeTruthy();
  });

  it("quem não é gerente não vê o botão de definir", () => {
    renderizar({ estado: "vazio", metas: [], podeConfigurar: false });
    expect(screen.queryByRole("button", { name: "Definir a meta" })).toBeNull();
    expect(screen.getByText("Só gerentes e administradores definem a meta.")).toBeTruthy();
  });

  it("meta atingida não tem falta negativa e a barra não passa de 100%", () => {
    const { container } = renderizar({
      metas: [{ ...EMPRESA, realizado: 13, percentual: 130, falta: 0, atingida: true }],
    });
    expect(container.querySelector('[data-meta="falta"]')).toBeNull();
    expect(screen.getByText("Meta atingida.")).toBeTruthy();
    expect((container.querySelector('[data-meta="barra"]') as HTMLElement).style.width).toBe("100%");
  });

  it("erro de leitura diz que é falha, não ausência de meta", () => {
    renderizar({ estado: "erro", metas: [] });
    expect(screen.getByText(/falha de leitura/)).toBeTruthy();
  });
});

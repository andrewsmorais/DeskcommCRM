import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ORG = "11111111-1111-4111-8111-111111111111";
const AGENT = "22222222-2222-4222-8222-222222222222";

const db = vi.hoisted(() => ({
  agente: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Sofia",
    published_version_id: null as string | null,
  },
  versoes: [] as Array<{ id: string; version_number: number; status: string }>,
  consultas: [] as Array<{ tabela: string; filtros: Record<string, unknown> }>,
  erroVersoes: false,
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => ({ id: "user-1", idioma: "pt-BR" })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "11111111-1111-4111-8111-111111111111" })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const consulta = { tabela, filtros: {} as Record<string, unknown> };
      db.consultas.push(consulta);
      const resposta = () => ({
        data: tabela === "ai_agents" ? db.agente : db.versoes,
        error:
          tabela === "ai_agent_versions" && db.erroVersoes ? { message: "falha de leitura" } : null,
      });
      const chain = {
        select: () => chain,
        eq: (campo: string, valor: unknown) => {
          consulta.filtros[campo] = valor;
          return chain;
        },
        is: (campo: string, valor: unknown) => {
          consulta.filtros[campo] = valor;
          return chain;
        },
        order: () => chain,
        maybeSingle: async () => resposta(),
        then: (ok: (value: ReturnType<typeof resposta>) => unknown) =>
          Promise.resolve(resposta()).then(ok),
      };
      return chain;
    },
  }),
}));
vi.mock("./_client", () => ({
  TestarClient: (props: {
    versaoId: string | null;
    versaoEmRascunho?: boolean;
    falhaAoCarregarVersao?: boolean;
  }) => (
    <div data-testid="versao">
      {props.versaoId ?? "sem-versao"}:
      {props.falhaAoCarregarVersao
        ? "erro-leitura"
        : props.versaoEmRascunho
          ? "rascunho"
          : "publicada"}
    </div>
  ),
}));

import TestarPage from "./page";

beforeEach(() => {
  db.agente.published_version_id = null;
  db.versoes = [];
  db.consultas = [];
  db.erroVersoes = false;
});

describe("onboarding: versão exata que será ensaiada", () => {
  it("usa o rascunho vigente antes da publicada e filtra organização e agente", async () => {
    db.agente.published_version_id = "pub-1";
    db.versoes = [
      { id: "draft-3", version_number: 3, status: "draft" },
      { id: "pub-1", version_number: 1, status: "published" },
      { id: "draft-2", version_number: 2, status: "draft" },
    ];
    render(await TestarPage());

    expect(screen.getByTestId("versao")).toHaveTextContent("draft-3:rascunho");
    expect(db.consultas).toContainEqual({
      tabela: "ai_agent_versions",
      filtros: { organization_id: ORG, agent_id: AGENT },
    });
  });

  it("um rascunho superado não troca o texto da versão publicada", async () => {
    db.agente.published_version_id = "pub-2";
    db.versoes = [
      { id: "pub-2", version_number: 2, status: "published" },
      { id: "draft-1", version_number: 1, status: "draft" },
    ];
    render(await TestarPage());

    expect(screen.getByTestId("versao")).toHaveTextContent("pub-2:publicada");
  });

  it("um agente nunca publicado pode ensaiar uma versão draft salva", async () => {
    db.versoes = [{ id: "draft-1", version_number: 1, status: "draft" }];
    render(await TestarPage());

    expect(screen.getByTestId("versao")).toHaveTextContent("draft-1:rascunho");
  });

  it("sem versão salva mantém a pendência em vez de inventar uma versão", async () => {
    render(await TestarPage());

    expect(screen.getByTestId("versao")).toHaveTextContent("sem-versao");
  });

  it("erro de consulta não vira ausência de configuração", async () => {
    db.erroVersoes = true;
    render(await TestarPage());

    expect(screen.getByTestId("versao")).toHaveTextContent("sem-versao:erro-leitura");
  });
});

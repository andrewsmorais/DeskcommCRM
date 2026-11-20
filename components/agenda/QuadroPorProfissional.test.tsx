/**
 * O QUADRO POR PROFISSIONAL: uma linha por pessoa, o dia na horizontal.
 *
 * Mede o que a visão promete: uma linha por profissional com os compromissos
 * de cada um na linha dele; o clique num bloco livre diz QUEM atende (o painel
 * abre com a pessoa da linha, não com o dono do tipo); e quem só lê não recebe
 * bloco clicável.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuadroPorProfissional } from "./QuadroPorProfissional";
import type { Agendamento, Pessoa } from "./tipos";

const FUSO = "America/Sao_Paulo";
const ANA = "22222222-2222-4222-8222-222222222222";
const BRUNO = "33333333-3333-4333-8333-333333333333";

const pessoas: Pessoa[] = [
  { id: ANA, nome: "Ana", trilha: 1 },
  { id: BRUNO, nome: "Bruno", trilha: 2 },
];

function compromisso(over: Partial<Agendamento>): Agendamento {
  return {
    id: "a1",
    titulo: "Consulta",
    responsavelId: ANA,
    comeca: "2026-09-16T13:00:00-03:00",
    termina: "2026-09-16T14:00:00-03:00",
    origem: "ui",
    situacao: "confirmed",
    ...over,
  };
}

function quadro(props: Partial<React.ComponentProps<typeof QuadroPorProfissional>> = {}) {
  return render(
    <QuadroPorProfissional
      dia={new Date(2026, 8, 16, 12)}
      fuso={FUSO}
      pessoas={pessoas}
      agendamentos={[]}
      livres={{}}
      primeiraHora={8}
      ultimaHora={18}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("quadro por profissional", () => {
  it("desenha uma linha por pessoa", () => {
    quadro();
    expect(screen.getByTestId(`linha-profissional-${ANA}`)).toBeTruthy();
    expect(screen.getByTestId(`linha-profissional-${BRUNO}`)).toBeTruthy();
  });

  it("põe cada compromisso na linha do responsável", () => {
    quadro({
      agendamentos: [
        compromisso({ id: "da-ana", responsavelId: ANA }),
        compromisso({ id: "do-bruno", responsavelId: BRUNO }),
      ],
    });
    const linhaAna = screen.getByTestId(`linha-profissional-${ANA}`);
    const linhaBruno = screen.getByTestId(`linha-profissional-${BRUNO}`);
    expect(linhaAna.querySelector('[data-testid="quadro-agendamento-da-ana"]')).not.toBeNull();
    expect(linhaAna.querySelector('[data-testid="quadro-agendamento-do-bruno"]')).toBeNull();
    expect(linhaBruno.querySelector('[data-testid="quadro-agendamento-do-bruno"]')).not.toBeNull();
  });

  it("não desenha compromisso cancelado", () => {
    quadro({ agendamentos: [compromisso({ id: "x", situacao: "cancelled" })] });
    expect(screen.queryByTestId("quadro-agendamento-x")).toBeNull();
  });

  it("o clique no bloco livre devolve o horário E a pessoa da linha", async () => {
    const aoMarcar = vi.fn();
    const instante = "2026-09-16T10:00:00-03:00";
    quadro({
      livres: { [BRUNO]: [{ instante, rotulo: "10:00" }] },
      onMarcarEm: aoMarcar,
    });
    await userEvent.click(screen.getByTestId(`celula-${BRUNO}-10:00`));
    expect(aoMarcar).toHaveBeenCalledWith(instante, BRUNO);
  });

  it("sem permissão de marcar, nenhum bloco livre é clicável", () => {
    quadro({ livres: { [ANA]: [{ instante: "2026-09-16T10:00:00-03:00", rotulo: "10:00" }] } });
    const celula = screen.getByTestId(`celula-${ANA}-10:00`) as HTMLButtonElement;
    expect(celula.disabled).toBe(true);
  });

  it("a ocupação do Google não abre", () => {
    const aoAbrir = vi.fn();
    quadro({
      agendamentos: [compromisso({ id: "g", origem: "google_sync" })],
      onAbrirAgendamento: aoAbrir,
    });
    expect((screen.getByTestId("quadro-agendamento-g") as HTMLButtonElement).disabled).toBe(true);
  });
});

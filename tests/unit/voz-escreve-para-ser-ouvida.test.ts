import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A RESPOSTA QUE VAI VIRAR ÁUDIO É ESCRITA PARA SER OUVIDA.
 *
 * Medido numa instalação real (03/11/2026, número oficial): o cliente mandou um áudio,
 * o agente respondeu por nota de voz — e a nota tinha 35 segundos, com lista e
 * sigla, porque o modelo escrevia como sempre (para a tela) e a síntese só lia.
 * O conserto é o modelo SABER, no turno, que vai ser ouvido.
 *
 * Duas coisas são fixadas aqui:
 *   1. o bloco só existe quando a voz foi resolvida para o turno — turno em
 *      texto não muda nem um caractere do `system`;
 *   2. no turno, o `system` é montado DEPOIS da voz ser resolvida e leva o
 *      bloco. Era o contrário: o `system` nascia antes, e não havia onde pôr.
 */
import {
  BLOCO_DA_RESPOSTA_FALADA,
  blocoDaRespostaFalada,
  type VozResolvidaDoTurno,
} from "@/lib/agent-engine/agent/voz-do-turno";

const VOZ: VozResolvidaDoTurno = { apiKey: "sk", voiceId: "v1", formato: "ogg_opus" };

describe("o bloco da resposta falada", () => {
  it("só entra quando o turno vai falar", () => {
    expect(blocoDaRespostaFalada(null)).toBeNull();
    expect(blocoDaRespostaFalada(VOZ)).toBe(BLOCO_DA_RESPOSTA_FALADA);
  });

  it("pede o que faz uma nota de voz boa de ouvir — curta, uma ideia, sem lista nem sigla", () => {
    const b = BLOCO_DA_RESPOSTA_FALADA;
    expect(b).toContain("NOTA DE VOZ");
    expect(b).toContain("20 segundos");
    expect(b).toMatch(/uma ideia por vez/i);
    expect(b).toMatch(/sem listas/i);
    expect(b).toMatch(/siglas/i);
    // No idioma da CONVERSA — o bloco é instrução, não o idioma da resposta.
    expect(b).toContain("no idioma da conversa");
  });
});

describe("no turno, a voz é resolvida antes do `system` — e o bloco entra nele", () => {
  const fonte = readFileSync(join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");

  // Nesta instalação o `system` é montado antes de a voz ser resolvida (o
  // contexto da conversa, que decide 'quando_pede', é lido depois), e o bloco é
  // acrescentado no FIM dele — o prefixo dos turnos em texto continua o mesmo.
  it("resolve a voz → monta o bloco → acrescenta ao `system`, nessa ordem", () => {
    const junta = fonte.indexOf("let system = blocosResidentes.join(");
    const resolve = fonte.indexOf("await resolverVozDoTurno({");
    const bloco = fonte.indexOf("blocoDaRespostaFalada(vozParaEsteTurno)");
    expect(junta).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(junta);
    expect(bloco).toBeGreaterThan(resolve);
    expect(fonte.split("blocosResidentes.join(").length).toBe(2);
  });

  it("o bloco vai para o `system`, não só é calculado", () => {
    expect(fonte).toMatch(/const blocoDaVoz = blocoDaRespostaFalada\(vozParaEsteTurno\);\s*if \(blocoDaVoz\) system = `\$\{system\}\\n\\n\$\{blocoDaVoz\}`;/);
  });
});

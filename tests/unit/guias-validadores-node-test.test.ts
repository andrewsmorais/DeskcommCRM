/**
 * Os testes dos validadores dos guias embutidos rodam pelo runner DELES.
 *
 * O guia `security-audit` (`.agents/skills/security-audit`) é distribuído fora
 * deste repositório e traz os próprios testes em `node:test` (`*.test.cjs`).
 * Coletados pelo vitest, eles falhavam como "No test suite found" — e, excluídos
 * da coleta sem mais nada, ninguém os rodaria. Este caso os executa com
 * `node --test` e reprova a suíte quando algum validador quebra.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const FONTE = join(RAIZ, ".agents", "skills");

function testesNodeDosGuias(): string[] {
  return readdirSync(FONTE, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(FONTE, d.name))
        .filter((f) => f.endsWith(".test.cjs"))
        .map((f) => join(FONTE, d.name, f)),
    );
}

describe("validadores dos guias embutidos — node --test", () => {
  const arquivos = testesNodeDosGuias();

  it("há testes a rodar (guarda de vacuidade)", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(2);
  });

  it(
    "todos passam",
    () => {
      let saida = "";
      try {
        saida = execFileSync(process.execPath, ["--test", ...arquivos], { cwd: RAIZ, encoding: "utf8" });
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        throw new Error(`node --test reprovou:\n${(e.stdout ?? "").slice(-3000)}\n${e.stderr ?? ""}`);
      }
      expect(saida).toMatch(/^# fail 0$/m);
      expect(saida).not.toMatch(/^# tests 0$/m);
    },
    120_000,
  );
});

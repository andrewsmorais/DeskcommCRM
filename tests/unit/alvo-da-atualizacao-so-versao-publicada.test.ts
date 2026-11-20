/**
 * Auditoria de 18/11, achado 3 (lado do app): `ehVersaoPublicada` não era
 * ancorada no fim, e `1.0.0~1`, `1.0.0^` ou `1.0.0..HEAD` passavam por versão
 * publicada — e viravam `--to` de um `update.sh` no host. O lado do host tem o
 * seu teste (tests/shell/agente-so-instala-versao-publicada.test.sh).
 */
import { describe, expect, it } from "vitest";

import { ehVersaoPublicada } from "@/lib/system/update-run";

describe("ehVersaoPublicada", () => {
  it.each(["1.33.0", "v1.33.0", "V2.0.10", " v1.2.3 "])("aceita %s", (v) => {
    expect(ehVersaoPublicada(v)).toBe(true);
  });

  it.each([
    "1.0.0~1",
    "v1.0.0^",
    "1.0.0..HEAD",
    "1.0.0-anything",
    "v1.20.0-manual",
    "origin/main",
    "deadbeef",
    "",
    null,
    undefined,
  ])("recusa %s", (v) => {
    expect(ehVersaoPublicada(v as string | null | undefined)).toBe(false);
  });
});

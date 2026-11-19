import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LIMITES_DO_PLANO, PLANOS_COMERCIAIS } from "@/lib/billing/catalogo";
import { CANAIS_CONTADOS_NO_PLANO } from "@/lib/channels/cota-do-plano";

/**
 * Os números do plano moram em DOIS lugares: `lib/billing/catalogo.ts` (o que as
 * rotas barram) e a função `fn_limite_do_plano` do banco (o que a escrita direta
 * pela API pública barra, migration 0563). Mudar um sem o outro faria o banco
 * recusar o que a página vende, ou deixar passar o que ela não vende.
 *
 * Lê a ÚLTIMA definição no `baseline.sql` (a que o banco instala), nunca a primeira.
 */
const baseline = readFileSync(path.resolve(__dirname, "../../supabase/baseline.sql"), "utf8");

function ultimaDefinicao(nome: string): string {
  const i = baseline.lastIndexOf(`create or replace function public.${nome}`);
  expect(i).toBeGreaterThan(-1);
  return baseline.slice(i, baseline.indexOf("$$;", i));
}

describe("limites do plano: banco × catálogo", () => {
  it("os pacotes de fn_limite_do_plano são os do catálogo", () => {
    const corpo = ultimaDefinicao("fn_limite_do_plano");
    const json = /pacotes constant jsonb := '([\s\S]*?)'::jsonb/.exec(corpo)?.[1];
    expect(json).toBeTruthy();
    const pacotes = JSON.parse(json!) as Record<string, Record<string, number>>;
    for (const [plano, limites] of Object.entries(PLANOS_COMERCIAIS)) {
      for (const limite of LIMITES_DO_PLANO) {
        expect(pacotes[plano]?.[limite], `${plano}.${limite}`).toBe(limites[limite]);
      }
    }
    expect(Object.keys(pacotes).sort()).toEqual(Object.keys(PLANOS_COMERCIAIS).sort());
  });

  it("o gatilho conta os mesmos provedores de WhatsApp que a cota do plano", () => {
    const corpo = ultimaDefinicao("fn_cota_do_plano_na_escrita");
    const listas = [...corpo.matchAll(/provider (?:not )?in \(([^)]*)\)/g)].map((m) =>
      m[1]!.split(",").map((x) => x.trim().replace(/'/g, "")).sort(),
    );
    expect(listas.length).toBeGreaterThan(0);
    for (const lista of listas) expect(lista).toEqual([...CANAIS_CONTADOS_NO_PLANO].sort());
  });
});

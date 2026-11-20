/**
 * O assistente de ajuda acompanha o CRM: toda tela do menu tem entrada no
 * manual, e nenhuma entrada fala de tela que não existe mais. Tela nova sem
 * "como usar" reprova aqui — é o que impede o assistente de envelhecer.
 */
import { describe, expect, it } from "vitest";
import { MANUAL, GUIAS } from "@/lib/ajuda/manual";
import { NAV_CATALOG } from "@/lib/navigation/catalogo";
import { PLANOS_COMERCIAIS } from "@/lib/billing/catalogo";

const hrefs = new Set<string>(NAV_CATALOG.map((d) => d.href));
const nomesDePlano = Object.values(PLANOS_COMERCIAIS).map((p) => p.nome);
const textos = [
  ...Object.values(MANUAL).flatMap((e) => [e.oQueE, ...e.comoUsar, ...(e.cuidados ?? [])]),
  ...GUIAS.map((g) => g.conteudo),
];

describe("manual do assistente de ajuda", () => {
  it("toda tela do menu tem entrada com conteúdo", () => {
    const faltando = [...hrefs].filter((h) => !MANUAL[h]);
    expect(faltando, "Tela nova no NAV_CATALOG sem entrada em lib/ajuda/manual/").toEqual([]);
    for (const [href, e] of Object.entries(MANUAL)) {
      expect(e.oQueE.trim(), href).not.toBe("");
      expect(e.comoUsar.length, href).toBeGreaterThan(0);
    }
  });

  it("nenhuma entrada fala de tela que saiu do menu", () => {
    expect(Object.keys(MANUAL).filter((h) => !hrefs.has(h))).toEqual([]);
  });

  it("os números dos planos não são digitados no manual (vêm do catálogo)", () => {
    const re = new RegExp(`(${nomesDePlano.join("|")})\\W{0,12}\\d`);
    expect(textos.filter((t) => re.test(t))).toEqual([]);
  });

  it("os guias têm id único", () => {
    const ids = GUIAS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

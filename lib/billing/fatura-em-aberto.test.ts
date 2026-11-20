import { describe, expect, it } from "vitest";
import { escolherFatura, linkDoAsaas } from "./fatura-em-aberto";

describe("fatura em aberto", () => {
  it("só aceita link https do domínio do Asaas", () => {
    expect(linkDoAsaas("https://www.asaas.com/i/abc123")).toBe("https://www.asaas.com/i/abc123");
    expect(linkDoAsaas("https://sandbox.asaas.com/i/abc123")).toBe("https://sandbox.asaas.com/i/abc123");
    expect(linkDoAsaas("http://www.asaas.com/i/abc")).toBeNull();
    expect(linkDoAsaas("https://asaas.com.golpe.io/i/abc")).toBeNull();
    expect(linkDoAsaas("https://evil.com/?x=asaas.com")).toBeNull();
    expect(linkDoAsaas(undefined)).toBeNull();
  });

  it("escolhe a cobrança mais antiga com link válido", () => {
    const f = escolherFatura([
      { invoiceUrl: "https://www.asaas.com/i/2", value: 89.9, dueDate: "2026-11-20", status: "OVERDUE" },
      { invoiceUrl: "https://www.asaas.com/i/1", value: 89.9, dueDate: "2026-10-20", status: "OVERDUE" },
      { invoiceUrl: "https://outro.com/i/0", value: 1, dueDate: "2026-01-01", status: "OVERDUE" },
    ]);
    expect(f).toEqual({ url: "https://www.asaas.com/i/1", valor: 89.9, vencimento: "2026-10-20", vencida: true });
  });

  it("nenhuma cobrança com link válido → null (a tela mostra só Escolher plano)", () => {
    expect(escolherFatura([])).toBeNull();
    expect(escolherFatura([{ invoiceUrl: null, value: 10 }])).toBeNull();
  });
});

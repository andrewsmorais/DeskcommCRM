/**
 * Editar um produto grava só o que mudou (trazido do produto original). O
 * `produtoPatchSchema` era `produtoCreateSchema.partial()`, e o Zod 4 mantém o
 * `.default()`: um PATCH só de preço saía com `quantidade: 0`,
 * `controla_estoque: true` e `ativo: true`, e a rota espalha o corpo validado no
 * UPDATE — a edição zerava o estoque e reativava o produto desativado.
 */
import { describe, expect, it } from "vitest";

import { produtoCreateSchema, produtoPatchSchema } from "@/lib/schemas/produtos";

describe("PATCH de produto não inventa campo", () => {
  it("só o preço: sai só o preço", () => {
    expect(produtoPatchSchema.parse({ preco_cents: 1990 })).toEqual({ preco_cents: 1990 });
  });

  it("os campos que vieram continuam valendo, e continuam validados", () => {
    expect(produtoPatchSchema.parse({ quantidade: 5, ativo: false })).toEqual({ quantidade: 5, ativo: false });
    expect(produtoPatchSchema.safeParse({ quantidade: -1 }).success).toBe(false);
  });

  it("CONTROLE: a criação segue completando os padrões", () => {
    expect(produtoCreateSchema.parse({ codigo: "C1", nome: "Corte", preco_cents: 3000 })).toMatchObject({
      quantidade: 0,
      controla_estoque: true,
      ativo: true,
    });
  });
});

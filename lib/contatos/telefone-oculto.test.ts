import { describe, expect, it } from "vitest";

import { phoneForDisplay } from "@/lib/channels/phone-variants";

import { mascararTelefone, mascararTelefonesEm, talvezTenhaTelefone, telefoneMascarado } from "./telefone-oculto";

describe("telefone oculto", () => {
  it("mantém o código do país e os dois últimos dígitos", () => {
    expect(mascararTelefone("+5511999998888")).toBe("+55•••••••••88");
    expect(mascararTelefone("5511999998888@c.us")).toBe("55•••••••••88@c.us");
    expect(mascararTelefone("123")).toBe("•••");
  });

  it("mascara em qualquer profundidade, só nos campos de telefone", () => {
    const r = mascararTelefonesEm({
      data: [{ name: "Ana 5511", phone_number: "+5511999998888", contacts: { phone_number: "+5521988887777", wa_identity: "5521988887777@c.us" } }],
    });
    expect(r.data[0]!.name).toBe("Ana 5511");
    expect(r.data[0]!.phone_number).toBe("+55•••••••••88");
    expect(r.data[0]!.contacts.phone_number).toBe("+55•••••••••77");
    expect(r.data[0]!.contacts.wa_identity).toBe("55•••••••••77@c.us");
  });

  it("o número mascarado continua mascarado na tela e é reconhecível", () => {
    const m = mascararTelefone("+5511999998888");
    expect(telefoneMascarado(m)).toBe(true);
    expect(telefoneMascarado("+5511999998888")).toBe(false);
    expect(phoneForDisplay(m)).toContain("•");
  });

  it("só olha a resposta que tem campo de telefone", () => {
    expect(talvezTenhaTelefone('[{"phone_number":"x"}]')).toBe(true);
    expect(talvezTenhaTelefone('[{"name":"x"}]')).toBe(false);
  });
});

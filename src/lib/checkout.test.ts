import { describe, expect, it } from "vitest";
import {
  formatCpf,
  isFullName,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  parseCart,
  serializeCart,
  splitName,
} from "./checkout";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("checkout", () => {
  it("valida CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("formata CPF", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("5299")).toBe("529.9");
  });

  it("valida e-mail, telefone e nome completo", () => {
    expect(isValidEmail("ana@exemplo.com")).toBe(true);
    expect(isValidEmail("ana@exemplo")).toBe(false);
    expect(isValidPhone("(83) 99999-0000")).toBe(true);
    expect(isValidPhone("9999-0000")).toBe(false);
    expect(isFullName("Ana Souza")).toBe(true);
    expect(isFullName("Ana")).toBe(false);
    expect(splitName("  Ana   Maria Souza ")).toEqual({ first: "Ana", last: "Maria Souza" });
  });

  it("lê e escreve o carrinho", () => {
    expect(parseCart(`${A}:2,${B}:1`)).toEqual([
      { ticketTypeId: A, quantity: 2 },
      { ticketTypeId: B, quantity: 1 },
    ]);
    expect(serializeCart(parseCart(`${A}:2`)!)).toBe(`${A}:2`);
  });

  it("rejeita carrinho inválido", () => {
    expect(parseCart("")).toBeNull();
    expect(parseCart(`${A}:0`)).toBeNull();
    expect(parseCart(`${A}:11`)).toBeNull();
    expect(parseCart(`${A}:6,${B}:5`)).toBeNull(); // total > 10
    expect(parseCart(`${A}:1,${A}:1`)).toBeNull(); // repetido
    expect(parseCart("x:1")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { chargeCents, estimateNetCents } from "@/config/fees";
import { SHIRT_FEE_PASSED_TO_BUYER, shirtChargeCents, shirtSurchargeCents } from "./shirts";

describe("cobrança das camisas", () => {
  it("cartão repassa a taxa ao comprador; Pix absorve (mesma regra dos ingressos)", () => {
    expect(SHIRT_FEE_PASSED_TO_BUYER).toEqual({ cartao: true, pix: false });
    expect(shirtChargeCents("pix", 8000)).toBe(8000);
    expect(shirtSurchargeCents("pix", 8000)).toBe(0);
    expect(shirtChargeCents("cartao", 8000)).toBeGreaterThan(8000);
    expect(shirtSurchargeCents("cartao", 8000)).toBe(shirtChargeCents("cartao", 8000) - 8000);
  });

  it("no cartão, a organização recebe ao menos o preço da camisa depois da taxa", () => {
    for (const subtotal of [1, 100, 8000, 8990, 17980, 26970, 123456]) {
      expect(estimateNetCents("cartao", shirtChargeCents("cartao", subtotal))).toBeGreaterThanOrEqual(subtotal);
    }
  });

  it("é o menor valor que cobre o preço (sem cobrar a mais que o necessário)", () => {
    for (const subtotal of [100, 8000, 8990, 17980]) {
      const total = shirtChargeCents("cartao", subtotal);
      expect(estimateNetCents("cartao", total - 1)).toBeLessThan(subtotal);
    }
  });

  it("segue idêntica à regra dos ingressos", () => {
    for (const subtotal of [100, 8000, 17980]) {
      expect(shirtChargeCents("cartao", subtotal)).toBe(chargeCents("cartao", subtotal));
      expect(shirtChargeCents("pix", subtotal)).toBe(chargeCents("pix", subtotal));
    }
  });
});

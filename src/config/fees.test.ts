import { describe, expect, it } from "vitest";
import {
  chargeCents,
  estimateFeeCents,
  estimateNetCents,
  feeRateLabel,
  organizerReceivesCents,
  surchargeCents,
} from "./fees";

describe("taxas Mercado Pago", () => {
  it("cartão 4,98% e Pix 0,99%", () => {
    expect(feeRateLabel("cartao")).toBe("4,98%");
    expect(feeRateLabel("pix")).toBe("0,99%");
  });

  it("calcula taxa e líquido em centavos", () => {
    expect(estimateFeeCents("cartao", 10000)).toBe(498);
    expect(estimateNetCents("cartao", 10000)).toBe(9502);
    expect(estimateFeeCents("pix", 10000)).toBe(99);
    expect(estimateNetCents("pix", 1000)).toBe(990);
  });

  it("arredonda ao centavo", () => {
    expect(estimateFeeCents("pix", 1550)).toBe(15); // 15,345
    expect(estimateFeeCents("cartao", 1550)).toBe(77); // 77,19
  });

  it("cartão: comprador paga a taxa e a organização recebe o valor do ingresso", () => {
    expect(chargeCents("cartao", 1000)).toBe(1052); // R$ 10,00 → R$ 10,52 (taxa 0,52)
    expect(surchargeCents("cartao", 1000)).toBe(52);
    expect(organizerReceivesCents("cartao", 1000)).toBeGreaterThanOrEqual(1000);
    expect(chargeCents("cartao", 15000)).toBe(15786); // R$ 150,00 → R$ 157,86
  });

  it("cartão: repasse cobre o valor cheio sem sobrar mais de 1 centavo", () => {
    for (let price = 1; price <= 200_000; price += 7) {
      const total = chargeCents("cartao", price);
      expect(estimateNetCents("cartao", total)).toBeGreaterThanOrEqual(price);
      expect(estimateNetCents("cartao", total - 1)).toBeLessThan(price); // menor total possível
    }
  });

  it("Pix: sem repasse, taxa absorvida", () => {
    expect(chargeCents("pix", 1000)).toBe(1000);
    expect(surchargeCents("pix", 1000)).toBe(0);
    expect(organizerReceivesCents("pix", 1000)).toBe(990);
  });

  it("subtotal zero não gera cobrança", () => {
    expect(chargeCents("cartao", 0)).toBe(0);
  });
});

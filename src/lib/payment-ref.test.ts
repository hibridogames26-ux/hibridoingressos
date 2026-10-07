import { describe, expect, it } from "vitest";
import { parsePaymentRef, shirtReference } from "./payment-ref";

const ID = "3f0c2a52-9d3e-4c1e-8f55-0a6d9b1c7e21";

describe("parsePaymentRef", () => {
  it("reconhece pedido de ingresso (UUID puro)", () => {
    expect(parsePaymentRef(ID)).toEqual({ kind: "ticket", id: ID });
  });

  it("reconhece pedido de camisa pelo prefixo", () => {
    expect(parsePaymentRef(shirtReference(ID))).toEqual({ kind: "shirt", id: ID });
    expect(parsePaymentRef(`shirt:${ID.toUpperCase()}`)).toEqual({ kind: "shirt", id: ID });
  });

  it("recusa referências inválidas", () => {
    expect(parsePaymentRef(null)).toBeNull();
    expect(parsePaymentRef("")).toBeNull();
    expect(parsePaymentRef("shirt:")).toBeNull();
    expect(parsePaymentRef("shirt:123")).toBeNull();
    expect(parsePaymentRef(`camisa:${ID}`)).toBeNull();
    expect(parsePaymentRef(`${ID}-x`)).toBeNull();
  });
});

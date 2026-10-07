import { describe, expect, it } from "vitest";
import {
  FALLBACK_SHIRT_PRODUCT,
  NO_COUPON,
  enabledSizes,
  countsTowardLot,
  formatOrderCode,
  isMissingRelationError,
  missingConditions,
  parseSelectionParams,
  shirtAvailability,
  shirtCheckoutHref,
  sizeStates,
  DEFAULT_DISABLED_MESSAGE,
  sortBySizeOrder,
  validateSelection,
  withAllSizes,
  type ShirtProduct,
} from "./shirts";

const NOW = Date.parse("2026-10-20T12:00:00Z");

const ready: ShirtProduct = {
  ...FALLBACK_SHIRT_PRODUCT,
  id: "p1",
  price_cents: 8000,
  sizes: ["P", "M", "G"],
  size_guide: "Tabela do fornecedor",
  production_lead_time: "30 dias",
  receipt_details: "Retirada no evento",
  purchase_policy: "Sem troca",
  sales_end: "2026-11-01T00:00:00Z",
  batch_limit: 10,
  max_per_order: 3,
  sales_mode: "aberta",
};

describe("missingConditions", () => {
  it("o produto de fallback está fechado e com todas as pendências", () => {
    expect(missingConditions(FALLBACK_SHIRT_PRODUCT)).toHaveLength(9);
    expect(shirtAvailability(FALLBACK_SHIRT_PRODUCT, 0, NO_COUPON, NOW).state).toBe("closed");
  });

  it("produto completo não tem pendências", () => {
    expect(missingConditions(ready)).toEqual([]);
  });

  it("textos em branco contam como ausentes", () => {
    expect(missingConditions({ ...ready, size_guide: "  ", purchase_policy: "" })).toEqual(["size_guide", "policy"]);
  });

  it("preço zero ou sem grade conta como ausente", () => {
    expect(missingConditions({ ...ready, price_cents: 0, sizes: [] })).toEqual(["price", "sizes"]);
  });

  it("com todos os tamanhos desabilitados, a grade conta como ausente", () => {
    expect(missingConditions({ ...ready, disabled_sizes: ["P", "M", "G"] })).toEqual(["sizes"]);
    expect(missingConditions({ ...ready, disabled_sizes: ["P", "M"] })).toEqual([]);
  });
});

describe("enabledSizes", () => {
  it("mantém a ordem da grade e tira os desabilitados", () => {
    expect(enabledSizes({ sizes: ["P", "M", "G"], disabled_sizes: ["M"] })).toEqual(["P", "G"]);
    expect(enabledSizes({ sizes: ["P"], disabled_sizes: [] })).toEqual(["P"]);
  });
});

describe("shirtAvailability", () => {
  const test = { valid: true, isTest: true };
  const campaign = { valid: true, isTest: false };

  it("aberta libera para todos com tudo confirmado", () => {
    expect(shirtAvailability(ready, 0, NO_COUPON, NOW)).toEqual({ state: "open", maxQuantity: 3 });
  });

  it("fechada recusa até com cupom válido", () => {
    expect(shirtAvailability({ ...ready, sales_mode: "fechada" }, 0, NO_COUPON, NOW).state).toBe("closed");
    expect(shirtAvailability({ ...ready, sales_mode: "fechada" }, 0, test, NOW).state).toBe("closed");
  });

  it("somente com cupom exige um cupom válido", () => {
    const only = { ...ready, sales_mode: "cupom" as const };
    expect(shirtAvailability(only, 0, NO_COUPON, NOW).state).toBe("coupon_required");
    expect(shirtAvailability(only, 0, campaign, NOW)).toEqual({ state: "open", maxQuantity: 3 });
    expect(shirtAvailability(only, 0, test, NOW)).toEqual({ state: "open", maxQuantity: 3 });
  });

  it("não abre se falta qualquer condição, em qualquer modo", () => {
    expect(shirtAvailability({ ...ready, production_lead_time: null }, 0, NO_COUPON, NOW).state).toBe("closed");
    expect(shirtAvailability({ ...ready, sales_mode: "cupom", production_lead_time: null }, 0, test, NOW).state).toBe("closed");
  });

  it("o prazo final vale para todos; o início só para a venda aberta", () => {
    expect(shirtAvailability({ ...ready, sales_end: "2026-10-01T00:00:00Z" }, 0, NO_COUPON, NOW).state).toBe("ended");
    expect(shirtAvailability({ ...ready, sales_mode: "cupom", sales_end: "2026-10-01T00:00:00Z" }, 0, test, NOW).state).toBe("ended");
    expect(shirtAvailability({ ...ready, sales_start: "2026-10-25T00:00:00Z" }, 0, NO_COUPON, NOW).state).toBe("scheduled");
    expect(shirtAvailability({ ...ready, sales_mode: "cupom", sales_start: "2026-10-25T00:00:00Z" }, 0, campaign, NOW).state).toBe("open");
  });

  it("limita a quantidade ao que resta no lote", () => {
    expect(shirtAvailability(ready, 8, NO_COUPON, NOW)).toEqual({ state: "open", maxQuantity: 2 });
    expect(shirtAvailability(ready, 10, NO_COUPON, NOW).state).toBe("sold_out");
    expect(shirtAvailability(ready, 12, campaign, NOW).state).toBe("sold_out");
  });

  it("cupom de teste não é barrado pelo lote cheio", () => {
    expect(shirtAvailability(ready, 10, test, NOW)).toEqual({ state: "open", maxQuantity: 3 });
    expect(shirtAvailability({ ...ready, sales_mode: "cupom" }, 99, test, NOW)).toEqual({ state: "open", maxQuantity: 3 });
  });

  it("sem consulta de uso, o limite fica para o servidor", () => {
    expect(shirtAvailability(ready, null, NO_COUPON, NOW)).toEqual({ state: "open", maxQuantity: 3 });
  });
});

describe("countsTowardLot", () => {
  it("conta pagas e reservas dentro do prazo", () => {
    expect(countsTowardLot({ status: "pago", expires_at: null, mp_status: "approved" }, NOW)).toBe(true);
    expect(countsTowardLot({ status: "pendente", expires_at: "2026-10-20T12:10:00Z", mp_status: null }, NOW)).toBe(true);
  });

  it("não conta vencidas, canceladas nem estornadas", () => {
    expect(countsTowardLot({ status: "pendente", expires_at: "2026-10-20T11:00:00Z", mp_status: null }, NOW)).toBe(false);
    expect(countsTowardLot({ status: "cancelado", expires_at: null, mp_status: null }, NOW)).toBe(false);
    expect(countsTowardLot({ status: "estornado", expires_at: null, mp_status: "refunded" }, NOW)).toBe(false);
  });

  it("cartão em análise segura a reserva mesmo vencida", () => {
    expect(countsTowardLot({ status: "pendente", expires_at: "2026-10-20T11:00:00Z", mp_status: "in_process" }, NOW)).toBe(true);
  });
});

describe("validateSelection", () => {
  it("nunca assume tamanho", () => {
    expect(validateSelection(ready.sizes, 3, {})).toMatchObject({ ok: false, field: "size" });
    expect(validateSelection(ready.sizes, 3, { size: "  " })).toMatchObject({ ok: false, field: "size" });
  });

  it("recusa tamanho fora da grade confirmada", () => {
    expect(validateSelection(ready.sizes, 3, { size: "XG" })).toMatchObject({ ok: false, field: "size" });
  });

  it("aceita tamanho válido com quantidade padrão 1", () => {
    expect(validateSelection(ready.sizes, 3, { size: "M" })).toEqual({ ok: true, selection: { size: "M", quantity: 1 } });
  });

  it("valida a quantidade entre 1 e o máximo", () => {
    expect(validateSelection(ready.sizes, 3, { size: "M", quantity: 4 })).toMatchObject({ ok: false, field: "quantity" });
    expect(validateSelection(ready.sizes, 3, { size: "M", quantity: 0 })).toMatchObject({ ok: false, field: "quantity" });
    expect(validateSelection(ready.sizes, 3, { size: "M", quantity: 1.5 })).toMatchObject({ ok: false, field: "quantity" });
    expect(validateSelection(ready.sizes, 3, { size: "G", quantity: 3 })).toMatchObject({ ok: true });
  });
});

describe("parâmetros e links", () => {
  it("lê tamanho e quantidade da URL", () => {
    expect(parseSelectionParams({ tamanho: "GG", qtd: "2" })).toEqual({ size: "GG", quantity: 2, coupon: "" });
    expect(parseSelectionParams({})).toEqual({ size: "", quantity: 1, coupon: "" });
    expect(parseSelectionParams({ cupom: " teste-r1 " }).coupon).toBe("TESTE-R1");
    expect(parseSelectionParams({ tamanho: "M", qtd: "abc" }).quantity).toBeNaN();
    expect(parseSelectionParams({ tamanho: ["M"], qtd: ["1"], cupom: ["X"] })).toEqual({ size: "", quantity: 1, coupon: "" });
  });

  it("monta o link do checkout com o tamanho escapado", () => {
    expect(shirtCheckoutHref({ size: "M", quantity: 2 })).toBe("/loja/camisa-hibrido-games/checkout?tamanho=M&qtd=2");
    expect(shirtCheckoutHref({ size: "P/M", quantity: 1 })).toContain("tamanho=P%2FM");
    expect(shirtCheckoutHref({ size: "M", quantity: 1 }, "TESTE-R1")).toBe("/loja/camisa-hibrido-games/checkout?tamanho=M&qtd=1&cupom=TESTE-R1");
  });

  it("formata o código do pedido", () => {
    expect(formatOrderCode("K7M2P9QA")).toBe("K7M2-P9QA");
    expect(formatOrderCode("ABC")).toBe("ABC");
  });
});

describe("tamanhos", () => {
  it("ordena pela grade do produto e deixa os de fora no fim", () => {
    const rows = [{ size: "GG" }, { size: "XX" }, { size: "P" }, { size: "M" }];
    expect(sortBySizeOrder(rows, ["P", "M", "G", "GG"]).map((r) => r.size)).toEqual(["P", "M", "GG", "XX"]);
  });

  it("completa os tamanhos sem encomendas com zeros", () => {
    const rows = withAllSizes([{ size: "M", units: 4 }], ["P", "M", "G"], (size) => ({ size, units: 0 }));
    expect(rows).toEqual([
      { size: "P", units: 0 },
      { size: "M", units: 4 },
      { size: "G", units: 0 },
    ]);
  });
});

describe("isMissingRelationError", () => {
  it("reconhece tabela ausente (Postgres e PostgREST)", () => {
    expect(isMissingRelationError({ code: "42P01" })).toBe(true);
    expect(isMissingRelationError({ code: "PGRST205", message: "Could not find the table 'public.shirt_products' in the schema cache" })).toBe(true);
  });

  it("reconhece coluna ou função de camisa ausente (segunda migration pendente)", () => {
    expect(isMissingRelationError({ code: "42703", message: "column shirt_products.sales_mode does not exist" })).toBe(true);
    expect(isMissingRelationError({ code: "PGRST204", message: "Could not find the 'sales_mode' column of 'shirt_products' in the schema cache" })).toBe(true);
    expect(isMissingRelationError({ code: "PGRST202", message: "Could not find the function public.validate_shirt_coupon(p_code) in the schema cache" })).toBe(true);
  });

  it("não confunde outros erros", () => {
    expect(isMissingRelationError({ code: "42501", message: "permission denied for table shirt_orders" })).toBe(false);
    expect(isMissingRelationError(null)).toBe(false);
  });
});

describe("sizeStates", () => {
  const base = { sizes: ["P", "M", "G", "XG"], disabled_sizes: ["XG"], size_limits: { G: 2 }, size_messages: { XG: "Sob consulta" } };

  it("tamanho desabilitado usa a mensagem do admin ou a padrão", () => {
    const xg = sizeStates(base).find((s) => s.size === "XG");
    expect(xg).toEqual({ size: "XG", available: false, reason: "disabled", message: "Sob consulta" });
    const semMensagem = sizeStates({ ...base, size_messages: {} }).find((s) => s.size === "XG");
    expect(semMensagem?.message).toBe(DEFAULT_DISABLED_MESSAGE);
    const vazia = sizeStates({ ...base, size_messages: { XG: "   " } }).find((s) => s.size === "XG");
    expect(vazia?.message).toBe(DEFAULT_DISABLED_MESSAGE);
  });

  it("limite do tamanho esgota quando pagas e reservas chegam nele", () => {
    expect(sizeStates(base, { G: 1 }).find((s) => s.size === "G")?.available).toBe(true);
    expect(sizeStates(base, { G: 2 }).find((s) => s.size === "G")).toEqual({ size: "G", available: false, reason: "sold_out", message: "Esgotado." });
    expect(sizeStates(base, { M: 99 }).find((s) => s.size === "M")?.available).toBe(true);
  });

  it("mantém a ordem da grade", () => {
    expect(sizeStates(base).map((s) => s.size)).toEqual(["P", "M", "G", "XG"]);
  });
});

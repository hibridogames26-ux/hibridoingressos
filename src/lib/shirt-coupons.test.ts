import { describe, expect, it } from "vitest";
import {
  MAX_BATCH,
  couponBuyerLimitText,
  couponDescription,
  couponDiscountCents,
  couponFinalCents,
  couponStatus,
  couponUsesText,
  couponValidityText,
  generateBatchCodes,
  generateCouponCode,
  isFreeCoupon,
  isValidCouponCode,
  normalizeCouponCode,
  parseBatchForm,
  parseBrasiliaLocal,
  parseCouponForm,
  testCouponInsert,
  toBrasiliaLocalInput,
  toCouponRow,
  type ShirtCouponRow,
} from "./shirt-coupons";

const NOW = Date.parse("2026-10-20T12:00:00Z");

const row = (over: Partial<ShirtCouponRow> = {}): ShirtCouponRow => ({
  id: "c1",
  code: "CAMPANHA10",
  kind: "percent",
  value: 10,
  max_uses: 50,
  valid_from: null,
  valid_until: null,
  active: true,
  is_test: false,
  campaign: "Instagram",
  notes: null,
  created_at: "2026-10-01T00:00:00Z",
  max_per_buyer: null,
  paid_uses: 3,
  pending_uses: 0,
  discount_given_cents: 3000,
  revenue_cents: 27000,
  ...over,
});

describe("código do cupom", () => {
  it("normaliza: maiúsculas, sem espaços, até 32 caracteres", () => {
    expect(normalizeCouponCode("  campanha 10 ")).toBe("CAMPANHA10");
    expect(normalizeCouponCode("a".repeat(50))).toHaveLength(32);
    expect(normalizeCouponCode(null)).toBe("");
  });

  it("valida o formato igual ao do banco", () => {
    expect(isValidCouponCode("TESTE-R1")).toBe(true);
    expect(isValidCouponCode("A_B-9")).toBe(true);
    expect(isValidCouponCode("AB")).toBe(false);
    expect(isValidCouponCode("-ABC")).toBe(false);
    expect(isValidCouponCode("COM ESPACO")).toBe(false);
    expect(isValidCouponCode("minúsculo")).toBe(false);
  });

  it("gera códigos válidos com prefixo e sufixo sem caracteres ambíguos", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCouponCode("TESTE");
      expect(code).toMatch(/^TESTE-[A-HJKMNP-Z2-9]{4}$/);
      expect(isValidCouponCode(code)).toBe(true);
    }
    expect(generateCouponCode("X", () => 0)).toBe("X-AAAA");
  });
});

describe("valor final do cupom (mesmos números do banco)", () => {
  it("percentual, desconto em reais e valor final fixo", () => {
    expect(couponFinalCents("percent", 10, 8000)).toBe(7200);
    expect(couponFinalCents("amount", 500, 8000)).toBe(7500);
    expect(couponFinalCents("final", 100, 16000)).toBe(100);
    expect(couponDiscountCents("final", 100, 16000)).toBe(15900);
  });

  it("só o percentual de 100% zera o total (cortesia)", () => {
    expect(couponFinalCents("percent", 100, 8000)).toBe(0);
    expect(couponFinalCents("percent", 100, 24000)).toBe(0);
    expect(couponDiscountCents("percent", 100, 8000)).toBe(8000);
    expect(isFreeCoupon("percent", 100)).toBe(true);
    expect(isFreeCoupon("percent", 99)).toBe(false);
    expect(isFreeCoupon("amount", 100)).toBe(false);
    expect(couponFinalCents("percent", 99, 8000)).toBe(100);
    expect(couponFinalCents("amount", 8000, 8000)).toBe(100);
  });

  it("nunca abaixo de R$ 1,00 nem acima do preço", () => {
    expect(couponFinalCents("amount", 99999, 8000)).toBe(100);
    expect(couponFinalCents("percent", 99, 100)).toBe(100);
    expect(couponFinalCents("final", 20000, 8000)).toBe(8000);
    expect(couponDiscountCents("final", 20000, 8000)).toBe(0);
  });
});

describe("descrição, usos e validade", () => {
  it("descreve cada tipo", () => {
    expect(couponDescription({ kind: "percent", value: 10 })).toBe("10% de desconto");
    expect(couponDescription({ kind: "amount", value: 1500 })).toMatch(/15,00 de desconto$/);
    expect(couponDescription({ kind: "final", value: 100 })).toMatch(/^Valor final .*1,00$/);
    expect(couponDescription({ kind: "percent", value: 100 })).toBe("100% de desconto (sem pagamento)");
  });

  it("conta pagas e reservas nos usos", () => {
    expect(couponUsesText(row({ paid_uses: 3, pending_uses: 1 }))).toBe("4 / 50");
    expect(couponUsesText(row({ max_uses: null, paid_uses: 2 }))).toBe("2 / sem limite");
  });

  it("texto de validade", () => {
    expect(couponValidityText({ valid_from: null, valid_until: null })).toBe("Sem prazo");
    expect(couponValidityText({ valid_from: null, valid_until: "2026-11-10T02:59:00Z" })).toMatch(/^Até 09\/11\/2026/);
    expect(couponValidityText({ valid_from: "2026-11-20T03:00:00Z", valid_until: null })).toMatch(/^A partir de 20\/11\/2026/);
  });
});

describe("situação do cupom", () => {
  it("ativo por padrão", () => {
    expect(couponStatus(row(), NOW)).toBe("ativo");
  });

  it("desativado vence tudo", () => {
    expect(couponStatus(row({ active: false, paid_uses: 50 }), NOW)).toBe("desativado");
  });

  it("encerrado, esgotado e agendado", () => {
    expect(couponStatus(row({ valid_until: "2026-10-01T00:00:00Z" }), NOW)).toBe("encerrado");
    expect(couponStatus(row({ paid_uses: 48, pending_uses: 2 }), NOW)).toBe("esgotado");
    expect(couponStatus(row({ valid_from: "2026-11-20T00:00:00Z" }), NOW)).toBe("agendado");
  });

  it("sem limite de usos nunca esgota", () => {
    expect(couponStatus(row({ max_uses: null, paid_uses: 9999 }), NOW)).toBe("ativo");
  });
});

describe("datas no horário de Brasília", () => {
  it("converte para ISO (UTC−3)", () => {
    expect(parseBrasiliaLocal("2026-11-10T23:59")).toBe("2026-11-11T02:59:00.000Z");
    expect(parseBrasiliaLocal("2026-11-10", true)).toBe("2026-11-11T02:59:00.000Z");
    expect(parseBrasiliaLocal("2026-11-10")).toBe("2026-11-10T03:00:00.000Z");
  });

  it("recusa texto inválido", () => {
    expect(parseBrasiliaLocal("10/11/2026")).toBeNull();
    expect(parseBrasiliaLocal("")).toBeNull();
    expect(parseBrasiliaLocal("2026-13-40")).toBeNull();
  });

  it("ida e volta para o campo datetime-local", () => {
    const iso = parseBrasiliaLocal("2026-11-10T23:59")!;
    expect(toBrasiliaLocalInput(iso)).toBe("2026-11-10T23:59");
    expect(toBrasiliaLocalInput(null)).toBe("");
  });
});

describe("parseCouponForm", () => {
  const ok = { code: "campanha 10", kind: "percent", value: "10" };

  it("aceita um cupom percentual e normaliza o código", () => {
    expect(parseCouponForm(ok)).toEqual({
      ok: true,
      coupon: { code: "CAMPANHA10", kind: "percent", value: 10, max_uses: null, valid_from: null, valid_until: null, campaign: null, is_test: false, max_per_buyer: null },
    });
  });

  it("converte reais para centavos e lê limite, datas e campanha", () => {
    const result = parseCouponForm({
      code: "PARCEIRO-01", kind: "amount", value: "15,50", maxUses: "20", validFrom: "2026-10-20T08:00", validUntil: "2026-10-31", campaign: " Parceria ", isTest: true,
    });
    expect(result).toMatchObject({
      ok: true,
      coupon: { value: 1550, max_uses: 20, valid_from: "2026-10-20T11:00:00.000Z", valid_until: "2026-11-01T02:59:00.000Z", campaign: "Parceria", is_test: true },
    });
  });

  it("recusa código ausente ou inválido", () => {
    expect(parseCouponForm({ ...ok, code: "" })).toMatchObject({ ok: false, message: "Informe o código do cupom." });
    expect(parseCouponForm({ ...ok, code: "ab" })).toMatchObject({ ok: false });
  });

  it("valida o valor de cada tipo", () => {
    expect(parseCouponForm({ ...ok, value: "101", maxUses: "1" })).toMatchObject({ ok: false, message: "O percentual precisa ser um número inteiro de 1 a 100." });
    expect(parseCouponForm({ ...ok, value: "0" })).toMatchObject({ ok: false });
    expect(parseCouponForm({ ...ok, value: "10,5" })).toMatchObject({ ok: false });
    expect(parseCouponForm({ ...ok, kind: "amount", value: "" })).toMatchObject({ ok: false });
    expect(parseCouponForm({ ...ok, kind: "final", value: "0,50" })).toMatchObject({ ok: false, message: "O valor final mínimo é R$ 1,00." });
    expect(parseCouponForm({ ...ok, kind: "final", value: "1" })).toMatchObject({ ok: true });
    expect(parseCouponForm({ ...ok, kind: "outro" })).toMatchObject({ ok: false });
  });

  it("valida limite de usos e janela", () => {
    expect(parseCouponForm({ ...ok, maxUses: "0" })).toMatchObject({ ok: false });
    expect(parseCouponForm({ ...ok, maxUses: "abc" })).toMatchObject({ ok: false });
    expect(parseCouponForm({ ...ok, validUntil: "amanhã" })).toMatchObject({ ok: false });
    expect(parseCouponForm({ ...ok, validFrom: "2026-11-10T10:00", validUntil: "2026-11-10T09:00" })).toMatchObject({ ok: false });
  });
});

describe("cupom de teste", () => {
  it("valor final R$ 1,00, 2 usos (Pix e cartão) e 24 horas", () => {
    const t = testCouponInsert(NOW, () => 0);
    expect(t).toEqual({
      code: "TESTE-AAAA",
      kind: "final",
      value: 100,
      max_uses: 2,
      valid_from: null,
      valid_until: "2026-10-21T12:00:00.000Z",
      campaign: "Teste de pagamento",
      is_test: true,
      max_per_buyer: null,
    });
  });
});

describe("toCouponRow", () => {
  it("converte contagens que chegam como texto", () => {
    const c = toCouponRow({ ...row(), paid_uses: "3", pending_uses: "1", discount_given_cents: "3000", revenue_cents: "27000", max_uses: null, max_per_buyer: "2" });
    expect([c.paid_uses, c.pending_uses, c.discount_given_cents, c.revenue_cents, c.max_uses, c.max_per_buyer]).toEqual([3, 1, 3000, 27000, null, 2]);
  });
});

describe("limite por CPF", () => {
  it("texto do limite", () => {
    expect(couponBuyerLimitText({ max_per_buyer: null })).toBe("Sem limite por CPF");
    expect(couponBuyerLimitText({ max_per_buyer: 1 })).toBe("1 uso por CPF");
    expect(couponBuyerLimitText({ max_per_buyer: 3 })).toBe("3 usos por CPF");
  });

  it("o cupom de 100% é aceito só com limite de usos", () => {
    const free = { code: "cortesia", kind: "percent", value: "100" };
    expect(parseCouponForm(free)).toEqual({
      ok: false,
      message: "O cupom de 100% precisa de um limite de usos: cada uso é uma camisa sem pagamento.",
    });
    expect(parseCouponForm({ ...free, maxUses: "5" })).toMatchObject({ ok: true, coupon: { code: "CORTESIA", kind: "percent", value: 100, max_uses: 5 } });
    // 99% continua livre de limite: só o 100% é de graça.
    expect(parseCouponForm({ ...free, value: "99" })).toMatchObject({ ok: true, coupon: { max_uses: null } });
  });

  it("o formulário lê e valida o limite por CPF", () => {
    const ok = { code: "CAMP10", kind: "percent", value: "10" };
    expect(parseCouponForm({ ...ok, maxPerBuyer: "1" })).toMatchObject({ ok: true, coupon: { max_per_buyer: 1 } });
    expect(parseCouponForm({ ...ok, maxPerBuyer: "" })).toMatchObject({ ok: true, coupon: { max_per_buyer: null } });
    expect(parseCouponForm({ ...ok, maxPerBuyer: "0" })).toMatchObject({ ok: false });
    expect(parseCouponForm({ ...ok, maxPerBuyer: "x" })).toMatchObject({ ok: false });
  });
});

describe("vários códigos de uma vez", () => {
  const form = { prefix: "parceiro", count: "10", kind: "amount", value: "15", validUntil: "2026-11-10T23:59", campaign: "Parceria" };

  it("lê o formulário: prefixo normalizado, 1 uso por código por padrão", () => {
    const result = parseBatchForm(form);
    expect(result).toMatchObject({
      ok: true,
      prefix: "PARCEIRO",
      count: 10,
      template: { kind: "amount", value: 1500, max_uses: 1, campaign: "Parceria", is_test: false, valid_until: "2026-11-11T02:59:00.000Z" },
    });
    expect(result.ok && "code" in result.template).toBe(false);
  });

  it("valida prefixo, quantidade e o desconto", () => {
    expect(parseBatchForm({ ...form, prefix: "a" })).toMatchObject({ ok: false });
    expect(parseBatchForm({ ...form, prefix: "com espaço!" })).toMatchObject({ ok: false });
    expect(parseBatchForm({ ...form, count: "0" })).toMatchObject({ ok: false });
    expect(parseBatchForm({ ...form, count: String(MAX_BATCH + 1) })).toMatchObject({ ok: false });
    expect(parseBatchForm({ ...form, value: "" })).toMatchObject({ ok: false });
    expect(parseBatchForm({ ...form, maxUses: "5", maxPerBuyer: "1" })).toMatchObject({ ok: true, template: { max_uses: 5, max_per_buyer: 1 } });
  });

  it("gera códigos únicos e válidos, sem repetir os já usados", () => {
    // Com um sorteio fixo só existe um código possível: se já foi usado, não gera repetido.
    expect(generateBatchCodes("P", 5, ["P-KKKK"], () => 0.3)).toEqual([]);
    expect(generateBatchCodes("P", 5, [], () => 0.3)).toEqual(["P-KKKK"]);

    const real = generateBatchCodes("PARCEIRO", 100, ["PARCEIRO-AAAA"]);
    expect(new Set(real).size).toBe(100);
    expect(real.every(isValidCouponCode)).toBe(true);
    expect(real).not.toContain("PARCEIRO-AAAA");
  });
});

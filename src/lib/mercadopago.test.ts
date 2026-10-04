import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { amountsOf, paymentMethodOf, pickRelevantPayment, rejectionMessage } = await import("./mercadopago");

const base = {
  status_detail: null,
  external_reference: "o1",
  payment_method_id: "pix",
  payment_type_id: "bank_transfer",
  transaction_amount: 10,
  date_approved: null,
  date_of_expiration: null,
};

describe("mercadopago helpers", () => {
  it("extrai total, taxa e líquido em centavos", () => {
    expect(
      amountsOf({
        ...base,
        id: 1,
        status: "approved",
        date_created: "2026-10-05T10:00:00Z",
        transaction_amount: 10.52,
        fee_details: [{ type: "mercadopago_fee", amount: 0.52 }],
        transaction_details: { net_received_amount: 10 },
      }),
    ).toEqual({ total: 1052, fee: 52, net: 1000 });
  });

  it("mapeia a forma de pagamento", () => {
    expect(paymentMethodOf({ payment_method_id: "pix", payment_type_id: "bank_transfer" })).toBe("pix");
    expect(paymentMethodOf({ payment_method_id: "visa", payment_type_id: "credit_card" })).toBe("cartao");
  });

  it("prioriza pagamento aprovado sobre tentativas recusadas mais novas", () => {
    const p = pickRelevantPayment([
      { ...base, id: 3, status: "rejected", date_created: "2026-10-05T10:03:00Z" },
      { ...base, id: 2, status: "approved", date_created: "2026-10-05T10:02:00Z" },
      { ...base, id: 1, status: "pending", date_created: "2026-10-05T10:01:00Z" },
    ]);
    expect(p.id).toBe(2);
  });

  it("mensagem de recusa amigável", () => {
    expect(rejectionMessage("cc_rejected_insufficient_amount")).toBe("Saldo ou limite insuficiente.");
    expect(rejectionMessage("x")).toMatch(/Tente outro cartão/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const from = vi.fn();
const sendShirtOrderEmail = vi.fn();

const claimChain = (data: unknown[]) => ({
  update: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data }) }) }) }) }),
});

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc, from }) }));
vi.mock("@/lib/email", () => ({ sendShirtOrderEmail }));

const { applyShirtMpPayment, getShirtOrderForBuyer, shirtAmountsOf } = await import("./shirt-order-service");

const ID = "3f0c2a52-9d3e-4c1e-8f55-0a6d9b1c7e21";
const payment = (status: string, over = {}) => ({
  id: 987,
  status,
  status_detail: status === "approved" ? "accredited" : "pending_waiting_transfer",
  external_reference: `shirt:${ID}`,
  payment_method_id: "pix",
  payment_type_id: "bank_transfer",
  transaction_amount: 80,
  date_approved: status === "approved" ? "2026-10-20T15:30:00Z" : null,
  date_created: "2026-10-20T15:29:00Z",
  date_of_expiration: null,
  fee_details: [{ type: "mercadopago_fee", amount: 0.79 }],
  transaction_details: { net_received_amount: 79.21 },
  ...over,
});

describe("applyShirtMpPayment", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    sendShirtOrderEmail.mockReset();
  });

  it("aprovado: grava valores em centavos e tenta enviar o e-mail uma única vez", async () => {
    rpc.mockResolvedValue({ data: "pago", error: null });
    from.mockReturnValue(claimChain([]));

    expect(await applyShirtMpPayment(payment("approved") as never, ID)).toBe("pago");
    expect(rpc).toHaveBeenCalledWith("apply_shirt_payment", {
      p_order_id: ID,
      p_mp_payment_id: "987",
      p_mp_status: "approved",
      p_status_detail: "accredited",
      p_method: "pix",
      p_total_cents: 8000,
      p_fee_cents: 79,
      p_net_cents: 7921,
      p_paid_at: "2026-10-20T15:30:00Z",
    });
    expect(from).toHaveBeenCalledWith("shirt_orders"); // reivindica o envio do e-mail
  });

  it("pendente: não grava taxas nem envia e-mail", async () => {
    rpc.mockResolvedValue({ data: "pendente", error: null });

    expect(await applyShirtMpPayment(payment("pending") as never, ID)).toBe("pendente");
    expect(rpc).toHaveBeenCalledWith(
      "apply_shirt_payment",
      expect.objectContaining({ p_fee_cents: 0, p_net_cents: 0, p_mp_status: "pending" }),
    );
    expect(from).not.toHaveBeenCalled();
    expect(sendShirtOrderEmail).not.toHaveBeenCalled();
  });

  it("aprovado que o banco não confirmou (valor divergente) não envia e-mail", async () => {
    rpc.mockResolvedValue({ data: "pendente", error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await applyShirtMpPayment(payment("approved", { transaction_amount: 1 }) as never, ID)).toBe("pendente");
    expect(from).not.toHaveBeenCalled();
  });

  it("propaga falha do banco para o webhook reenviar", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(applyShirtMpPayment(payment("approved") as never, ID)).rejects.toThrow(/boom/);
  });
});

describe("shirtAmountsOf", () => {
  it("quando fee_details fecha com o líquido, usa a taxa informada", () => {
    expect(shirtAmountsOf(payment("approved") as never)).toEqual({ total: 8000, net: 7921, fee: 79 });
  });

  it("quando fee_details lista só parte do que foi retido, a taxa é total − líquido", () => {
    // Pagamento real de R$ 1,05 no cartão: fee_details = R$ 0,03, mas o líquido foi R$ 0,99.
    const real = payment("approved", { transaction_amount: 1.05, fee_details: [{ type: "mercadopago_fee", amount: 0.03 }], transaction_details: { net_received_amount: 0.99 } });
    expect(shirtAmountsOf(real as never)).toEqual({ total: 105, net: 99, fee: 6 });
  });

  it("sem líquido informado, calcula pelo fee_details", () => {
    const noNet = payment("approved", { transaction_details: undefined });
    expect(shirtAmountsOf(noNet as never)).toEqual({ total: 8000, net: 7921, fee: 79 });
  });
});

describe("getShirtOrderForBuyer", () => {
  it("recusa id ou chave fora do formato sem consultar o banco", async () => {
    from.mockReset();
    expect(await getShirtOrderForBuyer("nao-uuid", "a".repeat(64))).toBeNull();
    expect(await getShirtOrderForBuyer(ID, undefined)).toBeNull();
    expect(await getShirtOrderForBuyer(ID, "curta")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("recusa chave incorreta mesmo com a encomenda existente", async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: ID, access_key: "b".repeat(64) }, error: null }) }) }),
    });
    expect(await getShirtOrderForBuyer(ID, "a".repeat(64))).toBeNull();
  });

  it("devolve a encomenda com a chave correta", async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: ID, access_key: "b".repeat(64) }, error: null }) }) }),
    });
    expect(await getShirtOrderForBuyer(ID, "b".repeat(64))).toMatchObject({ id: ID });
  });
});

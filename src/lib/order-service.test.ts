import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const applyShirtMpPayment = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ rpc, from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [] }) }) }) }) }) }) }),
}));
vi.mock("@/lib/shirt-order-service", () => ({ applyShirtMpPayment }));
vi.mock("@/lib/email", () => ({ sendTicketsEmail: vi.fn() }));

const { applyMpPayment } = await import("./order-service");

const ID = "3f0c2a52-9d3e-4c1e-8f55-0a6d9b1c7e21";
const payment = (external_reference: string | null) => ({
  id: 1,
  status: "approved",
  status_detail: "accredited",
  external_reference,
  payment_method_id: "pix",
  payment_type_id: "bank_transfer",
  transaction_amount: 80,
  date_approved: "2026-10-20T15:30:00Z",
  date_created: "2026-10-20T15:29:00Z",
  date_of_expiration: null,
});

describe("applyMpPayment: separação entre ingressos e camisas", () => {
  beforeEach(() => {
    rpc.mockReset();
    applyShirtMpPayment.mockReset();
  });

  it("encaminha 'shirt:<uuid>' ao serviço de camisas sem tocar nos ingressos", async () => {
    applyShirtMpPayment.mockResolvedValue("pago");
    const status = await applyMpPayment(payment(`shirt:${ID}`));
    expect(status).toBe("pago");
    expect(applyShirtMpPayment).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), ID);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mantém o fluxo de ingressos para referência em UUID puro", async () => {
    rpc.mockResolvedValue({ data: "pendente", error: null });
    const status = await applyMpPayment({ ...payment(ID), status: "pending" });
    expect(status).toBe("pendente");
    expect(rpc).toHaveBeenCalledWith("apply_payment", expect.objectContaining({ p_order_id: ID }));
    expect(applyShirtMpPayment).not.toHaveBeenCalled();
  });

  it("ignora referências desconhecidas", async () => {
    expect(await applyMpPayment(payment("outra-coisa"))).toBeNull();
    expect(await applyMpPayment(payment(null))).toBeNull();
    expect(await applyMpPayment(payment("shirt:nao-e-uuid"))).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(applyShirtMpPayment).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { computeTestFlow, type TestFlowInput, type TestOrderInfo } from "./shirt-test-flow";

const order = (over: Partial<TestOrderInfo> = {}): TestOrderInfo => ({
  id: "o1",
  size: "M",
  status: "pago",
  payment_method: "pix",
  created_at: "2026-10-20T12:00:00Z",
  ...over,
});

const start: TestFlowInput = { missingConditions: 0, mode: "cupom", coupon: null, orders: [], checkedAt: null, refundsDoneAt: null };

describe("computeTestFlow", () => {
  it("começa nas condições da venda quando falta algo", () => {
    const flow = computeTestFlow({ ...start, missingConditions: 3, mode: "fechada" });
    expect(flow.stage).toBe(1);
    expect(flow.states[0]).toBe("current");
    expect(flow.states.slice(1).every((s) => s === "pending")).toBe(true);
  });

  it("com as condições completas, pede o modo Somente com cupom", () => {
    expect(computeTestFlow({ ...start, mode: "fechada" }).stage).toBe(2);
  });

  it("modo cupom e sem cupom de teste: passo 3 (criar o cupom)", () => {
    const flow = computeTestFlow(start);
    expect(flow.stage).toBe(3);
    expect(flow.states.slice(0, 2)).toEqual(["done", "done"]);
  });

  it("cupom de teste ativo: passo 4 (pagar)", () => {
    const flow = computeTestFlow({ ...start, coupon: { code: "TESTE-AAAA", status: "ativo" } });
    expect(flow.stage).toBe(4);
    expect(flow.paid).toBe(false);
  });

  it("cupom já usado ou encerrado não conta como criado, mas a encomenda feita sim", () => {
    expect(computeTestFlow({ ...start, coupon: { code: "T", status: "encerrado" } }).stage).toBe(3);
    expect(computeTestFlow({ ...start, coupon: { code: "T", status: "esgotado" }, orders: [order({ status: "pendente" })] }).stage).toBe(4);
  });

  it("pagamento confirmado leva à conferência e mostra os meios pagos", () => {
    const flow = computeTestFlow({ ...start, coupon: { code: "T", status: "ativo" }, orders: [order(), order({ id: "o2", payment_method: "cartao", status: "pendente" })] });
    expect(flow.stage).toBe(5);
    expect(flow.methodsPaid).toEqual({ pix: true, cartao: false });
    expect(flow.hasUnrefunded).toBe(true);
  });

  it("conferido leva aos estornos; estorno pelo Mercado Pago conclui o passo sozinho", () => {
    const paid = { ...start, coupon: { code: "T", status: "ativo" as const }, orders: [order()], checkedAt: "2026-10-20T13:00:00Z" };
    expect(computeTestFlow(paid).stage).toBe(6);
    const refunded = { ...paid, orders: [order({ status: "estornado" })] };
    expect(computeTestFlow(refunded).stage).toBe(7);
    expect(computeTestFlow(refunded).hasUnrefunded).toBe(false);
  });

  it("estornos podem ser pulados pelo admin", () => {
    const flow = computeTestFlow({ ...start, orders: [order()], checkedAt: "x", refundsDoneAt: "y" });
    expect(flow.stage).toBe(7);
  });

  it("tudo feito: venda aberta ao público", () => {
    const flow = computeTestFlow({ ...start, mode: "aberta", orders: [order({ status: "estornado" })], checkedAt: "x" });
    expect(flow.stage).toBe(8);
    expect(flow.states.every((s) => s === "done")).toBe(true);
  });
});

import type { OrderStatus, PaymentMethod } from "@/lib/labels";
import type { CouponStatus } from "@/lib/shirt-coupons";
import type { SalesMode } from "@/lib/shirts";

export type TestOrderInfo = {
  id: string;
  size: string;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  created_at: string;
};

export type TestFlowInput = {
  /** Quantas das 9 condições comerciais ainda faltam. */
  missingConditions: number;
  mode: SalesMode;
  /** Último cupom de teste criado, ou null. */
  coupon: { code: string; status: CouponStatus } | null;
  /** Encomendas feitas com cupom de teste. */
  orders: TestOrderInfo[];
  checkedAt: string | null;
  refundsDoneAt: string | null;
};

export type TestStepState = "done" | "current" | "pending";

export type TestFlow = {
  /** Passo atual (1 a 7), ou 8 quando tudo foi feito. */
  stage: number;
  states: TestStepState[];
  paid: boolean;
  methodsPaid: { pix: boolean; cartao: boolean };
  /** Há encomenda de teste paga que ainda não foi estornada. */
  hasUnrefunded: boolean;
};

/**
 * Roteiro do teste de pagamento. Cada passo se confirma sozinho pelos dados do banco,
 * exceto "conferir" e "estornos", que o admin marca (e podem ser pulados).
 */
export function computeTestFlow(input: TestFlowInput): TestFlow {
  const settled = input.orders.filter((o) => o.status === "pago" || o.status === "estornado");
  const stillPaid = input.orders.filter((o) => o.status === "pago");

  const done = [
    input.missingConditions === 0,
    input.mode === "cupom" || input.mode === "aberta",
    input.coupon?.status === "ativo" || input.orders.length > 0,
    settled.length > 0,
    input.checkedAt !== null,
    input.refundsDoneAt !== null || (settled.length > 0 && stillPaid.length === 0),
    input.mode === "aberta",
  ];

  const first = done.findIndex((d) => !d);
  const stage = first === -1 ? 8 : first + 1;
  const states: TestStepState[] = done.map((d, i) => (d ? "done" : i + 1 === stage ? "current" : "pending"));

  return {
    stage,
    states,
    paid: settled.length > 0,
    methodsPaid: {
      pix: settled.some((o) => o.payment_method === "pix"),
      cartao: settled.some((o) => o.payment_method === "cartao"),
    },
    hasUnrefunded: stillPaid.length > 0,
  };
}

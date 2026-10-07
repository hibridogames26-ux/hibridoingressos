import type { PaymentMethod } from "@/lib/labels";

/**
 * Taxas do Mercado Pago informadas pela organização (em pontos-base: 498 = 4,98%).
 * O valor real de cada pagamento vem do próprio Mercado Pago no webhook;
 * estas taxas servem para estimativas e como fallback.
 */
export const MP_FEE_BPS: Record<PaymentMethod, number> = {
  cartao: 498,
  pix: 99,
};

export function feeRateLabel(method: PaymentMethod) {
  return `${(MP_FEE_BPS[method] / 100).toFixed(2).replace(".", ",")}%`;
}

/** Taxa estimada em centavos (arredondada ao centavo). */
export function estimateFeeCents(method: PaymentMethod, totalCents: number) {
  return Math.round((totalCents * MP_FEE_BPS[method]) / 10_000);
}

export function estimateNetCents(method: PaymentMethod, totalCents: number) {
  return totalCents - estimateFeeCents(method, totalCents);
}

/**
 * Formas de pagamento cuja taxa é repassada ao comprador: ele paga o valor do
 * ingresso + a taxa, e a organização recebe o valor cheio do ingresso.
 * Decisão da organização: repassar no cartão de crédito; no Pix a taxa é absorvida.
 */
export const FEE_PASSED_TO_BUYER: Record<PaymentMethod, boolean> = {
  cartao: true,
  pix: false,
};

/**
 * Valor cobrado do comprador por um subtotal (em centavos).
 * Com repasse, é o menor valor cujo líquido (após a taxa do MP sobre o total
 * cobrado) cobre o subtotal: total = subtotal / (1 − taxa), arredondado para cima.
 */
export function chargeCents(method: PaymentMethod, subtotalCents: number) {
  return chargeWithPassThrough(method, subtotalCents, FEE_PASSED_TO_BUYER);
}

/** Mesma conta de `chargeCents`, com a política de repasse informada (ex.: camisas). */
export function chargeWithPassThrough(
  method: PaymentMethod,
  subtotalCents: number,
  passedToBuyer: Record<PaymentMethod, boolean>,
) {
  if (!passedToBuyer[method] || subtotalCents <= 0) return subtotalCents;
  const bps = MP_FEE_BPS[method];
  let total = Math.ceil((subtotalCents * 10_000) / (10_000 - bps)) - 1;
  while (estimateNetCents(method, total) < subtotalCents) total++;
  return total;
}

/** Acréscimo pago pelo comprador (taxa repassada), em centavos. */
export function surchargeCents(method: PaymentMethod, subtotalCents: number) {
  return chargeCents(method, subtotalCents) - subtotalCents;
}

/** Quanto a organização recebe por um subtotal, já considerando o repasse. */
export function organizerReceivesCents(method: PaymentMethod, subtotalCents: number) {
  return estimateNetCents(method, chargeCents(method, subtotalCents));
}

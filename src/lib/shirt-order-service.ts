import "server-only";
import { timingSafeEqual } from "node:crypto";
import { shirtChargeCents } from "@/config/shirts";
import { sendShirtOrderEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import type { OrderStatus, PaymentMethod, ShirtFulfillment } from "@/lib/labels";
import {
  amountsOf,
  paymentMethodOf,
  pickRelevantPayment,
  searchPaymentsByReference,
  type MpPayment,
} from "@/lib/mercadopago";
import { shirtReference } from "@/lib/payment-ref";
import { shirtOrderPath } from "@/lib/shirts";
import { createAdminClient } from "@/lib/supabase/server";

export type ShirtBuyerOrder = {
  id: string;
  access_key: string;
  code: string;
  buyer_name: string;
  buyer_email: string;
  buyer_cpf: string;
  size: string;
  quantity: number;
  product_name: string;
  unit_price_cents: number;
  production_lead_time: string;
  receipt_details: string;
  purchase_policy: string;
  subtotal_cents: number;
  total_cents: number;
  status: OrderStatus;
  fulfillment_status: ShirtFulfillment;
  payment_method: PaymentMethod | null;
  expires_at: string | null;
  mp_payment_id: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  paid_at: string | null;
  confirmation_email_sent_at: string | null;
  coupon_code: string | null;
  discount_cents: number;
  is_test: boolean;
};

const ORDER_SELECT =
  "id, access_key, code, buyer_name, buyer_email, buyer_cpf, size, quantity, product_name, unit_price_cents, production_lead_time, receipt_details, purchase_policy, subtotal_cents, total_cents, status, fulfillment_status, payment_method, expires_at, mp_payment_id, mp_status, mp_status_detail, paid_at, confirmation_email_sent_at, coupon_code, discount_cents, is_test";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameKey(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Encomenda visível ao comprador somente com a chave secreta do link. */
export async function getShirtOrderForBuyer(id: string, key: string | undefined): Promise<ShirtBuyerOrder | null> {
  if (!UUID.test(id) || !key || !/^[0-9a-f]{64}$/.test(key)) return null;
  const { data, error } = await createAdminClient()
    .from("shirt_orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle<ShirtBuyerOrder>();
  if (error) throw new Error(`Falha ao carregar a encomenda: ${error.message}`);
  if (!data || !sameKey(data.access_key, key)) return null;
  return data;
}

export const shirtOrderUrl = (order: Pick<ShirtBuyerOrder, "id" | "access_key">) =>
  `${siteUrl()}${shirtOrderPath(order)}`;

/**
 * Valores em centavos. A taxa gravada é tudo o que o Mercado Pago reteve (total − líquido),
 * para taxas, líquido e receita bruta sempre fecharem; `fee_details` pode listar só parte.
 */
export function shirtAmountsOf(payment: MpPayment) {
  const { total, fee, net } = amountsOf(payment);
  return { total, net, fee: Math.max(fee, total - net) };
}

/** Aplica um pagamento do MP à encomenda (idempotente) e dispara o e-mail se ficou paga. */
export async function applyShirtMpPayment(payment: MpPayment, orderId: string): Promise<OrderStatus> {
  const { total, fee, net } = shirtAmountsOf(payment);
  const approved = payment.status === "approved";
  const { data, error } = await createAdminClient().rpc("apply_shirt_payment", {
    p_order_id: orderId,
    p_mp_payment_id: String(payment.id),
    p_mp_status: payment.status,
    p_status_detail: payment.status_detail,
    p_method: paymentMethodOf(payment),
    p_total_cents: total,
    p_fee_cents: approved ? fee : 0,
    p_net_cents: approved ? net : 0,
    p_paid_at: payment.date_approved,
  });
  if (error) throw new Error(`Falha ao aplicar pagamento ${payment.id} da camisa: ${error.message}`);

  const status = data as OrderStatus;
  if (approved && status !== "pago") {
    console.error(`Pagamento ${payment.id} aprovado não confirmou a encomenda ${orderId} (status ${status}): conferir valor.`);
  }
  if (status === "pago") await sendShirtEmailOnce(orderId);
  return status;
}

/** Consulta o MP pelos pagamentos da encomenda e aplica o mais relevante. */
export async function syncShirtOrderWithMp(orderId: string): Promise<OrderStatus | null> {
  const payments = await searchPaymentsByReference(shirtReference(orderId));
  if (!payments.length) return null;
  return applyShirtMpPayment(pickRelevantPayment(payments), orderId);
}

/** Valor que deve ser cobrado da encomenda por forma de pagamento. */
export const shirtAmountFor = (order: Pick<ShirtBuyerOrder, "subtotal_cents">, method: PaymentMethod) =>
  shirtChargeCents(method, order.subtotal_cents);

/** Envio único: marca antes de enviar; se falhar, desmarca para tentar de novo depois. */
export async function sendShirtEmailOnce(orderId: string) {
  const supabase = createAdminClient();
  const { data: claimed } = await supabase
    .from("shirt_orders")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pago")
    .is("confirmation_email_sent_at", null)
    .select("id");
  if (!claimed?.length) return;

  const release = () => supabase.from("shirt_orders").update({ confirmation_email_sent_at: null }).eq("id", orderId);
  try {
    const { data: order } = await supabase
      .from("shirt_orders")
      .select(ORDER_SELECT)
      .eq("id", orderId)
      .single<ShirtBuyerOrder>();
    if (!order) throw new Error("encomenda não encontrada");

    const sent = await sendShirtOrderEmail({
      to: order.buyer_email,
      buyerName: order.buyer_name,
      orderUrl: shirtOrderUrl(order),
      code: order.code,
      productName: order.product_name,
      size: order.size,
      quantity: order.quantity,
      paymentMethod: order.payment_method,
      totalCents: order.total_cents,
      leadTime: order.production_lead_time,
      receiptDetails: order.receipt_details,
    });
    if (!sent) await release();
  } catch (error) {
    console.error(`Error in sendShirtEmailOnce(${orderId}):`, error);
    await release();
  }
}

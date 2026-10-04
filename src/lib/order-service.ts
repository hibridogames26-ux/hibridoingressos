import "server-only";
import { timingSafeEqual } from "node:crypto";
import { sendTicketsEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import type { OrderStatus, PaymentMethod, TicketStatus } from "@/lib/labels";
import {
  amountsOf,
  paymentMethodOf,
  pickRelevantPayment,
  searchPaymentsByOrder,
  type MpPayment,
} from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/server";

export type BuyerOrder = {
  id: string;
  access_key: string;
  buyer_name: string;
  buyer_email: string;
  buyer_cpf: string;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  subtotal_cents: number;
  total_cents: number;
  expires_at: string | null;
  mp_payment_id: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  paid_at: string | null;
  tickets_email_sent_at: string | null;
  order_items: {
    quantity: number;
    unit_price_cents: number;
    holder_names: string[];
    ticket_types: { name: string; event_date: string } | null;
  }[];
  tickets: {
    id: string;
    holder_name: string;
    token: string;
    short_code: string;
    status: TicketStatus;
    redeemed_at: string | null;
    ticket_types: { name: string; event_date: string } | null;
  }[];
};

const ORDER_SELECT =
  "id, access_key, buyer_name, buyer_email, buyer_cpf, status, payment_method, subtotal_cents, total_cents, expires_at, mp_payment_id, mp_status, mp_status_detail, paid_at, tickets_email_sent_at, order_items(quantity, unit_price_cents, holder_names, ticket_types(name, event_date)), tickets(id, holder_name, token, short_code, status, redeemed_at, ticket_types(name, event_date))";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameKey(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Pedido visível ao comprador somente com a chave secreta do link. */
export async function getOrderForBuyer(id: string, key: string | undefined): Promise<BuyerOrder | null> {
  if (!UUID.test(id) || !key || !/^[0-9a-f]{64}$/.test(key)) return null;
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle<BuyerOrder>();
  if (error) throw new Error(`Falha ao carregar o pedido: ${error.message}`);
  if (!data || !sameKey(data.access_key, key)) return null;
  data.tickets.sort((a, b) => a.short_code.localeCompare(b.short_code));
  return data;
}

export const orderUrl = (order: Pick<BuyerOrder, "id" | "access_key">) =>
  `${siteUrl()}/pedido/${order.id}?k=${order.access_key}`;

/** Aplica um pagamento do MP ao pedido (idempotente) e dispara o e-mail se ficou pago. */
export async function applyMpPayment(payment: MpPayment): Promise<OrderStatus | null> {
  const orderId = payment.external_reference;
  if (!orderId || !UUID.test(orderId)) return null;

  const { total, fee, net } = amountsOf(payment);
  const { data, error } = await createAdminClient().rpc("apply_payment", {
    p_order_id: orderId,
    p_mp_payment_id: String(payment.id),
    p_mp_status: payment.status,
    p_status_detail: payment.status_detail,
    p_method: paymentMethodOf(payment),
    p_total_cents: total,
    p_fee_cents: payment.status === "approved" ? fee : 0,
    p_net_cents: payment.status === "approved" ? net : 0,
    p_paid_at: payment.date_approved,
  });
  if (error) throw new Error(`Falha ao aplicar pagamento ${payment.id}: ${error.message}`);

  const status = data as OrderStatus;
  if (status === "pago") await sendTicketsEmailOnce(orderId);
  return status;
}

/** Consulta o MP pelos pagamentos do pedido e aplica o mais relevante. */
export async function syncOrderWithMp(orderId: string): Promise<OrderStatus | null> {
  const payments = await searchPaymentsByOrder(orderId);
  if (!payments.length) return null;
  return applyMpPayment(pickRelevantPayment(payments));
}

/** Envio único: marca antes de enviar; se falhar, desmarca para tentar de novo depois. */
export async function sendTicketsEmailOnce(orderId: string) {
  const supabase = createAdminClient();
  const { data: claimed } = await supabase
    .from("orders")
    .update({ tickets_email_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pago")
    .is("tickets_email_sent_at", null)
    .select("id");
  if (!claimed?.length) return;

  try {
    const { data: order } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("id", orderId)
      .single<BuyerOrder>();
    if (!order) throw new Error("pedido não encontrado");

    const sent = await sendTicketsEmail({
      to: order.buyer_email,
      buyerName: order.buyer_name,
      orderUrl: orderUrl(order),
      paymentMethod: order.payment_method,
      totalCents: order.total_cents,
      tickets: order.tickets.map((t) => ({
        holderName: t.holder_name,
        ticketType: t.ticket_types?.name ?? "Ingresso",
        eventDate: t.ticket_types?.event_date ?? "",
        shortCode: t.short_code,
        token: t.token,
      })),
    });
    if (!sent) {
      await supabase.from("orders").update({ tickets_email_sent_at: null }).eq("id", orderId);
    }
  } catch (error) {
    console.error(`Error in sendTicketsEmailOnce(${orderId}):`, error);
    await supabase.from("orders").update({ tickets_email_sent_at: null }).eq("id", orderId);
  }
}

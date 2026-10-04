import "server-only";
import type { PaymentMethod } from "@/lib/labels";

const API = "https://api.mercadopago.com";

export type MpPayment = {
  id: number;
  status: string; // pending | approved | authorized | in_process | in_mediation | rejected | cancelled | refunded | charged_back
  status_detail: string | null;
  external_reference: string | null;
  payment_method_id: string;
  payment_type_id: string;
  transaction_amount: number;
  date_approved: string | null;
  date_created: string;
  date_of_expiration: string | null;
  fee_details?: { type: string; amount: number }[];
  transaction_details?: { net_received_amount?: number; total_paid_amount?: number };
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
};

function accessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("Variável de ambiente ausente: MERCADOPAGO_ACCESS_TOKEN");
  return token;
}

export class MpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function mpFetch<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const { idempotencyKey, headers, ...rest } = init;
  const response = await fetch(`${API}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message ?? response.statusText;
    throw new MpError(`Mercado Pago ${response.status}: ${message}`, response.status, body);
  }
  return body as T;
}

/** Valor em reais com 2 casas, como a API espera. */
const toReais = (cents: number) => Math.round(cents) / 100;

/** URL de notificação só quando o site é público (https). */
function notificationUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return site?.startsWith("https://") ? `${site}/api/mp/webhook` : undefined;
}

type Payer = { email: string; firstName: string; lastName: string; cpf: string };

export function createPixPayment(params: {
  orderId: string;
  amountCents: number;
  description: string;
  payer: Payer;
  expiresAt: Date;
  idempotencyKey: string;
}) {
  return mpFetch<MpPayment>("/v1/payments", {
    method: "POST",
    idempotencyKey: params.idempotencyKey,
    body: JSON.stringify({
      transaction_amount: toReais(params.amountCents),
      description: params.description,
      payment_method_id: "pix",
      external_reference: params.orderId,
      notification_url: notificationUrl(),
      date_of_expiration: params.expiresAt.toISOString().replace("Z", "+00:00"),
      payer: {
        email: params.payer.email,
        first_name: params.payer.firstName,
        last_name: params.payer.lastName,
        identification: { type: "CPF", number: params.payer.cpf },
      },
    }),
  });
}

export function createCardPayment(params: {
  orderId: string;
  amountCents: number;
  description: string;
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  payer: { email: string; identification?: { type: string; number: string } };
  idempotencyKey: string;
}) {
  return mpFetch<MpPayment>("/v1/payments", {
    method: "POST",
    idempotencyKey: params.idempotencyKey,
    body: JSON.stringify({
      transaction_amount: toReais(params.amountCents),
      description: params.description,
      token: params.token,
      installments: params.installments,
      payment_method_id: params.paymentMethodId,
      issuer_id: params.issuerId ? Number(params.issuerId) : undefined,
      external_reference: params.orderId,
      notification_url: notificationUrl(),
      statement_descriptor: "HIBRIDOGAMES",
      payer: params.payer,
    }),
  });
}

export const getPayment = (id: string | number) => mpFetch<MpPayment>(`/v1/payments/${encodeURIComponent(String(id))}`);

/** Todos os pagamentos de um pedido (o comprador pode ter tentado mais de uma vez). */
export async function searchPaymentsByOrder(orderId: string) {
  const qs = new URLSearchParams({
    external_reference: orderId,
    sort: "date_created",
    criteria: "desc",
    limit: "20",
  });
  const data = await mpFetch<{ results: MpPayment[] }>(`/v1/payments/search?${qs}`);
  return data.results ?? [];
}

export function cancelPayment(id: string | number) {
  return mpFetch<MpPayment>(`/v1/payments/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

export function paymentMethodOf(payment: Pick<MpPayment, "payment_method_id" | "payment_type_id">): PaymentMethod {
  return payment.payment_method_id === "pix" ? "pix" : "cartao";
}

/** Valores em centavos a partir do pagamento: total cobrado, taxas do MP e líquido. */
export function amountsOf(payment: MpPayment) {
  const total = Math.round(payment.transaction_amount * 100);
  const fee = Math.round((payment.fee_details ?? []).reduce((sum, f) => sum + (f.amount ?? 0), 0) * 100);
  const netReported = payment.transaction_details?.net_received_amount;
  const net = netReported ? Math.round(netReported * 100) : total - fee;
  return { total, fee, net };
}

/** Entre vários pagamentos do pedido, o que define o status: aprovado/estornado > em análise > mais recente. */
export function pickRelevantPayment(payments: MpPayment[]) {
  const rank = (s: string) =>
    ["approved", "refunded", "charged_back"].includes(s) ? 0 : ["in_process", "authorized", "pending"].includes(s) ? 1 : 2;
  return [...payments].sort(
    (a, b) => rank(a.status) - rank(b.status) || Date.parse(b.date_created) - Date.parse(a.date_created),
  )[0];
}

/** Mensagem amigável para recusas de cartão. */
export function rejectionMessage(detail: string | null | undefined) {
  const messages: Record<string, string> = {
    cc_rejected_insufficient_amount: "Saldo ou limite insuficiente.",
    cc_rejected_bad_filled_security_code: "Código de segurança inválido.",
    cc_rejected_bad_filled_date: "Data de validade inválida.",
    cc_rejected_bad_filled_card_number: "Número do cartão inválido.",
    cc_rejected_bad_filled_other: "Confira os dados do cartão.",
    cc_rejected_call_for_authorize: "Seu banco pediu autorização. Ligue para o banco e tente de novo.",
    cc_rejected_card_disabled: "Cartão desabilitado. Ligue para o banco para ativá-lo.",
    cc_rejected_duplicated_payment: "Pagamento duplicado. Aguarde alguns minutos antes de tentar de novo.",
    cc_rejected_high_risk: "Pagamento recusado por segurança. Tente outro cartão ou o Pix.",
    cc_rejected_max_attempts: "Muitas tentativas. Tente outro cartão ou o Pix.",
    cc_rejected_blacklist: "Pagamento recusado. Tente outro cartão ou o Pix.",
  };
  return (detail && messages[detail]) ?? "Pagamento recusado pelo banco. Tente outro cartão ou o Pix.";
}

"use server";

import type { CardInput, CardResult, PixResult } from "@/app/pedido/[id]/actions";
import { event } from "@/config/event";
import { shirtChargeCents } from "@/config/shirts";
import { onlyDigits, splitName } from "@/lib/checkout";
import type { OrderStatus } from "@/lib/labels";
import {
  MpError,
  cancelPayment,
  createCardPayment,
  createPixPayment,
  rejectionMessage,
  searchPaymentsByReference,
} from "@/lib/mercadopago";
import { shirtReference } from "@/lib/payment-ref";
import { applyShirtMpPayment, getShirtOrderForBuyer, syncShirtOrderWithMp, type ShirtBuyerOrder } from "@/lib/shirt-order-service";

// Pagamento da camisa: mesmo contrato das ações dos ingressos, com referência "shirt:<uuid>".

const PIX_MINUTES = 30;
const MIN_PIX_WINDOW_MS = 5 * 60 * 1000;

async function loadOrder(id: string, key: string): Promise<ShirtBuyerOrder> {
  const order = await getShirtOrderForBuyer(id, key);
  if (!order) throw new Error("Encomenda não encontrada.");
  return order;
}

const describe = (order: ShirtBuyerOrder) =>
  `${event.name} ${event.year} — Camisa oficial (${order.size} × ${order.quantity})`;

export async function startPix(id: string, key: string): Promise<PixResult> {
  try {
    const order = await loadOrder(id, key);
    if (order.status !== "pendente") return { ok: false, status: order.status, message: "Esta encomenda não está aguardando pagamento." };

    const reference = shirtReference(id);
    const payments = await searchPaymentsByReference(reference);
    if (payments.some((p) => p.status === "approved")) {
      const status = await syncShirtOrderWithMp(id);
      return { ok: false, status: status ?? undefined, message: "Pagamento já aprovado." };
    }
    if (payments.some((p) => p.status === "in_process" || p.status === "authorized")) {
      return { ok: false, message: "Há um pagamento com cartão em análise para esta encomenda. Aguarde a resposta." };
    }

    const now = Date.now();
    const reuse = payments.find(
      (p) =>
        p.payment_method_id === "pix" &&
        p.status === "pending" &&
        p.date_of_expiration &&
        Date.parse(p.date_of_expiration) - now > 60_000,
    );
    const pixData = reuse?.point_of_interaction?.transaction_data;
    if (reuse && pixData?.qr_code && pixData.qr_code_base64) {
      return { ok: true, qrCode: pixData.qr_code, qrBase64: pixData.qr_code_base64, expiresAt: reuse.date_of_expiration! };
    }

    // O Pix vence antes da reserva, para nunca ser pago depois de a reserva ser liberada.
    const reservationEnd = Date.parse(order.expires_at ?? "") - 5 * 60 * 1000;
    const expiresAt = new Date(Math.min(reservationEnd, now + PIX_MINUTES * 60 * 1000));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() - now < MIN_PIX_WINDOW_MS) {
      return { ok: false, message: "Sua reserva está expirando. Volte e faça uma nova encomenda." };
    }

    const { first, last } = splitName(order.buyer_name);
    const payment = await createPixPayment({
      orderId: id,
      reference,
      amountCents: shirtChargeCents("pix", order.subtotal_cents),
      description: describe(order),
      payer: { email: order.buyer_email, firstName: first, lastName: last || first, cpf: order.buyer_cpf },
      expiresAt,
      idempotencyKey: `${reference}-pix-${payments.length}`,
    });
    await applyShirtMpPayment(payment, id);

    const data = payment.point_of_interaction?.transaction_data;
    if (!data?.qr_code || !data.qr_code_base64) {
      return { ok: false, message: "O Mercado Pago não retornou o QR Code. Tente novamente." };
    }
    return {
      ok: true,
      qrCode: data.qr_code,
      qrBase64: data.qr_code_base64,
      expiresAt: payment.date_of_expiration ?? expiresAt.toISOString(),
    };
  } catch (error) {
    console.error("Error in startPix (camisa):", error);
    return { ok: false, message: "Não foi possível gerar o Pix agora. Tente novamente em instantes." };
  }
}

export async function payWithCard(id: string, key: string, input: CardInput): Promise<CardResult> {
  try {
    const order = await loadOrder(id, key);
    if (order.status !== "pendente") return { status: order.status, message: "Esta encomenda não está aguardando pagamento." };

    if (
      typeof input?.token !== "string" ||
      !input.token ||
      !Number.isInteger(input.installments) ||
      input.installments < 1 ||
      input.installments > 12 ||
      typeof input.payment_method_id !== "string"
    ) {
      return { status: "pendente", message: "Dados do cartão inválidos. Tente novamente." };
    }

    // Evita cobrança dupla: cancela Pix pendente desta encomenda antes de cobrar no cartão.
    const reference = shirtReference(id);
    const payments = await searchPaymentsByReference(reference);
    if (payments.some((p) => p.status === "approved")) {
      return { status: await syncShirtOrderWithMp(id), message: "Pagamento já aprovado." };
    }
    for (const p of payments.filter((p) => p.payment_method_id === "pix" && p.status === "pending")) {
      await cancelPayment(p.id).catch((e) => console.error(`Error cancelling pix ${p.id}:`, e));
    }

    const identification = input.payer?.identification;
    const payment = await createCardPayment({
      orderId: id,
      reference,
      amountCents: shirtChargeCents("cartao", order.subtotal_cents),
      description: describe(order),
      token: input.token,
      installments: input.installments,
      paymentMethodId: input.payment_method_id,
      issuerId: input.issuer_id,
      payer: {
        email: order.buyer_email,
        identification:
          identification?.type && identification.number
            ? { type: identification.type, number: onlyDigits(identification.number) }
            : { type: "CPF", number: order.buyer_cpf },
      },
      idempotencyKey: `${reference}-card-${input.token}`,
    });

    const status = await applyShirtMpPayment(payment, id);
    if (payment.status === "rejected") {
      return { status, mpStatus: payment.status, message: rejectionMessage(payment.status_detail) };
    }
    if (payment.status === "in_process" || payment.status === "authorized") {
      return {
        status,
        mpStatus: payment.status,
        message: "Pagamento em análise pelo Mercado Pago. Você receberá a confirmação assim que for aprovado.",
      };
    }
    return { status, mpStatus: payment.status };
  } catch (error) {
    console.error("Error in payWithCard (camisa):", error);
    const message =
      error instanceof MpError && error.status === 400
        ? "Não foi possível processar o cartão. Confira os dados e tente novamente."
        : "Falha ao processar o pagamento. Tente novamente em instantes.";
    return { status: "pendente", message };
  }
}

/** Consulta o status (chamado periodicamente pela tela da encomenda). */
export async function checkOrder(id: string, key: string): Promise<OrderStatus | null> {
  try {
    const order = await loadOrder(id, key);
    if (order.status !== "pendente") return order.status;
    return (await syncShirtOrderWithMp(id)) ?? order.status;
  } catch (error) {
    console.error("Error in checkOrder (camisa):", error);
    return null;
  }
}

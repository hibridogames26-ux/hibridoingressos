/**
 * Referência externa dos pagamentos no Mercado Pago.
 * Ingressos usam o UUID do pedido; camisas usam "shirt:<uuid>", o que mantém
 * os dois domínios separados desde a notificação do pagamento.
 */
export const SHIRT_REF_PREFIX = "shirt:";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PaymentRef = { kind: "ticket" | "shirt"; id: string };

export const shirtReference = (orderId: string) => `${SHIRT_REF_PREFIX}${orderId}`;

export function parsePaymentRef(reference: string | null | undefined): PaymentRef | null {
  if (!reference) return null;
  if (reference.startsWith(SHIRT_REF_PREFIX)) {
    const id = reference.slice(SHIRT_REF_PREFIX.length);
    return UUID.test(id) ? { kind: "shirt", id: id.toLowerCase() } : null;
  }
  return UUID.test(reference) ? { kind: "ticket", id: reference.toLowerCase() } : null;
}

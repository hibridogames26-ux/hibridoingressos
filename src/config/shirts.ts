import { chargeWithPassThrough } from "@/config/fees";
import type { PaymentMethod } from "@/lib/labels";

export const SHIRT_SLUG = "camisa-hibrido-games";
export const SHIRT_PATH = `/loja/${SHIRT_SLUG}`;

/** Fotos fornecidas pela organização (public/images). */
export const SHIRT_PHOTOS = [
  { key: "frente", label: "Frente", src: "/images/camisa-frente.webp", alt: "Camisa oficial Híbrido Games, vista da frente" },
  { key: "costas", label: "Costas", src: "/images/camisa-costas.webp", alt: "Camisa oficial Híbrido Games, vista das costas" },
] as const;
export const SHIRT_PHOTO_SIZE = { width: 1122, height: 1402 } as const;

/**
 * Repasse da taxa do Mercado Pago ao comprador nas camisas. Decisão da organização (07/10/2026):
 * no cartão a taxa é repassada, como nos ingressos; no Pix é absorvida. As taxas usadas na conta
 * são as de `config/fees.ts` (cartão 4,98% e Pix 0,99%); o valor real de cada pagamento vem do
 * Mercado Pago e é gravado na encomenda.
 */
export const SHIRT_FEE_PASSED_TO_BUYER: Record<PaymentMethod, boolean> = {
  cartao: true,
  pix: false,
};

/** Valor cobrado do comprador por um subtotal de camisas (centavos). */
export const shirtChargeCents = (method: PaymentMethod, subtotalCents: number) =>
  chargeWithPassThrough(method, subtotalCents, SHIRT_FEE_PASSED_TO_BUYER);

export const shirtSurchargeCents = (method: PaymentMethod, subtotalCents: number) =>
  shirtChargeCents(method, subtotalCents) - subtotalCents;

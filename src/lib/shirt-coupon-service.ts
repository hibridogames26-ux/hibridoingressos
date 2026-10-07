import "server-only";
import { SHIRT_SLUG } from "@/config/shirts";
import {
  COUPON_INVALID_MESSAGE,
  couponDescription,
  isValidCouponCode,
  normalizeCouponCode,
  type CouponKind,
} from "@/lib/shirt-coupons";
import { NO_COUPON, isMissingRelationError, type CouponAccess } from "@/lib/shirts";
import { createAdminClient } from "@/lib/supabase/server";

export type CouponQuote =
  | {
      ok: true;
      couponId: string;
      code: string;
      kind: CouponKind;
      value: number;
      isTest: boolean;
      /** Preço de tabela da encomenda e valor final com o cupom, em centavos. */
      listCents: number;
      finalCents: number;
      discountCents: number;
      description: string;
    }
  | { ok: false; message: string };

type QuoteRow = {
  coupon_id: string;
  code: string;
  kind: CouponKind;
  value: number;
  is_test: boolean;
  list_cents: number;
  final_cents: number;
  discount_cents: number;
};

/**
 * Confere o cupom no servidor (RPC com service role): a vitrine nunca lê a tabela de cupons.
 * Código vazio, mal formado, inexistente, desativado, vencido ou esgotado dão a mesma mensagem.
 */
export async function quoteCoupon(rawCode: string, quantity = 1): Promise<CouponQuote> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, message: "Digite o código do cupom." };
  if (!isValidCouponCode(code)) return { ok: false, message: COUPON_INVALID_MESSAGE };

  const { data, error } = await createAdminClient().rpc("validate_shirt_coupon", {
    p_slug: SHIRT_SLUG,
    p_code: code,
    p_quantity: Math.max(1, Math.min(10, Math.trunc(quantity) || 1)),
  });

  if (error) {
    if (error.message.includes("coupon_invalid") || isMissingRelationError(error)) {
      return { ok: false, message: COUPON_INVALID_MESSAGE };
    }
    console.error("Error in validate_shirt_coupon:", error);
    return { ok: false, message: "Não foi possível conferir o cupom agora. Tente de novo em instantes." };
  }

  const q = data as QuoteRow;
  return {
    ok: true,
    couponId: q.coupon_id,
    code: q.code,
    kind: q.kind,
    value: q.value,
    isTest: q.is_test,
    listCents: q.list_cents,
    finalCents: q.final_cents,
    discountCents: q.discount_cents,
    description: couponDescription(q),
  };
}

/** Acesso à vitrine: o cupom é válido? (cupom de teste não ocupa o lote). */
export const accessOf = (quote: CouponQuote | null): CouponAccess =>
  quote?.ok ? { valid: true, isTest: quote.isTest } : NO_COUPON;

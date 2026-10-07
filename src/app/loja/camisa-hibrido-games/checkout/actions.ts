"use server";

import { redirect } from "next/navigation";
import { SHIRT_SLUG } from "@/config/shirts";
import { cleanName, isFullName, isValidCpf, isValidEmail, isValidPhone, onlyDigits } from "@/lib/checkout";
import { COUPON_INVALID_MESSAGE } from "@/lib/shirt-coupons";
import { quoteCoupon } from "@/lib/shirt-coupon-service";
import { sendShirtEmailOnce } from "@/lib/shirt-order-service";
import { isMissingRelationError, parseSelectionParams, shirtOrderPath } from "@/lib/shirts";
import { createAdminClient } from "@/lib/supabase/server";

export type AppliedCoupon = {
  code: string;
  description: string;
  discountCents: number;
  finalCents: number;
  isTest: boolean;
};

export type CouponPreview = { ok: true; coupon: AppliedCoupon } | { ok: false; message: string };

/** Botão Aplicar: o servidor confere o cupom e devolve o valor final da encomenda. */
export async function previewCoupon(code: string, quantity: number): Promise<CouponPreview> {
  const quote = await quoteCoupon(String(code ?? ""), Number(quantity));
  if (!quote.ok) return { ok: false, message: quote.message };
  return {
    ok: true,
    coupon: {
      code: quote.code,
      description: quote.description,
      discountCents: quote.discountCents,
      finalCents: quote.finalCents,
      isTest: quote.isTest,
    },
  };
}

export type ShirtCheckoutState =
  | { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> }
  | undefined;

/** Devolve o que foi digitado para o formulário não perder os dados após um erro. */
function echo(formData: FormData) {
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$") && k !== "website") values[k] = v.slice(0, 200);
  }
  return values;
}

export async function createShirtOrder(_: ShirtCheckoutState, formData: FormData): Promise<ShirtCheckoutState> {
  const result = await validateAndCreate(formData);
  return result ? { ...result, values: echo(formData) } : result;
}

async function validateAndCreate(formData: FormData): Promise<ShirtCheckoutState> {
  // Campo-armadilha: humanos não veem, robôs preenchem.
  if (String(formData.get("website") ?? "")) return { error: "Não foi possível continuar." };

  const { size, quantity, coupon } = parseSelectionParams({
    tamanho: String(formData.get("tamanho") ?? ""),
    qtd: String(formData.get("qtd") ?? ""),
    cupom: String(formData.get("cupom") ?? ""),
  });
  if (!size || !Number.isInteger(quantity)) {
    return { error: "Seleção de camisa inválida. Volte e escolha novamente." };
  }

  const name = cleanName(String(formData.get("name") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const cpf = onlyDigits(String(formData.get("cpf") ?? ""));
  const phone = onlyDigits(String(formData.get("phone") ?? ""));

  const fieldErrors: Record<string, string> = {};
  if (!isFullName(name)) fieldErrors.name = "Informe nome e sobrenome.";
  if (!isValidEmail(email)) fieldErrors.email = "E-mail inválido.";
  if (!isValidCpf(cpf)) fieldErrors.cpf = "CPF inválido.";
  if (!isValidPhone(phone)) fieldErrors.phone = "Celular com DDD, só números.";
  if (formData.get("aceite") !== "on") fieldErrors.aceite = "Confirme que leu as condições da encomenda.";
  if (Object.keys(fieldErrors).length) return { error: "Confira os campos destacados.", fieldErrors };

  // Preço, tamanho, quantidade, janela e limite do lote são conferidos pelo banco, sob lock.
  const { data, error } = await createAdminClient()
    .rpc("create_shirt_order", {
      p_slug: SHIRT_SLUG,
      p_buyer_name: name,
      p_buyer_email: email,
      p_buyer_cpf: cpf,
      p_buyer_phone: phone,
      p_size: size,
      p_quantity: quantity,
      p_coupon: coupon || null,
    })
    .single<{ order_id: string; access_key: string; subtotal_cents: number }>();

  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("sold_out")) {
      return { error: "O lote esgotou ou restam menos camisas do que você pediu. Volte e ajuste a quantidade." };
    }
    if (message.includes("coupon_invalid")) return { error: COUPON_INVALID_MESSAGE };
    if (message.includes("coupon_buyer_limit")) return { error: "Este cupom já foi usado por este CPF." };
    if (message.includes("size_sold_out")) {
      return { error: "Restam menos camisas desse tamanho do que você pediu. Volte e ajuste a quantidade ou o tamanho." };
    }
    if (message.includes("coupon_required")) return { error: "As encomendas estão abertas só para quem tem um cupom." };
    if (message.includes("size_unavailable") || message.includes("invalid_size")) {
      return { error: "Esse tamanho não está disponível no momento. Volte e escolha outro." };
    }
    if (message.includes("invalid_quantity")) return { error: "Quantidade inválida. Volte e escolha novamente." };
    if (message.includes("unavailable") || isMissingRelationError(error)) {
      return { error: "As encomendas não estão abertas no momento." };
    }
    console.error("Error in create_shirt_order:", error);
    return { error: "Não foi possível registrar sua encomenda. Tente novamente." };
  }

  // Cupom de 100%: o banco já criou a encomenda paga. Não há o que cobrar, então o e-mail de confirmação sai agora.
  if (data.subtotal_cents === 0) await sendShirtEmailOnce(data.order_id);

  redirect(shirtOrderPath({ id: data.order_id, access_key: data.access_key }));
}

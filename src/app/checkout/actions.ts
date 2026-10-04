"use server";

import { redirect } from "next/navigation";
import {
  cleanName,
  isFullName,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  onlyDigits,
  parseCart,
} from "@/lib/checkout";
import { createAdminClient } from "@/lib/supabase/server";

export type CheckoutState =
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

export async function createOrder(_: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const result = await validateAndCreate(formData);
  return result ? { ...result, values: echo(formData) } : result;
}

async function validateAndCreate(formData: FormData): Promise<CheckoutState> {
  // Campo-armadilha: humanos não veem, robôs preenchem.
  if (String(formData.get("website") ?? "")) return { error: "Não foi possível continuar." };

  const cart = parseCart(String(formData.get("itens") ?? ""));
  if (!cart) return { error: "Seleção de ingressos inválida. Volte e escolha novamente." };

  const name = cleanName(String(formData.get("name") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const cpf = onlyDigits(String(formData.get("cpf") ?? ""));
  const phone = onlyDigits(String(formData.get("phone") ?? ""));

  const fieldErrors: Record<string, string> = {};
  if (!isFullName(name)) fieldErrors.name = "Informe nome e sobrenome.";
  if (!isValidEmail(email)) fieldErrors.email = "E-mail inválido.";
  if (!isValidCpf(cpf)) fieldErrors.cpf = "CPF inválido.";
  if (!isValidPhone(phone)) fieldErrors.phone = "Celular com DDD, só números.";

  const items = cart.map((line) => {
    const holders = Array.from({ length: line.quantity }, (_, i) =>
      cleanName(String(formData.get(`holder_${line.ticketTypeId}_${i}`) ?? "")),
    );
    holders.forEach((h, i) => {
      if (!isFullName(h)) fieldErrors[`holder_${line.ticketTypeId}_${i}`] = "Nome e sobrenome do titular.";
    });
    return { ticket_type_id: line.ticketTypeId, holder_names: holders };
  });

  if (Object.keys(fieldErrors).length) {
    return { error: "Confira os campos destacados.", fieldErrors };
  }

  const { data, error } = await createAdminClient()
    .rpc("create_order", {
      p_buyer_name: name,
      p_buyer_email: email,
      p_buyer_cpf: cpf,
      p_buyer_phone: phone,
      p_items: items,
    })
    .single<{ order_id: string; access_key: string }>();

  if (error || !data) {
    const message = error?.message ?? "";
    if (message.startsWith("sold_out:")) {
      return { error: `Não há mais ingressos suficientes de “${message.slice(9)}”. Volte e ajuste a quantidade.` };
    }
    if (message.startsWith("unavailable:")) {
      return { error: `“${message.slice(12)}” não está mais à venda.` };
    }
    if (message.includes("too_many")) return { error: "Máximo de 10 ingressos por pedido." };
    console.error("Error in create_order:", error);
    return { error: "Não foi possível reservar seus ingressos. Tente novamente." };
  }

  redirect(`/pedido/${data.order_id}?k=${data.access_key}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { parseReaisToCents } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { minQuantity, type TicketTypeRow } from "@/lib/ticket-types";

export type TicketFormState = { error?: string; success?: string } | undefined;

const MAX_STOCK = 100_000;

/** Server Actions são endpoints públicos: revalida o admin em toda chamada. */
async function adminClient() {
  const profile = await getCurrentProfile();
  if (!profile?.active || profile.role !== "admin") throw new Error("Não autorizado");
  return createClient();
}

async function loadType(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from("v_sales_by_type")
    .select("*")
    .eq("id", id)
    .maybeSingle<TicketTypeRow>();
  if (error) throw new Error(`Falha ao carregar o ingresso: ${error.message}`);
  if (!data) throw new Error("Ingresso não encontrado.");
  return data;
}

function refresh() {
  revalidatePath("/admin/ingressos");
  revalidatePath("/admin");
}

export async function saveTicketType(_: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const supabase = await adminClient();

  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const eventDate = String(formData.get("event_date") ?? "");
  const priceCents = parseReaisToCents(String(formData.get("price") ?? ""));
  const quantity = Number(formData.get("quantity"));
  const active = formData.get("active") === "on";

  if (!name || name.length > 80) return { error: "Informe o nome do ingresso (até 80 caracteres)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate))) {
    return { error: "Informe a data do evento em que o ingresso vale." };
  }
  if (priceCents === null) return { error: "Preço inválido. Use, por exemplo, 150,00." };
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_STOCK) {
    return { error: "O estoque total deve ser um número inteiro entre 0 e 100.000." };
  }

  const values = { name, description, event_date: eventDate, price_cents: priceCents, quantity, active };

  if (id) {
    const current = await loadType(supabase, id);
    const min = minQuantity(current);
    if (quantity < min) {
      return { error: `O estoque não pode ficar abaixo de ${min}: já vendidos ou reservados.` };
    }
    const { error } = await supabase.from("ticket_types").update(values).eq("id", id);
    if (error) return { error: `Não foi possível salvar: ${error.message}` };
    refresh();
    return { success: `“${name}” atualizado.` };
  }

  const { error } = await supabase.from("ticket_types").insert(values);
  if (error) return { error: `Não foi possível cadastrar: ${error.message}` };
  refresh();
  return { success: `“${name}” cadastrado.` };
}

export async function addStock(id: string, amount: number): Promise<string> {
  const supabase = await adminClient();
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_STOCK) {
    throw new Error("Informe uma quantidade inteira maior que zero.");
  }

  const current = await loadType(supabase, id);
  const next = current.quantity + amount;
  if (next > MAX_STOCK) throw new Error("Estoque máximo é 100.000.");

  // Só grava se ninguém alterou o estoque entre a leitura e a escrita.
  const { data, error } = await supabase
    .from("ticket_types")
    .update({ quantity: next })
    .eq("id", id)
    .eq("quantity", current.quantity)
    .select("id");
  if (error) throw new Error(`Falha ao adicionar estoque: ${error.message}`);
  if (!data?.length) throw new Error("O estoque mudou enquanto você editava. Tente novamente.");

  refresh();
  return `+${amount} adicionados. Estoque total: ${next}.`;
}

export async function setTicketTypeActive(id: string, active: boolean) {
  const supabase = await adminClient();
  const { error } = await supabase.from("ticket_types").update({ active }).eq("id", id);
  if (error) throw new Error(`Falha ao atualizar: ${error.message}`);
  refresh();
}

export async function deleteTicketType(id: string): Promise<string> {
  const supabase = await adminClient();
  const current = await loadType(supabase, id);
  if (minQuantity(current) > 0) {
    throw new Error("Este ingresso já tem vendas. Desative-o em vez de excluir.");
  }

  const { error } = await supabase.from("ticket_types").delete().eq("id", id);
  if (error) {
    throw new Error(
      error.code === "23503"
        ? "Este ingresso já está em pedidos. Desative-o em vez de excluir."
        : `Falha ao excluir: ${error.message}`,
    );
  }
  refresh();
  return `“${current.name}” excluído.`;
}

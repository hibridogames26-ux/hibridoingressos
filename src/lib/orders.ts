import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/labels";

export const ORDER_STATUSES: OrderStatus[] = ["pago", "pendente", "estornado", "cancelado"];

export type OrderFilters = { q?: string; status?: OrderStatus };

export type OrderRow = {
  id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_cpf: string;
  buyer_phone: string | null;
  status: OrderStatus;
  payment_method: "pix" | "cartao" | null;
  total_cents: number;
  fee_cents: number;
  net_cents: number;
  mp_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
};

export function parseFilters(params: Record<string, string | string[] | undefined>): OrderFilters {
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status =
    typeof params.status === "string" && (ORDER_STATUSES as string[]).includes(params.status)
      ? (params.status as OrderStatus)
      : undefined;
  return { q: q || undefined, status };
}

/** Remove caracteres com significado na sintaxe de filtros do PostgREST. */
function sanitize(term: string) {
  return term.replace(/[,()*%\\:"']/g, " ").trim();
}

/**
 * Busca pedidos por nome, e-mail, CPF ou código do ingresso, no intervalo [from, to].
 * Executa a consulta aqui: o builder do PostgREST é "thenable" e seria
 * executado de qualquer forma ao ser retornado de uma função async.
 */
export async function queryOrders(
  supabase: SupabaseClient,
  filters: OrderFilters,
  from: number,
  to: number,
) {
  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);

  if (filters.q) {
    const term = sanitize(filters.q);
    const digits = term.replace(/\D/g, "");
    const ors = [`buyer_name.ilike.*${term}*`, `buyer_email.ilike.*${term}*`];
    if (digits.length >= 3) ors.push(`buyer_cpf.ilike.*${digits}*`);

    if (/^[A-Za-z0-9]{8}$/.test(term)) {
      const { data } = await supabase
        .from("tickets")
        .select("order_id")
        .eq("short_code", term.toUpperCase());
      for (const t of data ?? []) ors.push(`id.eq.${t.order_id}`);
    }
    query = query.or(ors.join(","));
  }

  return query.range(from, to).returns<OrderRow[]>();
}

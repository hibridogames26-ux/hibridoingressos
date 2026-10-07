import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SHIRT_FULFILLMENT_STATUSES,
  type OrderStatus,
  type PaymentMethod,
  type ShirtFulfillment,
} from "@/lib/labels";
import { ORDER_STATUSES } from "@/lib/orders";

export type ShirtOrderRow = {
  id: string;
  code: string;
  buyer_name: string;
  buyer_email: string;
  buyer_cpf: string;
  buyer_phone: string | null;
  size: string;
  quantity: number;
  product_name: string;
  unit_price_cents: number;
  production_lead_time: string;
  receipt_details: string;
  purchase_policy: string;
  subtotal_cents: number;
  total_cents: number;
  fee_cents: number;
  net_cents: number;
  status: OrderStatus;
  fulfillment_status: ShirtFulfillment;
  payment_method: PaymentMethod | null;
  mp_payment_id: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
  coupon_code: string | null;
  discount_cents: number;
  is_test: boolean;
};

/** Linha da visão `v_shirt_sales_by_size` (usada no painel e na aba "Lote por tamanho"). */
export type ShirtLotRow = {
  size: string;
  paid_units: number;
  paid_orders: number;
  pending_units: number;
  waiting_units: number;
  in_production_units: number;
  ready_units: number;
  delivered_units: number;
  gross_cents: number;
};

export type ShirtOrderFilters = {
  q?: string;
  status?: OrderStatus;
  /** Andamento da produção (só encomendas pagas têm andamento). */
  prod?: ShirtFulfillment;
  size?: string;
  /** Só as encomendas feitas com cupom de teste. */
  test?: boolean;
};

export function parseShirtFilters(params: Record<string, string | string[] | undefined>): ShirtOrderFilters {
  const text = (v: string | string[] | undefined, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const status = text(params.status, 20);
  const prod = text(params.andamento, 30);
  const size = text(params.tamanho, 12);
  return {
    q: text(params.q, 100) || undefined,
    status: (ORDER_STATUSES as string[]).includes(status) ? (status as OrderStatus) : undefined,
    prod: (SHIRT_FULFILLMENT_STATUSES as string[]).includes(prod) ? (prod as ShirtFulfillment) : undefined,
    size: size || undefined,
    test: params.teste === "1" ? true : undefined,
  };
}

/** Filtros como parâmetros de URL (mesmos nomes lidos por `parseShirtFilters`). */
export function filtersToParams(filters: ShirtOrderFilters, extra: Record<string, string | number | undefined> = {}) {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  if (filters.status) sp.set("status", filters.status);
  if (filters.prod) sp.set("andamento", filters.prod);
  if (filters.size) sp.set("tamanho", filters.size);
  if (filters.test) sp.set("teste", "1");
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) sp.set(k, String(v));
  return sp;
}

/** Remove caracteres com significado na sintaxe de filtros do PostgREST. */
const sanitize = (term: string) => term.replace(/[,()*%\\:"']/g, " ").trim();

/** Busca encomendas por nome, e-mail, CPF ou código do pedido, no intervalo [from, to]. */
export async function queryShirtOrders(
  supabase: SupabaseClient,
  filters: ShirtOrderFilters,
  from: number,
  to: number,
  /** A exportação deixa as encomendas de teste de fora; a lista do painel mostra todas, com o selo Teste. */
  options: { excludeTests?: boolean } = {},
) {
  let query = supabase.from("shirt_orders").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (options.excludeTests) query = query.eq("is_test", false);

  if (filters.status) query = query.eq("status", filters.status);
  // O andamento só tem significado para encomendas pagas.
  if (filters.prod) query = query.eq("status", "pago").eq("fulfillment_status", filters.prod);
  if (filters.size) query = query.eq("size", filters.size);
  if (filters.test) query = query.eq("is_test", true);

  if (filters.q) {
    const term = sanitize(filters.q);
    const digits = term.replace(/\D/g, "");
    const code = term.replace(/-/g, "").toUpperCase();
    const ors = [`buyer_name.ilike.*${term}*`, `buyer_email.ilike.*${term}*`];
    if (digits.length >= 3) ors.push(`buyer_cpf.ilike.*${digits}*`);
    if (/^[A-Z0-9]{3,8}$/.test(code)) ors.push(`code.ilike.*${code}*`);
    query = query.or(ors.join(","));
  }

  return query.range(from, to).returns<ShirtOrderRow[]>();
}

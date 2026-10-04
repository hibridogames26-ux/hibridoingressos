import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  event_date: string;
  available: number;
};

/** Ingressos à venda (ativos, dia do evento não passou, dentro da janela de venda). */
export async function getCatalog(ids?: string[]): Promise<CatalogItem[]> {
  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const now = new Date().toISOString();

  let query = createAdminClient()
    .from("ticket_types")
    .select("id, name, description, price_cents, event_date, quantity, sold, sales_start, sales_end")
    .eq("active", true)
    .gte("event_date", today)
    .order("event_date")
    .order("sort_order")
    .order("name");
  if (ids) query = query.in("id", ids);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar ingressos: ${error.message}`);

  return (data ?? [])
    .filter((t) => (!t.sales_start || t.sales_start <= now) && (!t.sales_end || t.sales_end >= now))
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price_cents: t.price_cents,
      event_date: t.event_date,
      available: Math.max(0, t.quantity - t.sold),
    }));
}

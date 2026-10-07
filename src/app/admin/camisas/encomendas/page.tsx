import type { Metadata } from "next";
import { MigrationPending } from "@/components/admin/MigrationPending";
import { PageHeader } from "@/components/admin/PageHeader";
import { SHIRT_SLUG } from "@/config/shirts";
import { parseShirtFilters, queryShirtOrders, type ShirtLotRow } from "@/lib/shirt-orders";
import { isMissingRelationError, withAllSizes } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";
import { EncomendasView } from "./EncomendasView";

export const metadata: Metadata = { title: "Encomendas — Dashboard" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const emptyLot = (size: string): ShirtLotRow => ({
  size,
  paid_units: 0,
  paid_orders: 0,
  pending_units: 0,
  waiting_units: 0,
  in_production_units: 0,
  ready_units: 0,
  delivered_units: 0,
  gross_cents: 0,
});

export default async function EncomendasPage({ searchParams }: PageProps<"/admin/camisas/encomendas">) {
  const params = await searchParams;
  const filters = parseShirtFilters(params);
  const page = Math.max(1, Number(params.pagina) || 1);
  const updated = typeof params.atualizadas === "string" ? Number(params.atualizadas) : null;

  const supabase = await createClient();
  const [ordersRes, lotRes, productRes] = await Promise.all([
    queryShirtOrders(supabase, filters, (page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("v_shirt_sales_by_size").select("*").returns<ShirtLotRow[]>(),
    supabase.from("shirt_products").select("sizes").eq("slug", SHIRT_SLUG).maybeSingle<{ sizes: string[] }>(),
  ]);

  const results = [ordersRes, lotRes, productRes];
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    if (results.some((r) => isMissingRelationError(r.error))) {
      return (
        <>
          <PageHeader title="Encomendas" description="Dados de cada encomenda de camisa." />
          <MigrationPending />
        </>
      );
    }
    throw new Error(`Falha ao carregar as encomendas: ${failed.error.message}`);
  }

  const total = ordersRes.count ?? 0;
  return (
    <EncomendasView
      orders={ordersRes.data ?? []}
      total={total}
      page={page}
      pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      filters={filters}
      lot={withAllSizes(
        (lotRes.data ?? []).map((r) => ({ ...r, paid_units: Number(r.paid_units) })),
        productRes.data?.sizes ?? [],
        emptyLot,
      )}
      updated={updated !== null && Number.isFinite(updated) ? updated : null}
      warned={params.aviso === "selecione"}
    />
  );
}

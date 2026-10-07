import type { Metadata } from "next";
import { MigrationPending } from "@/components/admin/MigrationPending";
import { PageHeader } from "@/components/admin/PageHeader";
import type { DailyPoint } from "@/components/admin/SalesChart";
import { SHIRT_SLUG } from "@/config/shirts";
import { toCouponRow } from "@/lib/shirt-coupons";
import type { ShirtLotRow } from "@/lib/shirt-orders";
import { SHIRT_PRODUCT_COLUMNS, isMissingRelationError, type ShirtProduct } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";
import { CamisasView, type ByMethod, type CamisasSummary } from "./CamisasView";

export const metadata: Metadata = { title: "Camisas — Dashboard" };
export const dynamic = "force-dynamic";

export default async function CamisasPage() {
  const supabase = await createClient();
  const [productRes, summaryRes, dailyRes, sizeRes, methodRes, couponRes, testRes] = await Promise.all([
    supabase.from("shirt_products").select(SHIRT_PRODUCT_COLUMNS).eq("slug", SHIRT_SLUG).maybeSingle<ShirtProduct>(),
    supabase.from("v_shirt_finance_summary").select("*").single<CamisasSummary>(),
    supabase.from("v_shirt_sales_daily").select("day, orders, gross_cents").returns<DailyPoint[]>(),
    supabase.from("v_shirt_sales_by_size").select("*").returns<ShirtLotRow[]>(),
    supabase.from("v_shirt_sales_by_method").select("*").returns<ByMethod[]>(),
    supabase.from("v_shirt_coupons").select("*").order("created_at", { ascending: false }).returns<Record<string, unknown>[]>(),
    supabase.from("shirt_orders").select("status").eq("is_test", true).limit(200).returns<{ status: string }[]>(),
  ]);

  const results = [productRes, summaryRes, dailyRes, sizeRes, methodRes, couponRes, testRes];
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    if (results.some((r) => isMissingRelationError(r.error))) {
      return (
        <>
          <PageHeader title="Camisas" description="Encomendas pagas pelo Mercado Pago. Não inclui ingressos." />
          <MigrationPending />
        </>
      );
    }
    throw new Error(`Falha ao carregar as camisas: ${failed.error.message}`);
  }

  return (
    <CamisasView
      product={productRes.data}
      summary={summaryRes.data!}
      dailyRows={dailyRes.data ?? []}
      lot={sizeRes.data ?? []}
      byMethod={methodRes.data ?? []}
      coupons={(couponRes.data ?? []).map(toCouponRow)}
      testDone={(testRes.data ?? []).some((o) => o.status === "pago" || o.status === "estornado")}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MigrationPending } from "@/components/admin/MigrationPending";
import { PageHeader } from "@/components/admin/PageHeader";
import { toCouponRow } from "@/lib/shirt-coupons";
import { isMissingRelationError } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";
import { CouponDetailView, type CouponOrder } from "./CouponDetailView";

export const metadata: Metadata = { title: "Cupom — Dashboard" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CupomPage({ params }: PageProps<"/admin/camisas/cupons/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [couponRes, ordersRes] = await Promise.all([
    supabase.from("v_shirt_coupons").select("*").eq("id", id).maybeSingle<Record<string, unknown>>(),
    supabase
      .from("shirt_orders")
      .select("id, code, buyer_name, buyer_email, size, quantity, total_cents, discount_cents, status, payment_method, created_at, is_test")
      .eq("coupon_id", id)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<CouponOrder[]>(),
  ]);

  const failed = couponRes.error ?? ordersRes.error;
  if (failed) {
    if (isMissingRelationError(failed)) {
      return (
        <>
          <PageHeader title="Cupom" />
          <MigrationPending />
        </>
      );
    }
    throw new Error(`Falha ao carregar o cupom: ${failed.message}`);
  }
  if (!couponRes.data) notFound();

  return <CouponDetailView coupon={toCouponRow(couponRes.data)} orders={ordersRes.data ?? []} />;
}

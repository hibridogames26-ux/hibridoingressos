import type { Metadata } from "next";
import { MigrationPending } from "@/components/admin/MigrationPending";
import { PageHeader } from "@/components/admin/PageHeader";
import { toCouponRow } from "@/lib/shirt-coupons";
import { isMissingRelationError } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";
import { CouponsView, FILTERS, type FilterId } from "./CouponsView";

export const metadata: Metadata = { title: "Cupons — Dashboard" };
export const dynamic = "force-dynamic";

export default async function CuponsPage({ searchParams }: PageProps<"/admin/camisas/cupons">) {
  const params = await searchParams;
  const wanted = typeof params.situacao === "string" ? params.situacao : "todos";
  const filter = (FILTERS.some(([id]) => id === wanted) ? wanted : "todos") as FilterId;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";

  const { data, error } = await (await createClient())
    .from("v_shirt_coupons")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Record<string, unknown>[]>();

  if (error) {
    if (isMissingRelationError(error)) {
      return (
        <>
          <PageHeader title="Cupons" description="Cupons de campanha e de teste das camisas." />
          <MigrationPending />
        </>
      );
    }
    throw new Error(`Falha ao carregar os cupons: ${error.message}`);
  }

  return <CouponsView coupons={(data ?? []).map(toCouponRow)} filter={filter} query={query} />;
}

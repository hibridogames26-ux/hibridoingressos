import type { Metadata } from "next";
import { MigrationPending } from "@/components/admin/MigrationPending";
import { PageHeader } from "@/components/admin/PageHeader";
import { SHIRT_SLUG } from "@/config/shirts";
import { isSizeAudit, type ShirtAuditRow } from "@/lib/shirt-audit";
import { couponStatus, toCouponRow } from "@/lib/shirt-coupons";
import type { ShirtLotRow } from "@/lib/shirt-orders";
import { SHIRT_PRODUCT_COLUMNS, isMissingRelationError, type ShirtProduct } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";
import { ConfigView, TABS, type TabId } from "./ConfigView";

export const metadata: Metadata = { title: "Configurações das camisas — Dashboard" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage({ searchParams }: PageProps<"/admin/camisas/configuracoes">) {
  const params = await searchParams;
  const wanted = typeof params.aba === "string" ? params.aba : "venda";
  const tab = (TABS.some(([id]) => id === wanted) ? wanted : "venda") as TabId;

  const supabase = await createClient();
  const [productRes, lotRes, couponRes, testRes, auditRes] = await Promise.all([
    supabase.from("shirt_products").select(SHIRT_PRODUCT_COLUMNS).eq("slug", SHIRT_SLUG).maybeSingle<ShirtProduct>(),
    supabase.from("v_shirt_sales_by_size").select("*").returns<ShirtLotRow[]>(),
    supabase.from("v_shirt_coupons").select("*").returns<Record<string, unknown>[]>(),
    supabase.from("shirt_orders").select("status").eq("is_test", true).limit(200).returns<{ status: string }[]>(),
    supabase
      .from("shirt_audit_log")
      .select("id, at, actor_name, kind, detail")
      .order("at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200)
      .returns<ShirtAuditRow[]>(),
  ]);

  const results = [productRes, lotRes, couponRes, testRes, auditRes];
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    if (results.some((r) => isMissingRelationError(r.error))) {
      return (
        <>
          <PageHeader title="Configurações" description="Venda, tamanhos, textos e histórico de alterações da camisa." />
          <MigrationPending />
        </>
      );
    }
    throw new Error(`Falha ao carregar as configurações: ${failed.error.message}`);
  }
  if (!productRes.data) {
    return (
      <>
        <PageHeader title="Configurações" description="Venda, tamanhos, textos e histórico de alterações da camisa." />
        <MigrationPending />
      </>
    );
  }

  const history = auditRes.data ?? [];
  const audit = tab === "tamanhos" ? history.filter(isSizeAudit).slice(0, 5) : tab === "historico" ? history : [];

  return (
    <ConfigView
      tab={tab}
      product={productRes.data}
      lot={lotRes.data ?? []}
      activeCoupons={(couponRes.data ?? []).map(toCouponRow).filter((c) => couponStatus(c) === "ativo").length}
      testDone={(testRes.data ?? []).some((o) => o.status === "pago" || o.status === "estornado")}
      audit={audit}
    />
  );
}

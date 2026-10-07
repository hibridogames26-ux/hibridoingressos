import { NextResponse, type NextRequest } from "next/server";
import { SHIRT_SLUG } from "@/config/shirts";
import { getCurrentProfile } from "@/lib/auth";
import { buildShirtWorkbook } from "@/lib/shirt-xlsx";
import { parseShirtFilters, queryShirtOrders, type ShirtLotRow } from "@/lib/shirt-orders";
import { isMissingRelationError } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";

const MAX_ROWS = 10000;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const fail = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Exporta as encomendas de camisa em .xlsx (abas "Encomendas" e "Lote por tamanho").
 * `?arquivo=lote` gera só a aba do lote, sem dados pessoais, para encaminhar ao fornecedor.
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile?.active || profile.role !== "admin") return fail("Não autorizado", 403);

  const onlyLot = request.nextUrl.searchParams.get("arquivo") === "lote";
  const filters = parseShirtFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();

  const [ordersRes, lotRes, productRes] = await Promise.all([
    onlyLot ? Promise.resolve(null) : queryShirtOrders(supabase, filters, 0, MAX_ROWS - 1, { excludeTests: true }),
    supabase.from("v_shirt_sales_by_size").select("*").returns<ShirtLotRow[]>(),
    supabase.from("shirt_products").select("sizes").eq("slug", SHIRT_SLUG).maybeSingle<{ sizes: string[] }>(),
  ]);

  const error = ordersRes?.error ?? lotRes.error ?? productRes.error;
  if (error) {
    if (isMissingRelationError(error)) return fail("As tabelas de camisa ainda não foram criadas. Aplique as migrations.", 409);
    console.error("Error in exportar encomendas de camisa:", error);
    return fail(`Falha ao exportar: ${error.message}`, 500);
  }
  if (ordersRes && (ordersRes.count ?? 0) > MAX_ROWS) {
    return fail(`Muitos resultados (${ordersRes.count}). Refine os filtros para exportar até ${MAX_ROWS} encomendas.`, 422);
  }

  const buffer = await buildShirtWorkbook({
    orders: ordersRes?.data ?? undefined,
    lot: (lotRes.data ?? []).map((r) => ({ ...r, paid_units: Number(r.paid_units) })),
    sizeGrid: productRes.data?.sizes ?? [],
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const name = onlyLot ? "lote-camisa-hibrido-games" : "encomendas-camisa-hibrido-games";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${name}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

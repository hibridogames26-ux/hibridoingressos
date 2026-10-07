import "server-only";
import { SHIRT_SLUG } from "@/config/shirts";
import { createAdminClient } from "@/lib/supabase/server";
import {
  FALLBACK_SHIRT_PRODUCT,
  SHIRT_PRODUCT_COLUMNS,
  countsTowardLot,
  isMissingRelationError,
  type ShirtProduct,
} from "@/lib/shirts";

export type LotUsage = { total: number; bySize: Record<string, number> };

/** Unidades que ocupam o lote: encomendas pagas e reservas ainda válidas (as de teste ficam de fora). */
export async function getShirtLotUsage(productId: string): Promise<LotUsage | null> {
  const { data, error } = await createAdminClient()
    .from("shirt_orders")
    .select("quantity, size, status, expires_at, mp_status")
    .eq("product_id", productId)
    .eq("is_test", false)
    .in("status", ["pago", "pendente"]);
  if (error) {
    console.error("Error in getShirtLotUsage:", error);
    return null;
  }
  const now = Date.now();
  const usage: LotUsage = { total: 0, bySize: {} };
  for (const o of (data ?? []).filter((row) => countsTowardLot(row, now))) {
    usage.total += o.quantity;
    usage.bySize[o.size] = (usage.bySize[o.size] ?? 0) + o.quantity;
  }
  return usage;
}

export type ShirtProductResult = {
  product: ShirtProduct;
  /** "fallback": produto fechado, usado quando a tabela não existe ou a consulta falhou. */
  source: "db" | "fallback";
  /** Unidades pagas + reservas válidas; null se não foi possível consultar. */
  usedUnits: number | null;
  /** O mesmo, por tamanho (para os limites por tamanho). */
  usedBySize: Record<string, number>;
};

/**
 * Produto da vitrine. Sem as migrations (ou em caso de falha na consulta) devolve o
 * produto fechado: a página aparece, mas nenhuma venda pode ser habilitada por aqui.
 */
export async function getShirtProduct(slug = SHIRT_SLUG): Promise<ShirtProductResult> {
  const { data, error } = await createAdminClient()
    .from("shirt_products")
    .select(SHIRT_PRODUCT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<ShirtProduct>();

  if (error || !data) {
    if (error && !isMissingRelationError(error)) console.error("Error in getShirtProduct:", error);
    return { product: FALLBACK_SHIRT_PRODUCT, source: "fallback", usedUnits: null, usedBySize: {} };
  }
  const usage = await getShirtLotUsage(data.id!);
  return { product: data, source: "db", usedUnits: usage?.total ?? null, usedBySize: usage?.bySize ?? {} };
}

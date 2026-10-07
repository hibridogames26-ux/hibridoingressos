import { SHIRT_PATH, SHIRT_SLUG } from "@/config/shirts";
import { normalizeCouponCode } from "@/lib/shirt-coupons";

/** Quem consegue encomendar: ninguém, só quem tem cupom, ou todo mundo. */
export type SalesMode = "fechada" | "cupom" | "aberta";
export const SALES_MODES: SalesMode[] = ["fechada", "cupom", "aberta"];

export const salesModeLabel: Record<SalesMode, string> = {
  fechada: "Fechada",
  cupom: "Somente com cupom",
  aberta: "Aberta",
};

export const salesModeText: Record<SalesMode, string> = {
  fechada: "A vitrine mostra que as encomendas ainda não abriram. Ninguém consegue encomendar, nem com cupom.",
  cupom:
    "A vitrine fica visível, mas só quem tem um cupom consegue encomendar. Use para testar o pagamento ou para uma pré-venda.",
  aberta: "Qualquer pessoa encomenda, dentro da janela, do lote e dos tamanhos habilitados.",
};

export type ShirtProduct = {
  id: string | null;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  sizes: string[];
  size_guide: string | null;
  composition: string | null;
  fit: string | null;
  sales_mode: SalesMode;
  /** Tamanhos da grade que o fornecedor deixou de atender. */
  disabled_sizes: string[];
  /** Limite de camisas por tamanho (pagas + reservas), ex.: { G: 40 }. */
  size_limits: Record<string, number>;
  /** Mensagem ao cliente para o tamanho desabilitado, ex.: { XG: "Sob consulta" }. */
  size_messages: Record<string, string>;
  test_checked_at: string | null;
  test_refunds_done_at: string | null;
  sales_start: string | null;
  sales_end: string | null;
  production_lead_time: string | null;
  receipt_details: string | null;
  purchase_policy: string | null;
  max_per_order: number | null;
  batch_limit: number | null;
};

/** Colunas lidas de `shirt_products` (catálogo público). */
export const SHIRT_PRODUCT_COLUMNS =
  "id, slug, name, description, price_cents, sizes, disabled_sizes, size_limits, size_messages, size_guide, composition, fit, sales_mode, test_checked_at, test_refunds_done_at, sales_start, sales_end, production_lead_time, receipt_details, purchase_policy, max_per_order, batch_limit";

/**
 * Produto exibido quando a tabela ainda não existe (migration não aplicada).
 * Fechado por construção: nenhum dado comercial inventado e sem venda.
 */
export const FALLBACK_SHIRT_PRODUCT: ShirtProduct = {
  id: null,
  slug: SHIRT_SLUG,
  name: "Camisa oficial Híbrido Games",
  description: "Camisa oficial do evento, produzida sob encomenda.",
  price_cents: null,
  sizes: [],
  size_guide: null,
  composition: null,
  fit: null,
  sales_mode: "fechada",
  disabled_sizes: [],
  size_limits: {},
  size_messages: {},
  test_checked_at: null,
  test_refunds_done_at: null,
  sales_start: null,
  sales_end: null,
  production_lead_time: null,
  receipt_details: null,
  purchase_policy: null,
  max_per_order: null,
  batch_limit: null,
};

/** Chaves iguais às de `public.shirt_sales_gaps` (supabase/migrations). */
export const SHIRT_CONDITIONS = [
  "price",
  "sizes",
  "size_guide",
  "lead_time",
  "receipt",
  "window",
  "batch_limit",
  "max_per_order",
  "policy",
] as const;
export type ShirtCondition = (typeof SHIRT_CONDITIONS)[number];

export const shirtConditionLabel: Record<ShirtCondition, string> = {
  price: "Preço",
  sizes: "Grade de tamanhos",
  size_guide: "Medidas (guia de tamanhos)",
  lead_time: "Prazo de produção",
  receipt: "Forma de recebimento",
  window: "Data limite para encomendar",
  batch_limit: "Limite do lote",
  max_per_order: "Quantidade máxima por compra",
  policy: "Trocas, cancelamento e atendimento",
};

const blank = (value: string | null | undefined) => !value || value.trim() === "";

export const DEFAULT_DISABLED_MESSAGE = "O fornecedor não está atendendo este tamanho.";

export type SizeState = {
  size: string;
  available: boolean;
  /** disabled: fornecedor não atende; sold_out: o limite do tamanho foi atingido. */
  reason: "ok" | "disabled" | "sold_out";
  message: string | null;
};

/**
 * Situação de cada tamanho da grade para o cliente. `usedBySize` = pagas + reservas por tamanho
 * (sem encomendas de teste). O servidor repete a regra em `create_shirt_order`.
 */
export function sizeStates(
  p: Pick<ShirtProduct, "sizes" | "disabled_sizes" | "size_limits" | "size_messages">,
  usedBySize: Record<string, number> = {},
): SizeState[] {
  return p.sizes.map((size) => {
    if (p.disabled_sizes.includes(size)) {
      return { size, available: false, reason: "disabled", message: p.size_messages[size]?.trim() || DEFAULT_DISABLED_MESSAGE };
    }
    const limit = p.size_limits[size];
    if (limit !== undefined && (usedBySize[size] ?? 0) >= limit) {
      return { size, available: false, reason: "sold_out", message: "Esgotado." };
    }
    return { size, available: true, reason: "ok", message: null };
  });
}

/** Tamanhos da grade que ainda aceitam encomenda, na ordem da grade. */
export const enabledSizes = (p: Pick<ShirtProduct, "sizes" | "disabled_sizes">) =>
  p.sizes.filter((size) => !p.disabled_sizes.includes(size));

/** Condições comerciais que ainda faltam para abrir a venda. */
export function missingConditions(p: ShirtProduct): ShirtCondition[] {
  const missing: ShirtCondition[] = [];
  if (p.price_cents === null || p.price_cents < 1) missing.push("price");
  if (enabledSizes(p).length === 0) missing.push("sizes");
  if (blank(p.size_guide)) missing.push("size_guide");
  if (blank(p.production_lead_time)) missing.push("lead_time");
  if (blank(p.receipt_details)) missing.push("receipt");
  if (p.sales_end === null) missing.push("window");
  if (p.batch_limit === null) missing.push("batch_limit");
  if (p.max_per_order === null) missing.push("max_per_order");
  if (blank(p.purchase_policy)) missing.push("policy");
  return missing;
}

export type ShirtAvailability =
  | { state: "open"; maxQuantity: number }
  | { state: "closed" | "coupon_required" | "scheduled" | "ended" | "sold_out"; maxQuantity: 0 };

/** O visitante tem um cupom válido (conferido no servidor)? Cupom de teste não ocupa o lote. */
export type CouponAccess = { valid: boolean; isTest: boolean };
export const NO_COUPON: CouponAccess = { valid: false, isTest: false };

/**
 * Situação da venda para quem está olhando. `usedUnits` = unidades pagas + reservas válidas,
 * sem as encomendas de teste (null se não foi possível consultar; nesse caso o limite é
 * conferido só no servidor). O servidor repete todas estas regras em `create_shirt_order`.
 */
export function shirtAvailability(
  p: ShirtProduct,
  usedUnits: number | null,
  access: CouponAccess = NO_COUPON,
  now = Date.now(),
): ShirtAvailability {
  if (p.sales_mode === "fechada" || missingConditions(p).length > 0) return { state: "closed", maxQuantity: 0 };
  if (p.sales_end && Date.parse(p.sales_end) < now) return { state: "ended", maxQuantity: 0 };
  if (p.sales_mode === "cupom" && !access.valid) return { state: "coupon_required", maxQuantity: 0 };
  // O início da janela vale só para a venda aberta ao público.
  if (p.sales_mode === "aberta" && p.sales_start && Date.parse(p.sales_start) > now) {
    return { state: "scheduled", maxQuantity: 0 };
  }
  const lotApplies = !(access.valid && access.isTest);
  const remaining = lotApplies && usedUnits !== null ? (p.batch_limit ?? 0) - usedUnits : Infinity;
  if (remaining < 1) return { state: "sold_out", maxQuantity: 0 };
  return { state: "open", maxQuantity: Math.min(p.max_per_order ?? 1, remaining) };
}

export const availabilityMessage: Record<Exclude<ShirtAvailability["state"], "open">, string> = {
  closed: "As encomendas ainda não foram abertas.",
  coupon_required: "As encomendas estão abertas só para quem tem um cupom.",
  scheduled: "As encomendas ainda não foram abertas.",
  ended: "O prazo para encomendar terminou.",
  sold_out: "O lote desta camisa esgotou.",
};

/** Uma encomenda ocupa o lote se está paga ou reservada (pendente dentro do prazo / cartão em análise). */
export function countsTowardLot(
  order: { status: string; expires_at: string | null; mp_status: string | null },
  now = Date.now(),
) {
  if (order.status === "pago") return true;
  if (order.status !== "pendente") return false;
  if (order.mp_status === "in_process" || order.mp_status === "authorized") return true;
  return order.expires_at !== null && Date.parse(order.expires_at) > now;
}

export type ShirtSelection = { size: string; quantity: number };
export type SelectionResult =
  | { ok: true; selection: ShirtSelection }
  | { ok: false; field: "size" | "quantity"; message: string };

/** Valida tamanho (da grade confirmada) e quantidade (1..máximo). Nunca assume tamanho. */
export function validateSelection(
  sizes: string[],
  maxQuantity: number,
  input: { size?: string | null; quantity?: number | null },
): SelectionResult {
  const size = input.size?.trim() ?? "";
  if (!size) return { ok: false, field: "size", message: "Escolha um tamanho para continuar." };
  if (!sizes.includes(size)) return { ok: false, field: "size", message: "Esse tamanho não está disponível." };
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
    return {
      ok: false,
      field: "quantity",
      message: maxQuantity > 1 ? `Escolha de 1 a ${maxQuantity} camisas.` : "Quantidade inválida.",
    };
  }
  return { ok: true, selection: { size, quantity } };
}

/** Lê tamanho, quantidade e cupom dos parâmetros da URL (`tamanho`, `qtd`, `cupom`). */
export function parseSelectionParams(params: Record<string, string | string[] | undefined>) {
  const size = typeof params.tamanho === "string" ? params.tamanho.trim().slice(0, 12) : "";
  const qtdText = typeof params.qtd === "string" ? params.qtd : "1";
  const quantity = /^\d{1,2}$/.test(qtdText) ? Number(qtdText) : NaN;
  const coupon = typeof params.cupom === "string" ? normalizeCouponCode(params.cupom) : "";
  return { size, quantity, coupon };
}

export const shirtCheckoutHref = (selection: ShirtSelection, coupon?: string) =>
  `${SHIRT_PATH}/checkout?tamanho=${encodeURIComponent(selection.size)}&qtd=${selection.quantity}${
    coupon ? `&cupom=${encodeURIComponent(coupon)}` : ""
  }`;

export const shirtOrderPath = (order: { id: string; access_key: string }) =>
  `/loja/pedido/${order.id}?k=${order.access_key}`;

/** "K7M2P9QA" → "K7M2-P9QA". */
export const formatOrderCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/** Ordena os tamanhos pela grade do produto; tamanhos fora da grade vão ao fim, em ordem alfabética. */
export function sortBySizeOrder<T extends { size: string }>(rows: T[], grid: string[]) {
  const rank = (size: string) => {
    const i = grid.indexOf(size);
    return i === -1 ? grid.length : i;
  };
  return [...rows].sort((a, b) => rank(a.size) - rank(b.size) || a.size.localeCompare(b.size, "pt-BR"));
}

/** Completa a lista com os tamanhos da grade que ainda não têm encomendas (valores zerados). */
export function withAllSizes<T extends { size: string }>(rows: T[], grid: string[], empty: (size: string) => T) {
  const present = new Set(rows.map((r) => r.size));
  return sortBySizeOrder([...rows, ...grid.filter((s) => !present.has(s)).map(empty)], grid);
}

/** Tabela, visão ou coluna de camisas inexistente (migrations ainda não aplicadas). */
export function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  if (!/shirt_(products|orders|coupons)|v_shirt_|shirt_sales_gaps|create_shirt_order|validate_shirt_coupon/.test(message)) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST202" ||
    /does not exist|schema cache/.test(message)
  );
}

/** Encomenda de total zero (cupom de 100%): nasce paga, sem Mercado Pago, taxa nem reserva. */
export const isFreeShirtOrder = (order: { total_cents: number }) => order.total_cents === 0;


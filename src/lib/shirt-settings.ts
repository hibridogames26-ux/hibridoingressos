import { parseReaisToCents } from "@/lib/format";
import { parseBrasiliaLocal, toBrasiliaLocalInput } from "@/lib/shirt-coupons";
import type { ShirtProduct } from "@/lib/shirts";

/** O que o formulário "Editar configurações" envia (tudo texto, como digitado). */
export type SettingsFormInput = {
  price: string;
  batchLimit: string;
  maxPerOrder: string;
  salesEnd: string;
  salesStart: string;
  sizes: string;
  description: string;
  composition: string;
  fit: string;
  leadTime: string;
  receipt: string;
  policy: string;
  sizeGuide: string;
};

/** Valores no formato de `update_shirt_settings` (chave presente com null limpa o campo). */
export type SettingsValues = Record<string, string | number | string[] | null>;

const intIn = (text: string, min: number, max: number) =>
  /^\d{1,6}$/.test(text.trim()) && Number(text) >= min && Number(text) <= max ? Number(text) : null;

/** "p, m,G  gg" → ["P","M","G","GG"] (separa por vírgula, ponto e vírgula ou espaço; sem repetidos). */
export function parseSizesText(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[,;\s]+/)) {
    const size = part.trim().toUpperCase();
    if (size) seen.add(size);
  }
  return [...seen];
}

/** Seções do módulo Configurações: cada aba salva só os campos dela, sem sobrescrever as outras. */
export const SETTINGS_SECTIONS = {
  venda: ["price", "batchLimit", "maxPerOrder", "salesEnd", "salesStart"],
  tamanhos: ["sizes"],
  textos: ["description", "composition", "fit", "leadTime", "receipt", "policy", "sizeGuide"],
} as const satisfies Record<string, readonly (keyof SettingsFormInput)[]>;
export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

/**
 * Valida o formulário. Só os campos presentes em `input` entram no resultado (e na validação),
 * então uma aba pode salvar a sua parte sem tocar no resto.
 */
export function parseSettingsForm(
  input: Partial<SettingsFormInput>,
): { ok: true; values: SettingsValues } | { ok: false; message: string } {
  const values: SettingsValues = {};
  const has = (key: keyof SettingsFormInput) => typeof input[key] === "string";

  if (has("price")) {
    const price = input.price!.trim();
    if (price === "") values.price_cents = null;
    else {
      const cents = parseReaisToCents(price);
      if (cents === null || cents < 1 || cents > 10_000_000) return { ok: false, message: "Informe o preço em reais, por exemplo 89,90." };
      values.price_cents = cents;
    }
  }

  if (has("batchLimit")) {
    const batch = input.batchLimit!.trim();
    if (batch === "") values.batch_limit = null;
    else {
      const n = intIn(batch, 1, 100_000);
      if (n === null) return { ok: false, message: "O limite do lote precisa ser um número inteiro maior que zero." };
      values.batch_limit = n;
    }
  }

  if (has("maxPerOrder")) {
    const max = input.maxPerOrder!.trim();
    if (max === "") values.max_per_order = null;
    else {
      const n = intIn(max, 1, 10);
      if (n === null) return { ok: false, message: "A quantidade máxima por compra vai de 1 a 10." };
      values.max_per_order = n;
    }
  }

  if (has("salesEnd")) {
    const end = input.salesEnd!.trim();
    if (end === "") values.sales_end = null;
    else {
      const iso = parseBrasiliaLocal(end, true);
      if (!iso) return { ok: false, message: "Data limite para encomendar inválida." };
      values.sales_end = iso;
    }
  }

  if (has("salesStart")) {
    const start = input.salesStart!.trim();
    if (start === "") values.sales_start = null;
    else {
      const iso = parseBrasiliaLocal(start);
      if (!iso) return { ok: false, message: "Data de abertura ao público inválida." };
      values.sales_start = iso;
    }
  }
  if (typeof values.sales_start === "string" && typeof values.sales_end === "string" && Date.parse(values.sales_end) <= Date.parse(values.sales_start)) {
    return { ok: false, message: "A data limite precisa ser depois da abertura ao público." };
  }

  if (has("sizes")) {
    const sizes = parseSizesText(input.sizes!);
    if (sizes.length > 12) return { ok: false, message: "A grade aceita até 12 tamanhos." };
    if (sizes.some((s) => s.length > 12)) return { ok: false, message: "Cada tamanho pode ter até 12 caracteres." };
    values.sizes = sizes;
  }

  const text = (v: string, max: number) => v.trim().slice(0, max) || null;
  if (has("description")) values.description = text(input.description!, 500);
  if (has("composition")) values.composition = text(input.composition!, 300);
  if (has("fit")) values.fit = text(input.fit!, 300);
  if (has("leadTime")) values.production_lead_time = text(input.leadTime!, 500);
  if (has("receipt")) values.receipt_details = text(input.receipt!, 500);
  if (has("policy")) values.purchase_policy = text(input.policy!, 2000);
  if (has("sizeGuide")) values.size_guide = text(input.sizeGuide!, 3000);

  return { ok: true, values };
}

const reais = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/** Valores iniciais do formulário a partir do produto salvo. */
export function settingsInitial(p: ShirtProduct): SettingsFormInput {
  return {
    price: reais(p.price_cents),
    batchLimit: p.batch_limit === null ? "" : String(p.batch_limit),
    maxPerOrder: p.max_per_order === null ? "" : String(p.max_per_order),
    salesEnd: toBrasiliaLocalInput(p.sales_end),
    salesStart: toBrasiliaLocalInput(p.sales_start),
    sizes: p.sizes.join(", "),
    description: p.description ?? "",
    composition: p.composition ?? "",
    fit: p.fit ?? "",
    leadTime: p.production_lead_time ?? "",
    receipt: p.receipt_details ?? "",
    policy: p.purchase_policy ?? "",
    sizeGuide: p.size_guide ?? "",
  };
}

// Configura (ou mostra) as condições comerciais da camisa oficial sob encomenda.
// A venda só abre com todas as condições definidas e com --enable.
//
// Uso:
//   npm run shirt:config -- --show
//   npm run shirt:config -- --price 89,90 --sizes P,M,G,GG,XG --size-guide "Tabela do fornecedor" \
//     --lead-time "30 dias após o fim das encomendas" --receipt "Retirada no evento" \
//     --policy "Sem troca após a produção" --sales-end "2026-11-10 23:59" --batch-limit 120 --max-per-order 2
//   npm run shirt:config -- --mode cupom  # só com cupom (teste de pagamento ou pré-venda)
//   npm run shirt:config -- --enable      # abre ao público (mesmo que --mode aberta)
//   npm run shirt:config -- --disable     # fecha a venda (mesmo que --mode fechada)
// Cupons e tamanhos desabilitados ficam no dashboard (/admin/camisas).
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const SLUG = "camisa-hibrido-games";

const { values } = parseArgs({
  options: {
    show: { type: "boolean" },
    mode: { type: "string" },
    enable: { type: "boolean" },
    disable: { type: "boolean" },
    price: { type: "string" },
    sizes: { type: "string" },
    "size-guide": { type: "string" },
    description: { type: "string" },
    composition: { type: "string" },
    fit: { type: "string" },
    "lead-time": { type: "string" },
    receipt: { type: "string" },
    policy: { type: "string" },
    "sales-start": { type: "string" },
    "sales-end": { type: "string" },
    "batch-limit": { type: "string" },
    "max-per-order": { type: "string" },
  },
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** "89,90" | "89.90" | "90" → centavos. */
function parsePrice(text: string) {
  const normalized = text.trim().replace(/^R\$\s*/i, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) fail(`Preço inválido: "${text}". Use, por exemplo, 89,90.`);
  const cents = Math.round(Number(normalized) * 100);
  if (cents < 1) fail("O preço precisa ser maior que zero.");
  return cents;
}

/** "2026-11-10" (fim do dia) ou "2026-11-10 23:59", sempre no horário de Brasília (UTC−3). */
function parseBrasilia(text: string) {
  const m = text.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$/);
  if (!m) fail(`Data inválida: "${text}". Use AAAA-MM-DD ou "AAAA-MM-DD HH:MM".`);
  const date = new Date(`${m[1]}T${m[2] ?? "23:59"}:00-03:00`);
  if (Number.isNaN(date.getTime())) fail(`Data inválida: "${text}".`);
  return date.toISOString();
}

function parseInteger(name: string, text: string, min: number, max: number) {
  const n = Number(text);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${name} precisa ser um inteiro entre ${min} e ${max}.`);
  return n;
}

type Product = Record<string, unknown> & {
  price_cents: number | null;
  sizes: string[];
  disabled_sizes: string[];
  size_guide: string | null;
  production_lead_time: string | null;
  receipt_details: string | null;
  purchase_policy: string | null;
  sales_end: string | null;
  batch_limit: number | null;
  max_per_order: number | null;
  sales_mode: "fechada" | "cupom" | "aberta";
};

const blank = (v: string | null) => !v || v.trim() === "";

/** Espelha public.shirt_sales_gaps (supabase/migrations/20261007000000_shirt_orders.sql). */
function missing(p: Product) {
  const gaps: string[] = [];
  if (p.price_cents === null || p.price_cents < 1) gaps.push("preço (--price)");
  if (p.sizes.filter((size) => !p.disabled_sizes.includes(size)).length === 0) gaps.push("grade de tamanhos (--sizes)");
  if (blank(p.size_guide)) gaps.push("medidas (--size-guide)");
  if (blank(p.production_lead_time)) gaps.push("prazo de produção (--lead-time)");
  if (blank(p.receipt_details)) gaps.push("forma de recebimento (--receipt)");
  if (p.sales_end === null) gaps.push("data limite (--sales-end)");
  if (p.batch_limit === null) gaps.push("limite do lote (--batch-limit)");
  if (p.max_per_order === null) gaps.push("quantidade máxima por compra (--max-per-order)");
  if (blank(p.purchase_policy)) gaps.push("trocas e cancelamento (--policy)");
  return gaps;
}

async function load() {
  const { data, error } = await supabase.from("shirt_products").select("*").eq("slug", SLUG).maybeSingle<Product>();
  if (error) {
    const hint = /shirt_products|schema cache/.test(error.message) ? " Aplique as migrations antes (npm run db:push)." : "";
    fail(`Falha ao ler o produto: ${error.message}.${hint}`);
  }
  if (!data) fail(`Produto "${SLUG}" não encontrado. Aplique as migrations (npm run db:push).`);
  return data;
}

function show(p: Product) {
  const gaps = missing(p);
  console.log(`Produto: ${p.name} (${SLUG})`);
  const modeText = { fechada: "FECHADA", cupom: "SOMENTE COM CUPOM", aberta: "ABERTA" }[p.sales_mode];
  console.log(`Modo de venda: ${modeText}`);
  console.log(`Preço: ${p.price_cents === null ? "—" : `R$ ${(p.price_cents / 100).toFixed(2).replace(".", ",")}`}`);
  console.log(`Tamanhos: ${p.sizes.length ? p.sizes.join(", ") : "—"}${p.disabled_sizes.length ? ` (desabilitados: ${p.disabled_sizes.join(", ")})` : ""}`);
  console.log(`Medidas: ${p.size_guide ?? "—"}`);
  console.log(`Prazo de produção: ${p.production_lead_time ?? "—"}`);
  console.log(`Recebimento: ${p.receipt_details ?? "—"}`);
  console.log(`Política: ${p.purchase_policy ?? "—"}`);
  console.log(`Início: ${p.sales_start ?? "—"} · Fim: ${p.sales_end ?? "—"}`);
  console.log(`Limite do lote: ${p.batch_limit ?? "—"} · Máx. por compra: ${p.max_per_order ?? "—"}`);
  console.log(gaps.length ? `\nFaltam ${gaps.length} condições para abrir a venda:\n- ${gaps.join("\n- ")}` : "\nTodas as condições estão definidas.");
}

try {
  const patch: Record<string, unknown> = {};
  if (values.price !== undefined) patch.price_cents = parsePrice(values.price);
  if (values.sizes !== undefined) {
    const sizes = values.sizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (new Set(sizes).size !== sizes.length || sizes.length > 12) fail("Tamanhos repetidos ou mais de 12.");
    patch.sizes = sizes;
  }
  if (values["size-guide"] !== undefined) patch.size_guide = values["size-guide"].trim() || null;
  if (values.description !== undefined) patch.description = values.description.trim() || null;
  if (values.composition !== undefined) patch.composition = values.composition.trim() || null;
  if (values.fit !== undefined) patch.fit = values.fit.trim() || null;
  if (values["lead-time"] !== undefined) patch.production_lead_time = values["lead-time"].trim() || null;
  if (values.receipt !== undefined) patch.receipt_details = values.receipt.trim() || null;
  if (values.policy !== undefined) patch.purchase_policy = values.policy.trim() || null;
  if (values["sales-start"] !== undefined) patch.sales_start = parseBrasilia(values["sales-start"]);
  if (values["sales-end"] !== undefined) patch.sales_end = parseBrasilia(values["sales-end"]);
  if (values["batch-limit"] !== undefined) patch.batch_limit = parseInteger("--batch-limit", values["batch-limit"], 1, 100000);
  if (values["max-per-order"] !== undefined) patch.max_per_order = parseInteger("--max-per-order", values["max-per-order"], 1, 10);

  const requested = values.enable ? "aberta" : values.disable ? "fechada" : values.mode;
  if ([values.enable, values.disable, values.mode !== undefined].filter(Boolean).length > 1) {
    fail("Use só um entre --mode, --enable e --disable.");
  }
  if (requested !== undefined && !["fechada", "cupom", "aberta"].includes(requested)) {
    fail('--mode precisa ser "fechada", "cupom" ou "aberta".');
  }
  let product = await load();

  if (Object.keys(patch).length) {
    const { error } = await supabase.from("shirt_products").update(patch).eq("slug", SLUG);
    if (error) fail(`Falha ao salvar: ${error.message}`);
    product = await load();
    console.log(`Salvo: ${Object.keys(patch).join(", ")}.`);
  }

  if (requested !== undefined) {
    if (requested !== "fechada") {
      const gaps = missing(product);
      if (gaps.length) fail(`Não é possível abrir a venda. Faltam:\n- ${gaps.join("\n- ")}`);
    }
    const { error } = await supabase.from("shirt_products").update({ sales_mode: requested }).eq("slug", SLUG);
    if (error) fail(`Falha ao mudar o modo de venda: ${error.message}`);
    console.log(`Modo de venda: ${requested}.`);
    product = await load();
  }

  if (values.show || (!Object.keys(patch).length && requested === undefined)) show(product);
} catch (error) {
  console.error("Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
}

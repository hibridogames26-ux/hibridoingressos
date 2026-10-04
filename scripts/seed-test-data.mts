// Dados de TESTE para desenvolver o dashboard e a portaria antes do checkout real.
// Tudo é marcado com "[TESTE]" e removido com --clean.
// Uso: npm run seed:test        (cria)
//      npm run seed:test -- --clean   (remove)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const TAG = "[TESTE]";

// Datas em São Paulo (UTC−3): A vale hoje (portaria libera), B amanhã (portaria recusa).
const spDate = (offsetDays: number) =>
  new Date(Date.now() - 3 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
const today = () => spDate(0);
const tomorrow = () => spDate(1);

async function clean() {
  const { data: types } = await supabase.from("ticket_types").select("id").like("name", `${TAG}%`);
  const typeIds = (types ?? []).map((t) => t.id);
  if (typeIds.length) {
    // Leituras da portaria nos ingressos de teste (senão ficariam órfãs no log).
    const { data: tickets } = await supabase.from("tickets").select("id").in("ticket_type_id", typeIds);
    const ticketIds = (tickets ?? []).map((t) => t.id);
    if (ticketIds.length) {
      const { error: e0 } = await supabase.from("ticket_scans").delete().in("ticket_id", ticketIds);
      if (e0) throw e0;
    }
  }
  const { error: e1 } = await supabase.from("orders").delete().like("buyer_name", `${TAG}%`);
  if (e1) throw e1;
  if (typeIds.length) {
    const { error: e2 } = await supabase.from("ticket_types").delete().in("id", typeIds);
    if (e2) throw e2;
  }
  console.log("Dados de teste removidos.");
}

async function seed() {
  const { data: types, error } = await supabase
    .from("ticket_types")
    .insert([
      { name: `${TAG} Ingresso A`, price_cents: 15000, quantity: 100, sort_order: 1, event_date: today() },
      { name: `${TAG} Ingresso B`, price_cents: 6000, quantity: 300, sort_order: 2, event_date: tomorrow() },
    ])
    .select();
  if (error) throw error;

  const statuses = ["pago", "pago", "pago", "pago", "pago", "pago", "pendente", "estornado"] as const;
  const codes: string[] = [];

  for (let i = 0; i < 24; i++) {
    const type = types[i % types.length];
    const qty = 1 + (i % 2);
    const total = type.price_cents * qty;
    const status = statuses[i % statuses.length];
    const method = i % 3 === 0 ? "cartao" : "pix";
    const fee = status === "pago" ? Math.round(total * (method === "pix" ? 0.0099 : 0.0499)) : 0;
    const paidAt = new Date(Date.now() - (i % 10) * 86400000).toISOString();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        buyer_name: `${TAG} Comprador ${i + 1}`,
        buyer_email: `teste${i + 1}@example.com`,
        buyer_cpf: String(10000000000 + i),
        status,
        payment_method: status === "pendente" ? null : method,
        total_cents: total,
        fee_cents: fee,
        net_cents: status === "pago" ? total - fee : 0,
        paid_at: status === "pendente" ? null : paidAt,
        created_at: paidAt,
      })
      .select()
      .single();
    if (orderError) throw orderError;

    await supabase
      .from("order_items")
      .insert({ order_id: order.id, ticket_type_id: type.id, quantity: qty, unit_price_cents: type.price_cents });

    if (status === "pendente") continue;
    const { data: tickets, error: ticketError } = await supabase
      .from("tickets")
      .insert(
        Array.from({ length: qty }, (_, n) => ({
          order_id: order.id,
          ticket_type_id: type.id,
          holder_name: `${TAG} Titular ${i + 1}.${n + 1}`,
          status: status === "estornado" ? "cancelado" : "valido",
        })),
      )
      .select("short_code, status");
    if (ticketError) throw ticketError;
    for (const t of tickets) if (t.status === "valido") codes.push(t.short_code);
  }

  for (const type of types) {
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("ticket_type_id", type.id)
      .neq("status", "cancelado");
    await supabase.from("ticket_types").update({ sold: count ?? 0 }).eq("id", type.id);
  }

  console.log("Dados de teste criados. Códigos válidos para testar a portaria:");
  console.log(codes.slice(0, 5).join("  "));
}

try {
  if (process.argv.includes("--clean")) await clean();
  else await seed();
} catch (error) {
  console.error("Error in seed-test-data:", error);
  process.exit(1);
}

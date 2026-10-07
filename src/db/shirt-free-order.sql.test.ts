import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { couponFinalCents, parseCouponForm, type CouponKind } from "../lib/shirt-coupons";

/**
 * Fluxo completo da encomenda gratuita, num Postgres em memória (PGlite) com as migrations reais:
 * o admin cria um cupom de 100%, o comprador encomenda com ele, a encomenda já nasce paga (sem Mercado Pago)
 * e o admin dá saída (aguardando produção → em produção → pronto → entregue).
 */
const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
const SLUG = "camisa-hibrido-games";

const INFRA = `
  create schema extensions; create schema auth;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public, extensions, auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
    select decode(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, n * 2), 'hex') $$;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

let db: PGlite;
let admin: string;
let staff: string;
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;
const failsWith = (sql: string, message: RegExp | string, params?: unknown[]) => expect(db.query(sql, params)).rejects.toThrow(message);

/** Executa como um papel do Supabase (RLS e permissões valem). */
async function asRole<T>(role: "anon" | "authenticated", uid: string | null, sql: string, params?: unknown[]) {
  await db.exec(`set role ${role}; set app.uid = '${uid ?? ""}'`);
  try {
    return await q<T>(sql, params);
  } finally {
    await db.exec("reset role; set app.uid = ''");
  }
}

const buyer = (cpf = "52998224725") => ["Ana Souza", "ana@example.com", cpf, "83999990000"];
const order = (size: string, qty: number, coupon: string | null, cpf?: string) =>
  q<{ order_id: string; access_key: string; subtotal_cents: number }>(
    "select * from public.create_shirt_order($1,$2,$3,$4,$5,$6,$7,$8)",
    [SLUG, ...buyer(cpf), size, qty, coupon],
  );
const orderRow = async (id: string) => (await q<Record<string, unknown>>("select * from public.shirt_orders where id = $1", [id]))[0];

/** Insere o cupom exatamente como a Server Action: o formulário valida e o admin grava via RLS. */
async function createCouponAsAdmin(form: Parameters<typeof parseCouponForm>[0]) {
  const parsed = parseCouponForm(form);
  if (!parsed.ok) throw new Error(parsed.message);
  const c = parsed.coupon;
  return asRole<{ id: string; code: string }>(
    "authenticated",
    admin,
    `insert into public.shirt_coupons (code, kind, value, max_uses, valid_from, valid_until, campaign, is_test, max_per_buyer)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, code`,
    [c.code, c.kind, c.value, c.max_uses, c.valid_from, c.valid_until, c.campaign, c.is_test, c.max_per_buyer],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(INFRA);
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8").replace(/create extension if not exists pgcrypto[^;]*;/i, ""));
  }
  [{ id: admin }] = await q<{ id: string }>("insert into auth.users default values returning id");
  [{ id: staff }] = await q<{ id: string }>("insert into auth.users default values returning id");
  await db.exec(`insert into public.profiles (user_id, name, email, role) values
    ('${admin}','Adm','adm@e.com','admin'), ('${staff}','Stf','stf@e.com','staff')`);
  await db.exec(`update public.shirt_products set price_cents = 8000, sizes = '{P,M,G}', size_guide = 'tabela',
    production_lead_time = '30 dias', receipt_details = 'retirada', purchase_policy = 'sem troca',
    sales_end = now() + interval '10 days', batch_limit = 10, max_per_order = 2, sales_mode = 'aberta'`);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("cupom de 100%", () => {
  it("o formulário aceita 100% com limite de usos e recusa sem limite ou acima de 100", () => {
    expect(parseCouponForm({ code: "cortesia 100", kind: "percent", value: "100", maxUses: "1" })).toMatchObject({
      ok: true,
      coupon: { code: "CORTESIA100", kind: "percent", value: 100, max_uses: 1 },
    });
    expect(parseCouponForm({ code: "CORTESIA100", kind: "percent", value: "100" })).toMatchObject({
      ok: false,
      message: expect.stringContaining("limite de usos"),
    });
    expect(parseCouponForm({ code: "CORTESIA100", kind: "percent", value: "101", maxUses: "1" })).toMatchObject({ ok: false });
    expect(parseCouponForm({ code: "CORTESIA100", kind: "percent", value: "0", maxUses: "1" })).toMatchObject({ ok: false });
  });

  it("o banco também exige o limite e não passa de 100", async () => {
    await failsWith("insert into public.shirt_coupons (code, kind, value) values ('SEMLIMITE', 'percent', 100)", "shirt_coupons_free_needs_limit");
    await failsWith("insert into public.shirt_coupons (code, kind, value, max_uses) values ('PCT101', 'percent', 101, 1)", "shirt_coupons_value");
    await db.exec("insert into public.shirt_coupons (code, kind, value, max_uses) values ('PCT100OK', 'percent', 100, 3)");
  });

  it("só o admin cria o cupom (RLS); staff e visitante não", async () => {
    await expect(
      asRole("authenticated", staff, "insert into public.shirt_coupons (code, kind, value, max_uses) values ('STAFF100', 'percent', 100, 1)"),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asRole("anon", null, "insert into public.shirt_coupons (code, kind, value, max_uses) values ('ANON100', 'percent', 100, 1)"),
    ).rejects.toThrow(/permission denied/);
  });

  it("o valor final em TS e em SQL coincide, e só o 100% zera (os outros mantêm o piso de R$ 1,00)", async () => {
    const cases: [CouponKind, number, number][] = [
      ["percent", 100, 8000],
      ["percent", 99, 8000],
      ["percent", 50, 8000],
      ["percent", 1, 8000],
      ["percent", 100, 16000],
      ["amount", 8000, 8000],
      ["amount", 99999, 8000],
      ["amount", 500, 8000],
      ["final", 100, 8000],
      ["final", 8000, 8000],
      ["final", 20000, 8000],
    ];
    for (const [kind, value, list] of cases) {
      const [{ f }] = await q<{ f: number }>("select public.shirt_coupon_final_cents($1::public.shirt_coupon_kind, $2, $3) as f", [kind, value, list]);
      expect(f, `${kind} ${value} sobre ${list}`).toBe(couponFinalCents(kind, value, list));
    }
    expect(couponFinalCents("percent", 100, 8000)).toBe(0);
    expect(couponFinalCents("percent", 99, 8000)).toBe(100);
    expect(couponFinalCents("amount", 8000, 8000)).toBe(100);
  });
});

describe("pedido gratuito, do cupom à saída", () => {
  const ids: Record<string, string> = {};

  it("1. admin cria o cupom de 100% (1 uso)", async () => {
    const [coupon] = await createCouponAsAdmin({ code: "CORTESIA100", kind: "percent", value: "100", maxUses: "1", campaign: "Cortesia", maxPerBuyer: "1" });
    expect(coupon.code).toBe("CORTESIA100");
    ids.coupon = coupon.id;
  });

  it("2. a conferência do cupom devolve total zero", async () => {
    const [{ v }] = await q<{ v: Record<string, unknown> }>("select public.validate_shirt_coupon($1,'CORTESIA100',1) as v", [SLUG]);
    expect(v).toMatchObject({ code: "CORTESIA100", kind: "percent", value: 100, list_cents: 8000, final_cents: 0, discount_cents: 8000 });
  });

  it("3. o pedido com o cupom nasce pago, sem pagamento, taxa nem reserva", async () => {
    const [created] = await order("M", 1, "cortesia100");
    ids.order = created.order_id;
    expect(created.subtotal_cents).toBe(0);
    expect(created.access_key).toHaveLength(64);

    expect(await orderRow(ids.order)).toMatchObject({
      status: "pago",
      subtotal_cents: 0,
      total_cents: 0,
      discount_cents: 8000,
      unit_price_cents: 8000,
      fee_cents: 0,
      net_cents: 0,
      payment_method: null,
      mp_payment_id: null,
      expires_at: null,
      coupon_code: "CORTESIA100",
      fulfillment_status: "aguardando_producao",
      is_test: false,
    });
    expect((await orderRow(ids.order)).paid_at).toBeTruthy();
  });

  it("4. o uso conta no cupom e esgota o limite", async () => {
    const [row] = await q<Record<string, unknown>>("select * from public.v_shirt_coupons where code = 'CORTESIA100'");
    expect(row).toMatchObject({ paid_uses: 1, pending_uses: 0 });
    expect(Number(row.discount_given_cents)).toBe(8000);
    expect(Number(row.revenue_cents)).toBe(0);
    await failsWith("select * from public.create_shirt_order($1,'Bia Lima','bia@e.com','11144477735','83999990000','G',1,'CORTESIA100')", "coupon_invalid", [SLUG]);
    await failsWith("select public.validate_shirt_coupon($1,'CORTESIA100',1)", "coupon_invalid", [SLUG]);
  });

  it("5. o pedido gratuito entra no lote e nas vendas por tamanho, com receita zero", async () => {
    const [summary] = await asRole<Record<string, unknown>>("authenticated", admin, "select * from public.v_shirt_finance_summary");
    expect(Number(summary.paid_orders)).toBe(1);
    expect(Number(summary.paid_units)).toBe(1);
    expect(Number(summary.gross_cents)).toBe(0);
    expect(Number(summary.fee_cents)).toBe(0);
    expect(Number(summary.pending_orders)).toBe(0);

    const bySize = await asRole<Record<string, unknown>>("authenticated", admin, "select * from public.v_shirt_sales_by_size where size = 'M'");
    expect(Number(bySize[0].paid_units)).toBe(1);
    expect(Number(bySize[0].waiting_units)).toBe(1);

    const byMethod = await asRole<Record<string, unknown>>("authenticated", admin, "select * from public.v_shirt_sales_by_method");
    expect(byMethod).toEqual([expect.objectContaining({ payment_method: null, orders: 1, units: 1 })]);

    // O lote de 10 camisas já tem 1 ocupada: o pedido gratuito não escapa do limite.
    await db.exec("update public.shirt_products set batch_limit = 1");
    await failsWith("select * from public.create_shirt_order($1,'Bia Lima','bia@e.com','11144477735','83999990000','G',1,'PCT100OK')", "sold_out", [SLUG]);
    await db.exec("update public.shirt_products set batch_limit = 10");
  });

  it("6. notificação do Mercado Pago sobre o pedido gratuito não o altera (idempotência)", async () => {
    const [{ s }] = await q<{ s: string }>("select public.apply_shirt_payment($1,'mp-x','approved',null,'pix',8000,79,7921,now()) as s", [ids.order]);
    expect(s).toBe("pago");
    expect(await orderRow(ids.order)).toMatchObject({ total_cents: 0, fee_cents: 0, mp_payment_id: null, payment_method: null });
  });

  it("7. só admin dá saída; staff e visitante não", async () => {
    await expect(asRole("authenticated", staff, "select public.set_shirt_fulfillment($1::uuid[], 'em_producao')", [[ids.order]])).rejects.toThrow("not_authorized");
    await expect(asRole("anon", null, "select public.set_shirt_fulfillment($1::uuid[], 'em_producao')", [[ids.order]])).rejects.toThrow();
    expect((await orderRow(ids.order)).fulfillment_status).toBe("aguardando_producao");
  });

  it("8. admin dá saída: em produção → pronto → entregue", async () => {
    for (const step of ["em_producao", "pronto", "entregue"] as const) {
      const [{ n }] = await asRole<{ n: number }>("authenticated", admin, "select public.set_shirt_fulfillment($1::uuid[], $2) as n", [[ids.order], step]);
      expect(n, step).toBe(1);
      expect((await orderRow(ids.order)).fulfillment_status).toBe(step);
    }
    // Já entregue: repetir não faz nada, e em lote nunca retrocede.
    const [{ n }] = await asRole<{ n: number }>("authenticated", admin, "select public.set_shirt_fulfillment($1::uuid[], 'em_producao') as n", [[ids.order]]);
    expect(n).toBe(0);
    const [summary] = await asRole<Record<string, unknown>>("authenticated", admin, "select * from public.v_shirt_sales_by_size where size = 'M'");
    expect(Number(summary.delivered_units)).toBe(1);
  });

  it("9. o cupom de 100% não pode perder o limite de usos depois de criado", async () => {
    await expect(
      asRole("authenticated", admin, "update public.shirt_coupons set max_uses = null where id = $1", [ids.coupon]),
    ).rejects.toThrow("shirt_coupons_free_needs_limit");
  });
});

describe("regras que continuam valendo", () => {
  it("cupom abaixo de 100% mantém o piso de R$ 1,00, nasce pendente e segue para o pagamento", async () => {
    await createCouponAsAdmin({ code: "QUASE99", kind: "percent", value: "99", maxUses: "1" });
    const [created] = await order("P", 1, "QUASE99", "11144477735");
    expect(created.subtotal_cents).toBe(100);
    const row = await orderRow(created.order_id);
    expect(row).toMatchObject({ status: "pendente", total_cents: 100, discount_cents: 7900, payment_method: null, paid_at: null });
    expect(row.expires_at).toBeTruthy();
    // Pendente ainda não avança na produção.
    const [{ n }] = await asRole<{ n: number }>("authenticated", admin, "select public.set_shirt_fulfillment($1::uuid[], 'em_producao') as n", [[created.order_id]]);
    expect(n).toBe(0);
  });

  it("valor fixo igual ao preço também mantém o piso (só o percentual de 100% é gratuito)", async () => {
    await createCouponAsAdmin({ code: "TUDOOFF", kind: "amount", value: "80,00", maxUses: "1" });
    const [created] = await order("G", 1, "TUDOOFF", "39053344705");
    expect(created.subtotal_cents).toBe(100);
    expect((await orderRow(created.order_id)).status).toBe("pendente");
  });

  it("limite por CPF vale também para o cupom gratuito", async () => {
    await createCouponAsAdmin({ code: "BRINDE2", kind: "percent", value: "100", maxUses: "5", maxPerBuyer: "1" });
    const first = await order("P", 1, "BRINDE2", "12345678909");
    expect(first[0].subtotal_cents).toBe(0);
    await failsWith(
      "select * from public.create_shirt_order($1,'Ana Souza','ana@example.com','12345678909','83999990000','P',1,'BRINDE2')",
      "coupon_buyer_limit",
      [SLUG],
    );
    // Outro CPF usa normalmente.
    expect((await order("P", 1, "BRINDE2", "98765432100"))[0].subtotal_cents).toBe(0);
  });

  it("modo Somente com cupom: o cupom de 100% libera a compra; sem cupom continua barrado", async () => {
    await db.exec("update public.shirt_products set sales_mode = 'cupom'");
    await failsWith("select * from public.create_shirt_order($1,'Ana Souza','a@e.com','1','2','M',1)", "coupon_required", [SLUG]);
    await createCouponAsAdmin({ code: "CUPOM100", kind: "percent", value: "100", maxUses: "1" });
    expect((await order("M", 1, "CUPOM100", "55566677788"))[0].subtotal_cents).toBe(0);
    await db.exec("update public.shirt_products set sales_mode = 'aberta'");
  });

  it("cupom de 100% marcado como teste fica fora do lote e da receita", async () => {
    const summary = () => asRole<Record<string, unknown>>("authenticated", admin, "select * from public.v_shirt_finance_summary").then((r) => r[0]);
    const before = await summary();
    await createCouponAsAdmin({ code: "TESTE100", kind: "percent", value: "100", maxUses: "1", isTest: true });
    const [created] = await order("M", 1, "TESTE100", "44455566677");
    expect(await orderRow(created.order_id)).toMatchObject({ status: "pago", is_test: true, total_cents: 0 });
    // Nem o painel de vendas nem o lote enxergam a encomenda de teste.
    const after = await summary();
    expect(Number(after.paid_orders)).toBe(Number(before.paid_orders));
    expect(Number(after.paid_units)).toBe(Number(before.paid_units));
    const lot = await asRole<{ n: number }>("authenticated", admin, "select coalesce(sum(paid_units), 0)::int as n from public.v_shirt_sales_by_size");
    expect(lot[0].n).toBe(Number(after.paid_units));
  });
});

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Executa as migrations num Postgres em memória (PGlite) com um mínimo da infraestrutura
 * do Supabase (roles, auth.uid, gen_random_bytes) e verifica as regras de camisa:
 * venda fechada por padrão, validações sob lock, pagamento idempotente, lote e permissões.
 */
const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;
const failsWith = async (sql: string, message: RegExp | string) => {
  await expect(db.query(sql)).rejects.toThrow(message);
};

const buyer = ["Ana Souza", "ana@example.com", "52998224725", "83999990000"];
const create = (size: string, qty: number) =>
  q<{ order_id: string; access_key: string; subtotal_cents: number }>(
    "select * from public.create_shirt_order('camisa-hibrido-games', $1,$2,$3,$4,$5,$6)",
    [...buyer, size, qty],
  );
const apply = (id: string, mpId: string, status: string, total = 8000, fee = 79, net = 7921, method = "pix", detail: string | null = null) =>
  q<{ s: string }>("select public.apply_shirt_payment($1,$2,$3,$4,$5,$6,$7,$8,now()) as s", [id, mpId, status, detail, method, total, fee, net]).then((r) => r[0].s);

const ids: Record<string, string> = {};

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

const migrationFiles = () => fs.readdirSync(MIGRATIONS).sort();
const readMigration = (file: string) =>
  fs.readFileSync(path.join(MIGRATIONS, file), "utf8").replace(/create extension if not exists pgcrypto[^;]*;/i, "");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(INFRA);
  for (const file of migrationFiles()) await db.exec(readMigration(file));
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("migrations de camisas", () => {
  it("cada migration roda duas vezes seguidas sem erro (idempotente)", async () => {
    const fresh = new PGlite();
    try {
      await fresh.exec(INFRA);
      for (const file of migrationFiles()) {
        await fresh.exec(readMigration(file));
        if (file.includes("shirt")) await fresh.exec(readMigration(file));
      }
    } finally {
      await fresh.close();
    }
  }, 60_000);
});

describe("venda fechada por padrão", () => {
  it("recusa encomenda com o produto recém-criado e com slug inexistente", async () => {
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',1)", "unavailable");
    await failsWith("select * from public.create_shirt_order('nao-existe','Ana Souza','a@e.com','1','2','M',1)", "unavailable");
  });

  it("lista as 9 condições pendentes", async () => {
    const [{ g }] = await q<{ g: string[] }>("select public.shirt_sales_gaps(p) as g from public.shirt_products p");
    expect(g).toEqual(["price", "sizes", "size_guide", "lead_time", "receipt", "window", "batch_limit", "max_per_order", "policy"]);
  });

  it("modo aberta sem as condições não abre a venda", async () => {
    await db.exec("update public.shirt_products set sales_mode = 'aberta'");
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',1)", "unavailable");
  });
});

describe("encomenda com condições completas", () => {
  beforeAll(async () => {
    await db.exec(`update public.shirt_products set price_cents = 8000, sizes = '{P,M,G}', size_guide = 'tabela',
      production_lead_time = '30 dias', receipt_details = 'retirada', purchase_policy = 'sem troca',
      sales_end = now() + interval '10 days', batch_limit = 3, max_per_order = 2, sales_mode = 'aberta'`);
  });

  it("valida tamanho e quantidade no servidor", async () => {
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','XG',1)", "invalid_size");
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','',1)", "invalid_size");
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',3)", "invalid_quantity");
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',0)", "invalid_quantity");
  });

  it("calcula o subtotal no servidor e grava o snapshot das condições", async () => {
    const [order] = await create("M", 1);
    ids.o1 = order.order_id;
    expect(order.subtotal_cents).toBe(8000);
    expect(order.access_key).toHaveLength(64);
    const [row] = await q<Record<string, unknown>>("select * from public.shirt_orders where id = $1", [order.order_id]);
    expect(row).toMatchObject({ status: "pendente", unit_price_cents: 8000, production_lead_time: "30 dias", purchase_policy: "sem troca", receipt_details: "retirada" });
    expect(String(row.code)).toHaveLength(8);
  });

  it("respeita o limite do lote contando reservas válidas", async () => {
    ids.o2 = (await create("G", 2))[0].order_id;
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','P',1)", "sold_out");
  });
});

describe("pagamento", () => {
  it("registra pendente e recusado sem confirmar", async () => {
    expect(await apply(ids.o1, "mp1", "pending", 8000, 0, 0)).toBe("pendente");
    expect(await apply(ids.o1, "mp1", "rejected", 8000, 0, 0, "cartao", "cc_rejected_high_risk")).toBe("pendente");
  });

  it("confirma o aprovado e ignora notificações repetidas ou antigas", async () => {
    expect(await apply(ids.o1, "mp1", "approved")).toBe("pago");
    expect(await apply(ids.o1, "mp1", "approved")).toBe("pago");
    expect(await apply(ids.o1, "mp0", "pending", 8000, 0, 0)).toBe("pago");
    const [paid] = await q<Record<string, unknown>>("select * from public.shirt_orders where id = $1", [ids.o1]);
    expect(paid).toMatchObject({ mp_payment_id: "mp1", fee_cents: 79, net_cents: 7921, expires_at: null });
    expect(paid.paid_at).toBeTruthy();
  });

  it("aprovado com valor abaixo do subtotal não confirma e não vincula o pagamento", async () => {
    expect(await apply(ids.o2, "mp2", "approved", 100, 1, 99)).toBe("pendente");
    const [row] = await q<{ status: string; mp_payment_id: string | null; mp_status_detail: string }>(
      "select status, mp_payment_id, mp_status_detail from public.shirt_orders where id = $1",
      [ids.o2],
    );
    expect(row).toEqual({ status: "pendente", mp_payment_id: null, mp_status_detail: "amount_mismatch" });
  });

  it("reserva vencida libera o lote e o pagamento tardio ainda confirma", async () => {
    await db.exec(`update public.shirt_orders set expires_at = now() - interval '1 minute' where id = '${ids.o2}'`);
    ids.o3 = (await create("P", 2))[0].order_id;
    expect((await q<{ status: string }>("select status from public.shirt_orders where id = $1", [ids.o2]))[0].status).toBe("cancelado");
    expect(await apply(ids.o2, "mp3", "approved", 16000, 160, 15840)).toBe("pago");
  });

  it("estorno tira a encomenda do lote e não ressuscita com aprovado repetido", async () => {
    expect(await apply(ids.o1, "mp1", "refunded", 8000, 0, 0)).toBe("estornado");
    expect(await apply(ids.o1, "mp1", "approved")).toBe("estornado");
    const [{ n }] = await q<{ n: number }>("select coalesce(sum(quantity),0)::int as n from public.shirt_orders where status in ('pago','pendente')");
    expect(n).toBe(4);
  });
});

describe("andamento da produção (admin)", () => {
  let admin: string;
  let staff: string;
  const advance = (list: string[], to: string, back = false) =>
    q<{ n: number }>("select public.set_shirt_fulfillment($1::uuid[], $2, $3) as n", [list, to, back]).then((r) => r[0].n);

  beforeAll(async () => {
    admin = (await q<{ id: string }>("insert into auth.users default values returning id"))[0].id;
    staff = (await q<{ id: string }>("insert into auth.users default values returning id"))[0].id;
    await db.exec(`insert into public.profiles (user_id, name, email, role) values ('${admin}','Adm','adm@e.com','admin'), ('${staff}','Stf','stf@e.com','staff')`);
  });

  it("staff não atualiza o andamento", async () => {
    await db.exec(`set app.uid = '${staff}'`);
    await failsWith(`select public.set_shirt_fulfillment(array['${ids.o2}']::uuid[], 'em_producao')`, "not_authorized");
  });

  it("admin avança só pedidos pagos, não retrocede em lote e corrige quando pedido", async () => {
    await db.exec(`set app.uid = '${admin}'`);
    expect(await advance([ids.o2, ids.o1, ids.o3], "em_producao")).toBe(1);
    expect(await advance([ids.o2], "aguardando_producao")).toBe(0);
    expect(await advance([ids.o2], "aguardando_producao", true)).toBe(1);
    expect(await advance([ids.o2], "entregue")).toBe(1);
    expect((await q<{ f: string }>("select fulfillment_status as f from public.shirt_orders where id = $1", [ids.o1]))[0].f).toBe("aguardando_producao");
  });

  it("não aceita andamento sem pagamento nem lista vazia", async () => {
    await failsWith(`update public.shirt_orders set fulfillment_status = 'pronto' where id = '${ids.o3}'`, "shirt_orders_fulfillment_needs_payment");
    await failsWith("select public.set_shirt_fulfillment('{}'::uuid[], 'pronto')", "invalid_ids");
  });
});

describe("visões do painel", () => {
  it("resumo financeiro separa pago, pendente e estornado", async () => {
    const [s] = await q<Record<string, string | number>>("select * from public.v_shirt_finance_summary");
    expect(Number(s.paid_orders)).toBe(1);
    expect(Number(s.paid_units)).toBe(2);
    expect(Number(s.gross_cents)).toBe(16000);
    expect(Number(s.refunded_orders)).toBe(1);
    expect(Number(s.refunded_cents)).toBe(8000);
    expect(Number(s.pending_orders)).toBe(1);
    expect(Number(s.pending_units)).toBe(2);
  });

  it("lote por tamanho mostra pagas, pendentes e andamento", async () => {
    const rows = await q<Record<string, string | number>>("select * from public.v_shirt_sales_by_size");
    const g = rows.find((r) => r.size === "G")!;
    expect([Number(g.paid_units), Number(g.delivered_units), Number(g.waiting_units)]).toEqual([2, 2, 0]);
    const p = rows.find((r) => r.size === "P")!;
    expect([Number(p.paid_units), Number(p.pending_units)]).toEqual([0, 2]);
  });

  it("vendas por dia e por forma de pagamento consideram só pagas", async () => {
    expect(await q("select * from public.v_shirt_sales_daily")).toHaveLength(1);
    const [m] = await q<Record<string, string | number>>("select * from public.v_shirt_sales_by_method");
    expect([Number(m.orders), Number(m.fee_cents)]).toEqual([1, 160]);
  });
});

describe("RLS e permissões", () => {
  const as = async <T>(role: string, uid: string | null, sql: string) => {
    await db.exec(`set role ${role}; set app.uid = '${uid ?? ""}'`);
    try {
      return await q<T>(sql);
    } finally {
      await db.exec("reset role");
    }
  };
  let admin: string;
  let staff: string;

  beforeAll(async () => {
    [{ user_id: admin }] = await q<{ user_id: string }>("select user_id from public.profiles where role = 'admin'");
    [{ user_id: staff }] = await q<{ user_id: string }>("select user_id from public.profiles where role = 'staff'");
  });

  it("catálogo é público; encomendas só para admin", async () => {
    expect((await as<{ n: number }>("anon", null, "select count(*)::int as n from public.shirt_products"))[0].n).toBe(1);
    await expect(as("anon", null, "select count(*)::int as n from public.shirt_orders")).rejects.toThrow(/permission denied/);
    expect((await as<{ n: number }>("authenticated", staff, "select count(*)::int as n from public.shirt_orders"))[0].n).toBe(0);
    expect((await as<{ n: number }>("authenticated", admin, "select count(*)::int as n from public.shirt_orders"))[0].n).toBe(3);
  });

  it("escritas diretas e RPCs de servidor ficam bloqueadas para usuários", async () => {
    await expect(as("authenticated", admin, "update public.shirt_orders set size = 'G'")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", admin, "select * from public.create_shirt_order('camisa-hibrido-games','a b','a@e.com','1','2','M',1)")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", admin, `select public.apply_shirt_payment('${ids.o1}','x','approved',null,'pix',1,0,1,now())`)).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, `select public.set_shirt_fulfillment(array['${ids.o1}']::uuid[], 'pronto')`)).rejects.toThrow(/permission denied/);
  });

  it("service_role lê tudo", async () => {
    expect((await as<{ n: number }>("service_role", null, "select count(*)::int as n from public.shirt_orders"))[0].n).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Modo de venda, cupons, tamanhos desabilitados e administração (opção 3)
// ---------------------------------------------------------------------------
describe("valor final do cupom", () => {
  const final = async (kind: string, value: number, list: number) =>
    (await q<{ f: number }>("select public.shirt_coupon_final_cents($1::public.shirt_coupon_kind, $2, $3) as f", [kind, value, list]))[0].f;

  it("percentual, desconto em reais e valor final fixo", async () => {
    expect(await final("percent", 10, 8000)).toBe(7200);
    expect(await final("amount", 500, 8000)).toBe(7500);
    expect(await final("final", 100, 16000)).toBe(100);
  });

  it("nunca fica abaixo de R$ 1,00 nem acima do preço", async () => {
    expect(await final("amount", 99999, 8000)).toBe(100);
    expect(await final("percent", 99, 100)).toBe(100);
    expect(await final("final", 20000, 8000)).toBe(8000);
  });
});

describe("modo de venda e cupons", () => {
  const slug = "camisa-hibrido-games";
  const mode = (m: string) => db.exec(`update public.shirt_products set sales_mode = '${m}', batch_limit = 100`);
  const order = (size: string, qty: number, coupon: string | null) =>
    q<{ order_id: string; subtotal_cents: number }>("select * from public.create_shirt_order($1,$2,$3,$4,$5,$6,$7,$8)", [slug, ...buyer, size, qty, coupon]);
  const orderRow = async (id: string) => (await q<Record<string, unknown>>("select * from public.shirt_orders where id = $1", [id]))[0];
  const ids2: Record<string, string> = {};

  beforeAll(async () => {
    await db.exec(`
      insert into public.shirt_coupons (code, kind, value, max_uses, is_test, campaign) values
        ('TESTE-R1', 'final', 100, 2, true, 'Teste de pagamento'),
        ('CAMPANHA10', 'percent', 10, 50, false, 'Instagram');
      insert into public.shirt_coupons (code, kind, value, valid_until) values ('EXPIRADO', 'amount', 500, now() - interval '1 day');
      insert into public.shirt_coupons (code, kind, value, active) values ('DESATIVADO', 'percent', 5, false);
    `);
  });

  it("fechada recusa a encomenda até com cupom válido", async () => {
    await mode("fechada");
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',1,'TESTE-R1')", "unavailable");
  });

  it("somente com cupom exige um cupom válido", async () => {
    await mode("cupom");
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',1)", "coupon_required");
    for (const code of ["NAOEXISTE", "EXPIRADO", "DESATIVADO"]) {
      await failsWith(`select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',1,'${code}')`, "coupon_invalid");
    }
  });

  it("aplica o desconto no servidor e grava o cupom na encomenda", async () => {
    const [o] = await order("M", 1, " campanha10 ");
    ids2.camp = o.order_id;
    expect(o.subtotal_cents).toBe(7200);
    expect(await orderRow(o.order_id)).toMatchObject({ coupon_code: "CAMPANHA10", discount_cents: 800, total_cents: 7200, is_test: false });
  });

  it("cupom de teste: valor final R$ 1,00 e encomenda marcada como teste", async () => {
    const [o] = await order("M", 2, "TESTE-R1");
    ids2.test1 = o.order_id;
    expect(o.subtotal_cents).toBe(100);
    expect(await orderRow(o.order_id)).toMatchObject({ is_test: true, discount_cents: 15900, unit_price_cents: 8000 });
  });

  it("limite de usos conta reservas válidas", async () => {
    ids2.test2 = (await order("G", 1, "TESTE-R1"))[0].order_id;
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',1,'TESTE-R1')", "coupon_invalid");
    await failsWith("select public.validate_shirt_coupon('camisa-hibrido-games','TESTE-R1',1)", "coupon_invalid");
  });

  it("validate_shirt_coupon calcula o desconto para o botão Aplicar", async () => {
    const [{ v }] = await q<{ v: Record<string, unknown> }>("select public.validate_shirt_coupon($1, $2, $3) as v", [slug, "campanha10", 2]);
    expect(v).toMatchObject({ code: "CAMPANHA10", is_test: false, list_cents: 16000, final_cents: 14400, discount_cents: 1600 });
  });

  it("aberta aceita compra sem cupom e com cupom", async () => {
    await mode("aberta");
    const [plain] = await order("P", 1, null);
    expect(plain.subtotal_cents).toBe(8000);
    expect(await orderRow(plain.order_id)).toMatchObject({ coupon_code: null, discount_cents: 0, is_test: false });
  });

  it("encomenda de teste confirmada não entra em receita, lote nem relatórios, mas conta no uso do cupom", async () => {
    const before = (await q<Record<string, string | number>>("select * from public.v_shirt_finance_summary"))[0];
    expect(await apply(ids2.test1, "mpt1", "approved", 100, 5, 95)).toBe("pago");
    const after = (await q<Record<string, string | number>>("select * from public.v_shirt_finance_summary"))[0];
    expect(Number(after.paid_orders)).toBe(Number(before.paid_orders));
    expect(Number(after.gross_cents)).toBe(Number(before.gross_cents));
    expect(await q("select 1 from public.v_shirt_sales_daily where gross_cents = 100")).toHaveLength(0);

    const [cp] = await q<Record<string, string | number>>("select * from public.v_shirt_coupons where code = 'TESTE-R1'");
    expect([Number(cp.paid_uses), Number(cp.pending_uses), Number(cp.revenue_cents), Number(cp.discount_given_cents)]).toEqual([1, 1, 100, 15900]);
  });

  it("teste não é barrado pelo limite do lote e a encomenda comum é", async () => {
    await db.exec("update public.shirt_products set batch_limit = 1");
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','M',1)", "sold_out");
    await db.exec("insert into public.shirt_coupons (code, kind, value, max_uses, is_test) values ('TESTE-R2', 'final', 100, 1, true)");
    const [o] = await order("M", 1, "TESTE-R2");
    expect(o.subtotal_cents).toBe(100);
    await db.exec("update public.shirt_products set batch_limit = 100");
  });

  it("cupom aplicado à encomenda sem pagamento aprovado cobre ao menos o valor com desconto", async () => {
    // Pagamento aprovado abaixo do subtotal com desconto continua sem confirmar a encomenda.
    expect(await apply(ids2.camp, "mpc1", "approved", 7000, 0, 7000)).toBe("pendente");
    expect(await apply(ids2.camp, "mpc1", "approved", 7200, 0, 7200)).toBe("pago");
  });
});

describe("tamanhos, modo e configurações pelo admin", () => {
  const slug = "camisa-hibrido-games";
  let admin: string;
  let staff: string;
  const as = async (uid: string) => db.exec(`set app.uid = '${uid}'`);
  const rpc = (sql: string, params?: unknown[]) => q(sql, params);

  beforeAll(async () => {
    [{ user_id: admin }] = await q<{ user_id: string }>("select user_id from public.profiles where role = 'admin'");
    [{ user_id: staff }] = await q<{ user_id: string }>("select user_id from public.profiles where role = 'staff'");
    await db.exec("update public.shirt_products set sales_mode = 'aberta', batch_limit = 100");
  });

  it("só admin ativo muda modo, tamanhos e configurações", async () => {
    await as(staff);
    await failsWith(`select public.set_shirt_sales_mode('${slug}', 'fechada')`, "not_authorized");
    await failsWith(`select public.set_shirt_size_enabled('${slug}', 'G', false)`, "not_authorized");
    await failsWith(`select public.update_shirt_settings('${slug}', '{"price_cents": 9000}')`, "not_authorized");
    await failsWith(`select public.mark_shirt_test_step('${slug}', 'checked')`, "not_authorized");
    await as("");
    await failsWith(`select public.set_shirt_sales_mode('${slug}', 'fechada')`, "not_authorized");
  });

  it("tamanho desabilitado bloqueia novas compras e pode voltar", async () => {
    await as(admin);
    expect((await rpc(`select public.set_shirt_size_enabled('${slug}', 'G', false) as d`))[0]).toEqual({ d: ["G"] });
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','G',1)", "size_unavailable");
    await failsWith("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','XX',1)", "invalid_size");
    await failsWith(`select public.set_shirt_size_enabled('${slug}', 'XX', false)`, "invalid_size");
    await rpc(`select public.set_shirt_size_enabled('${slug}', 'G', true)`);
    const [ok] = await q<{ order_id: string }>("select * from public.create_shirt_order('camisa-hibrido-games','Ana Souza','a@e.com','1','2','G',1)");
    expect(ok.order_id).toBeTruthy();
  });

  it("não deixa a venda aberta sem nenhum tamanho habilitado", async () => {
    await rpc(`select public.set_shirt_size_enabled('${slug}', 'P', false)`);
    await rpc(`select public.set_shirt_size_enabled('${slug}', 'M', false)`);
    await failsWith(`select public.set_shirt_size_enabled('${slug}', 'G', false)`, "incomplete");
    expect((await q<{ d: string[] }>("select disabled_sizes as d from public.shirt_products"))[0].d.sort()).toEqual(["M", "P"]);
    await rpc(`select public.set_shirt_size_enabled('${slug}', 'P', true)`);
    await rpc(`select public.set_shirt_size_enabled('${slug}', 'M', true)`);
  });

  it("abre ou restringe a venda só com todas as condições definidas", async () => {
    await db.exec("update public.shirt_products set size_guide = null, sales_mode = 'fechada'");
    await failsWith(`select public.set_shirt_sales_mode('${slug}', 'cupom')`, "incomplete");
    await failsWith(`select public.set_shirt_sales_mode('${slug}', 'aberta')`, "incomplete");
    expect((await rpc(`select public.set_shirt_sales_mode('${slug}', 'fechada') as m`))[0]).toEqual({ m: "fechada" });
    await db.exec("update public.shirt_products set size_guide = 'tabela'");
    expect((await rpc(`select public.set_shirt_sales_mode('${slug}', 'cupom') as m`))[0]).toEqual({ m: "cupom" });
    expect((await rpc(`select public.set_shirt_sales_mode('${slug}', 'aberta') as m`))[0]).toEqual({ m: "aberta" });
  });

  it("atualiza as configurações e desfaz tudo se deixaria a venda aberta incompleta", async () => {
    await rpc(`select public.update_shirt_settings('${slug}', $1::jsonb)`, [JSON.stringify({ price_cents: 9000, max_per_order: 3, composition: "  Algodão  ", fit: "" })]);
    const [p] = await q<Record<string, unknown>>("select price_cents, max_per_order, composition, fit from public.shirt_products");
    expect(p).toEqual({ price_cents: 9000, max_per_order: 3, composition: "Algodão", fit: null });

    await failsWith(`select public.update_shirt_settings('${slug}', '{"purchase_policy": null, "price_cents": 1234}')`, "incomplete");
    const [after] = await q<Record<string, unknown>>("select price_cents, purchase_policy from public.shirt_products");
    expect(after).toEqual({ price_cents: 9000, purchase_policy: "sem troca" });
  });

  it("valida a grade: repetidos, vazios e tamanho que já tem encomenda", async () => {
    await failsWith(`select public.update_shirt_settings('${slug}', '{"sizes": ["P","P"]}')`, "invalid_sizes");
    await failsWith(`select public.update_shirt_settings('${slug}', '{"sizes": ["P",""]}')`, "invalid_sizes");
    await failsWith(`select public.update_shirt_settings('${slug}', '{"sizes": ["M","G"]}')`, "size_in_use:P");
    await rpc(`select public.update_shirt_settings('${slug}', '{"sizes": ["P","M","G","GG"]}')`);
    expect((await q<{ s: string[] }>("select sizes as s from public.shirt_products"))[0].s).toEqual(["P", "M", "G", "GG"]);
  });

  it("tamanho desabilitado que sai da grade deixa de constar como desabilitado", async () => {
    await rpc(`select public.set_shirt_size_enabled('${slug}', 'GG', false)`);
    await rpc(`select public.update_shirt_settings('${slug}', '{"sizes": ["P","M","G"]}')`);
    expect((await q<{ d: string[] }>("select disabled_sizes as d from public.shirt_products"))[0].d).toEqual([]);
  });

  it("marcas do roteiro de teste: conferir, estornos e recomeçar", async () => {
    await rpc(`select public.mark_shirt_test_step('${slug}', 'checked')`);
    await rpc(`select public.mark_shirt_test_step('${slug}', 'refunds')`);
    const [done] = await q<{ a: string | null; b: string | null }>("select test_checked_at as a, test_refunds_done_at as b from public.shirt_products");
    expect(done.a).toBeTruthy();
    expect(done.b).toBeTruthy();
    await rpc(`select public.mark_shirt_test_step('${slug}', 'reset')`);
    const [reset] = await q<{ a: string | null; b: string | null }>("select test_checked_at as a, test_refunds_done_at as b from public.shirt_products");
    expect(reset).toEqual({ a: null, b: null });
    await failsWith(`select public.mark_shirt_test_step('${slug}', 'outro')`, "invalid_step");
  });

  it("cupons: só admin lê e grava, ninguém apaga, vitrine não lê", async () => {
    const asRole = async <T>(role: string, uid: string | null, sql: string) => {
      await db.exec(`set role ${role}; set app.uid = '${uid ?? ""}'`);
      try {
        return await q<T>(sql);
      } finally {
        await db.exec("reset role");
      }
    };
    await expect(asRole("anon", null, "select count(*) from public.shirt_coupons")).rejects.toThrow(/permission denied/);
    expect((await asRole<{ n: number }>("authenticated", staff, "select count(*)::int as n from public.shirt_coupons"))[0].n).toBe(0);
    expect((await asRole<{ n: number }>("authenticated", admin, "select count(*)::int as n from public.shirt_coupons"))[0].n).toBeGreaterThan(0);

    await expect(asRole("authenticated", staff, "insert into public.shirt_coupons (code, kind, value) values ('STAFF1', 'percent', 5)")).rejects.toThrow(/row-level security/);
    await asRole("authenticated", admin, "insert into public.shirt_coupons (code, kind, value) values ('ADMIN1', 'percent', 5)");
    await asRole("authenticated", admin, "update public.shirt_coupons set active = false where code = 'ADMIN1'");
    expect((await q<{ a: boolean }>("select active as a from public.shirt_coupons where code = 'ADMIN1'"))[0].a).toBe(false);
    await expect(asRole("authenticated", admin, "delete from public.shirt_coupons where code = 'ADMIN1'")).rejects.toThrow(/permission denied/);

    await expect(asRole("authenticated", admin, "select public.validate_shirt_coupon('camisa-hibrido-games','CAMPANHA10',1)")).rejects.toThrow(/permission denied/);
    expect((await asRole<{ n: number }>("authenticated", admin, "select count(*)::int as n from public.v_shirt_coupons"))[0].n).toBeGreaterThan(0);
    await expect(asRole("anon", null, "select count(*) from public.v_shirt_coupons")).rejects.toThrow(/permission denied/);
  });

  it("encomenda de teste paga não avança na produção", async () => {
    const [{ id }] = await q<{ id: string }>("select id from public.shirt_orders where is_test and status = 'pago' limit 1");
    await as(admin);
    expect((await q<{ n: number }>("select public.set_shirt_fulfillment($1::uuid[], 'em_producao', true) as n", [[id]]))[0].n).toBe(0);
    expect((await q<{ f: string }>("select fulfillment_status as f from public.shirt_orders where id = $1", [id]))[0].f).toBe("aguardando_producao");
  });

  it("regras do cupom na tabela: código maiúsculo e válido, valor dentro do tipo", async () => {
    await db.exec("reset role");
    await failsWith("insert into public.shirt_coupons (code, kind, value) values ('minusculo', 'percent', 5)", "shirt_coupons_code_format");
    await failsWith("insert into public.shirt_coupons (code, kind, value) values ('AB', 'percent', 5)", "shirt_coupons_code_format");
    await failsWith("insert into public.shirt_coupons (code, kind, value) values ('PCT101', 'percent', 101)", "shirt_coupons_value");
    await failsWith("insert into public.shirt_coupons (code, kind, value) values ('PCT100', 'percent', 100)", "shirt_coupons_free_needs_limit");
    await failsWith("insert into public.shirt_coupons (code, kind, value) values ('FINAL50', 'final', 50)", "shirt_coupons_value");
    await failsWith("insert into public.shirt_coupons (code, kind, value) values ('CAMPANHA10', 'percent', 5)", "duplicate key");
  });
});

// ---------------------------------------------------------------------------
// Módulos de Cupons e Configurações (opção 2): limite por CPF, limite por tamanho e histórico
// ---------------------------------------------------------------------------
describe("limites por comprador e por tamanho, e histórico", () => {
  const slug = "camisa-hibrido-games";
  let admin: string;
  let staff: string;
  const as = (uid: string) => db.exec(`set app.uid = '${uid}'`);
  const create = (cpf: string, size: string, qty: number, coupon: string | null) =>
    q<{ order_id: string }>("select * from public.create_shirt_order($1,$2,$3,$4,$5,$6,$7,$8)", [slug, "Ana Souza", "a@e.com", cpf, "83999990000", size, qty, coupon]);
  const failsOrder = (cpf: string, size: string, qty: number, coupon: string | null, message: string) =>
    expect(create(cpf, size, qty, coupon)).rejects.toThrow(message);
  const audit = async (limit = 20) => q<{ kind: string; detail: Record<string, unknown>; actor_name: string | null }>("select kind, detail, actor_name from public.shirt_audit_log order by id desc limit $1", [limit]);

  beforeAll(async () => {
    [{ user_id: admin }] = await q<{ user_id: string }>("select user_id from public.profiles where role = 'admin'");
    [{ user_id: staff }] = await q<{ user_id: string }>("select user_id from public.profiles where role = 'staff'");
    await db.exec("reset role");
    await db.exec("update public.shirt_products set sales_mode = 'aberta', batch_limit = 1000, max_per_order = 3");
    await as(admin);
    await q(`select public.update_shirt_settings('${slug}', '{"sizes": ["P","M","G","GG"]}')`);
  });

  it("limite de uso do cupom por CPF", async () => {
    await db.exec("insert into public.shirt_coupons (code, kind, value, max_per_buyer) values ('UMPORCPF', 'percent', 10, 1), ('DOISPORCPF', 'percent', 10, 2)");
    await create("11111111111", "M", 1, "UMPORCPF");
    await failsOrder("11111111111", "M", 1, "UMPORCPF", "coupon_buyer_limit");
    await create("22222222222", "M", 1, "UMPORCPF");
    await create("33333333333", "M", 1, "DOISPORCPF");
    await create("33333333333", "M", 1, "DOISPORCPF");
    await failsOrder("33333333333", "M", 1, "DOISPORCPF", "coupon_buyer_limit");
  });

  it("limite do CPF libera de novo quando a reserva vence", async () => {
    await db.exec("update public.shirt_orders set expires_at = now() - interval '1 minute' where buyer_cpf = '11111111111' and status = 'pendente'");
    expect((await create("11111111111", "M", 1, "UMPORCPF"))[0].order_id).toBeTruthy();
  });

  it("limite por tamanho conta pagas e reservas e barra a compra comum", async () => {
    await as(admin);
    await q(`select public.update_shirt_size_settings('${slug}', '{"GG": "2"}', '{}')`);
    await create("44444444444", "GG", 1, null);
    await create("44444444444", "GG", 1, null);
    await failsOrder("44444444444", "GG", 1, null, "size_sold_out");
    expect((await q<{ l: Record<string, number> }>("select size_limits as l from public.shirt_products"))[0].l).toEqual({ GG: 2 });
  });

  it("cupom de teste não é barrado pelo limite do tamanho", async () => {
    await db.exec("insert into public.shirt_coupons (code, kind, value, max_uses, is_test) values ('TESTE-GG', 'final', 100, 1, true)");
    expect((await create("55555555555", "GG", 1, "TESTE-GG"))[0].order_id).toBeTruthy();
  });

  it("valida limites e mensagens por tamanho", async () => {
    await as(admin);
    await failsWith(`select public.update_shirt_size_settings('${slug}', '{"XX": "2"}', '{}')`, "invalid_limits");
    await failsWith(`select public.update_shirt_size_settings('${slug}', '{"GG": "0"}', '{}')`, "invalid_limits");
    await failsWith(`select public.update_shirt_size_settings('${slug}', '{"GG": "abc"}', '{}')`, "invalid_limits");
    await failsWith(`select public.update_shirt_size_settings('${slug}', '{}', '{"XX": "oi"}')`, "invalid_messages");
    await failsWith(`select public.update_shirt_size_settings('${slug}', '[]', '{}')`, "invalid_limits");
    await as(staff);
    await failsWith(`select public.update_shirt_size_settings('${slug}', '{}', '{}')`, "not_authorized");
  });

  it("campo vazio remove o limite e a mensagem; grade que muda limpa os tamanhos que saíram", async () => {
    await as(admin);
    await q(`select public.update_shirt_settings('${slug}', '{"sizes": ["P","M","G","GG","XG"]}')`);
    await q(`select public.update_shirt_size_settings('${slug}', '{"GG": "2", "XG": "5", "G": ""}', '{"XG": " Sob consulta ", "P": ""}')`);
    const [p] = await q<{ l: Record<string, number>; m: Record<string, string> }>("select size_limits as l, size_messages as m from public.shirt_products");
    expect(p.l).toEqual({ GG: 2, XG: 5 });
    expect(p.m).toEqual({ XG: "Sob consulta" });

    await q(`select public.update_shirt_settings('${slug}', '{"sizes": ["P","M","G","GG"]}')`);
    const [after] = await q<{ l: Record<string, number>; m: Record<string, string> }>("select size_limits as l, size_messages as m from public.shirt_products");
    expect(after.l).toEqual({ GG: 2 });
    expect(after.m).toEqual({});
  });

  it("registra no histórico o modo, os tamanhos, as configurações e os cupons, com quem fez", async () => {
    await as(admin);
    await q(`select public.set_shirt_sales_mode('${slug}', 'cupom')`);
    await q(`select public.set_shirt_sales_mode('${slug}', 'aberta')`);
    await q(`select public.set_shirt_size_enabled('${slug}', 'M', false)`);
    await q(`select public.set_shirt_size_enabled('${slug}', 'M', true)`);
    await q(`select public.update_shirt_settings('${slug}', '{"price_cents": 9500, "purchase_policy": "Nova política"}')`);
    await db.exec("insert into public.shirt_coupons (code, kind, value) values ('AUDITADO', 'amount', 500)");
    await db.exec("update public.shirt_coupons set active = false where code = 'AUDITADO'");
    await db.exec("update public.shirt_coupons set max_uses = 9 where code = 'AUDITADO'");

    const log = await audit(12);
    const kinds = log.map((l) => l.kind);
    expect(kinds).toEqual(expect.arrayContaining(["mode", "size_disabled", "size_enabled", "setting", "coupon_created", "coupon_disabled", "coupon_updated"]));
    expect(log.find((l) => l.kind === "mode")).toMatchObject({ detail: { from: "cupom", to: "aberta" }, actor_name: "Adm" });
    expect(log.find((l) => l.kind === "size_disabled")).toMatchObject({ detail: { size: "M" } });
    expect(log.some((l) => l.kind === "setting" && l.detail.field === "price" && l.detail.from === 9000 && l.detail.to === 9500)).toBe(true);
    expect(log.some((l) => l.kind === "setting" && l.detail.field === "policy")).toBe(true);
    expect(log.find((l) => l.kind === "coupon_created")).toMatchObject({ detail: { code: "AUDITADO", kind: "amount", value: 500 } });
  });

  it("alteração feita fora de uma sessão (linha de comando) fica sem autor", async () => {
    await as("");
    await db.exec("update public.shirt_products set fit = 'Regular'");
    const [last] = await audit(1);
    expect(last).toMatchObject({ kind: "setting", detail: { field: "fit" }, actor_name: null });
  });

  it("tamanho que sai da grade não aparece como habilitado", async () => {
    await as(admin);
    await q(`select public.set_shirt_size_enabled('${slug}', 'GG', false)`);
    await db.exec("reset role");
    const before = (await audit(100)).filter((l) => l.kind === "size_enabled").length;
    await db.exec("update public.shirt_products set sizes = array_remove(sizes, 'XG'), disabled_sizes = array_remove(disabled_sizes, 'XG')");
    expect((await audit(100)).filter((l) => l.kind === "size_enabled").length).toBe(before);
    await q(`select public.set_shirt_size_enabled('${slug}', 'GG', true)`);
  });

  it("histórico: só admin lê e ninguém grava direto", async () => {
    const asRole = async <T>(role: string, uid: string | null, sql: string) => {
      await db.exec(`set role ${role}; set app.uid = '${uid ?? ""}'`);
      try {
        return await q<T>(sql);
      } finally {
        await db.exec("reset role");
      }
    };
    await expect(asRole("anon", null, "select count(*) from public.shirt_audit_log")).rejects.toThrow(/permission denied/);
    expect((await asRole<{ n: number }>("authenticated", staff, "select count(*)::int as n from public.shirt_audit_log"))[0].n).toBe(0);
    expect((await asRole<{ n: number }>("authenticated", admin, "select count(*)::int as n from public.shirt_audit_log"))[0].n).toBeGreaterThan(5);
    await expect(asRole("authenticated", admin, "insert into public.shirt_audit_log (kind) values ('falso')")).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", admin, "select public.shirt_audit('x', '{}')")).rejects.toThrow(/permission denied/);
  });

  it("a visão de cupons traz o limite por comprador", async () => {
    const [c] = await q<{ m: number | null }>("select max_per_buyer as m from public.v_shirt_coupons where code = 'UMPORCPF'");
    expect(c.m).toBe(1);
  });
});

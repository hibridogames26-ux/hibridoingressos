import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COUPON_INVALID_MESSAGE,
  couponDescription,
  couponStatus,
  couponUsesText,
  isFreeCoupon,
  parseCouponForm,
  toBrasiliaLocalInput,
  toCouponRow,
} from "../lib/shirt-coupons";

/**
 * Uso do cupom HIBRIDOPARCEIRO (percentual de 100%, 10 usos, 1 por CPF, com prazo) do começo ao fim, exercitando o
 * código real: formulário do admin → RLS → botão Aplicar (`previewCoupon` → `quoteCoupon`) → checkout (`createShirtOrder`)
 * → funções do banco, todas as migrations reais num Postgres em memória (PGlite), chamadas como `service_role`
 * (o papel que o servidor usa). Só o e-mail e o redirect do Next são simulados.
 */
vi.mock("server-only", () => ({}));

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

const sendShirtEmailOnce = vi.fn();
vi.mock("@/lib/shirt-order-service", () => ({ sendShirtEmailOnce }));

// `createAdminClient().rpc(...)` vira uma chamada SQL ao PGlite com o papel service_role.
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ rpc: (name: string, args: Record<string, unknown>) => adminRpc(name, args) }),
}));

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
const CODE = "HIBRIDOPARCEIRO";
const PRICE = 11000;
const DAY = 24 * 3600 * 1000;

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
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;

/** Imita `supabase.rpc()`: aguardável (data/error) e com `.single()`, executando como service_role. */
function adminRpc(name: string, args: Record<string, unknown>) {
  const keys = Object.keys(args);
  const run = async () => {
    await db.exec("set role service_role");
    try {
      const { rows } = await db.query<Record<string, unknown>>(
        `select * from public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`,
        keys.map((k) => args[k]),
      );
      return { rows, error: null };
    } catch (e) {
      return { rows: null, error: { message: (e as Error).message } };
    } finally {
      await db.exec("reset role");
    }
  };
  return {
    // Função escalar (jsonb) devolve o valor; função de tabela devolve as linhas.
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      run()
        .then(({ rows, error }) => ({
          data: rows && rows.length === 1 && name in rows[0] ? rows[0][name] : rows,
          error,
        }))
        .then(resolve, reject),
    single: async () => {
      const { rows, error } = await run();
      return { data: rows?.[0] ?? null, error };
    },
  };
}

/** Executa como um papel do Supabase (RLS e permissões valem). */
async function asRole<T>(role: "anon" | "authenticated", uid: string | null, sql: string, params?: unknown[]) {
  await db.exec(`set role ${role}; set app.uid = '${uid ?? ""}'`);
  try {
    return await q<T>(sql, params);
  } finally {
    await db.exec("reset role; set app.uid = ''");
  }
}

/** CPF válido a partir de um número de série (dígitos verificadores calculados). */
function cpf(seed: number) {
  const digits = String(100000000 + seed).split("").map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join("");
}

const { createShirtOrder, previewCoupon } = await import("@/app/loja/camisa-hibrido-games/checkout/actions");

const form = (over: Record<string, string> = {}) => {
  const data = new FormData();
  const values: Record<string, string> = {
    tamanho: "G",
    qtd: "1",
    cupom: "hibridoparceiro",
    name: "Parceiro Híbrido",
    email: "parceiro@example.com",
    cpf: cpf(1),
    phone: "(83) 99999-0000",
    aceite: "on",
    ...over,
  };
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

/** Devolve o redirect (sucesso) ou o estado de erro da Server Action. */
const submit = async (data: FormData) => {
  try {
    return await createShirtOrder(undefined, data);
  } catch (e) {
    if (e instanceof Redirect) return e;
    throw e;
  }
};

const ordersWithCoupon = () => q<Record<string, unknown>>("select * from public.shirt_orders where coupon_code = $1 order by created_at", [CODE]);
const couponRow = async () => toCouponRow((await asRole<Record<string, unknown>>("authenticated", admin, "select * from public.v_shirt_coupons where code = $1", [CODE]))[0]);
const setCoupon = (set: string, params: unknown[] = []) => asRole("authenticated", admin, `update public.shirt_coupons set ${set} where code = '${CODE}'`, params);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(INFRA);
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8").replace(/create extension if not exists pgcrypto[^;]*;/i, ""));
  }
  [{ id: admin }] = await q<{ id: string }>("insert into auth.users default values returning id");
  await db.exec(`insert into public.profiles (user_id, name, email, role) values ('${admin}','Adm','adm@e.com','admin')`);
  // Mesma configuração comercial do produto em produção (R$ 110,00, P a GG, lote de 100, até 10 por encomenda).
  await db.exec(`update public.shirt_products set price_cents = ${PRICE}, sizes = '{P,M,G,GG}', disabled_sizes = '{}', size_guide = 'tabela',
    production_lead_time = '30 dias', receipt_details = 'retirada', purchase_policy = 'sem troca',
    sales_end = now() + interval '20 days', batch_limit = 100, max_per_order = 10, sales_mode = 'aberta'`);
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(() => {
  sendShirtEmailOnce.mockReset();
});

describe("cupom HIBRIDOPARCEIRO (100%) — uso pelo código", () => {
  it("1. o admin cadastra o cupom como no painel (formulário → RLS), com o código normalizado", async () => {
    const now = Date.now();
    const parsed = parseCouponForm({
      code: "hibridoparceiro",
      kind: "percent",
      value: "100",
      maxUses: "10",
      maxPerBuyer: "1",
      validFrom: toBrasiliaLocalInput(new Date(now - DAY).toISOString()),
      validUntil: toBrasiliaLocalInput(new Date(now + 15 * DAY).toISOString()),
      campaign: "hibridoparceiro",
    });
    if (!parsed.ok) throw new Error(parsed.message);
    const c = parsed.coupon;
    expect(c).toMatchObject({ code: CODE, kind: "percent", value: 100, max_uses: 10, max_per_buyer: 1, is_test: false });
    expect(isFreeCoupon(c.kind, c.value)).toBe(true);

    const [row] = await asRole<{ code: string }>(
      "authenticated",
      admin,
      `insert into public.shirt_coupons (code, kind, value, max_uses, valid_from, valid_until, campaign, is_test, max_per_buyer)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning code`,
      [c.code, c.kind, c.value, c.max_uses, c.valid_from, c.valid_until, c.campaign, c.is_test, c.max_per_buyer],
    );
    expect(row.code).toBe(CODE);
    expect(couponStatus(await couponRow())).toBe("ativo");
  });

  it("2. botão Aplicar: total zero, sem pagamento, aceitando caixa e espaços", async () => {
    expect(await previewCoupon("hibridoparceiro", 1)).toEqual({
      ok: true,
      coupon: { code: CODE, description: "100% de desconto (sem pagamento)", discountCents: PRICE, finalCents: 0, isTest: false },
    });
    expect(await previewCoupon("  HibridoParceiro ", 3)).toMatchObject({ ok: true, coupon: { finalCents: 0, discountCents: 3 * PRICE } });
    expect(await previewCoupon("hibridoparceiro2", 1)).toEqual({ ok: false, message: COUPON_INVALID_MESSAGE });
    expect(await previewCoupon("", 1)).toEqual({ ok: false, message: "Digite o código do cupom." });
  });

  it("3. checkout: a encomenda nasce paga (R$ 0,00), sem Mercado Pago, e o e-mail de confirmação sai uma vez", async () => {
    const result = await submit(form());

    expect(result).toBeInstanceOf(Redirect);
    const [order] = await ordersWithCoupon();
    expect(order).toMatchObject({
      status: "pago",
      size: "G",
      quantity: 1,
      unit_price_cents: PRICE,
      subtotal_cents: 0,
      total_cents: 0,
      discount_cents: PRICE,
      fee_cents: 0,
      net_cents: 0,
      payment_method: null,
      mp_payment_id: null,
      expires_at: null,
      coupon_code: CODE,
      fulfillment_status: "aguardando_producao",
      is_test: false,
      buyer_cpf: cpf(1),
      buyer_email: "parceiro@example.com",
    });
    expect(order.paid_at).toBeTruthy();
    expect(String(order.access_key)).toHaveLength(64);

    // Vai direto para a página do pedido, com a chave secreta do link.
    expect((result as Redirect).url).toBe(`/loja/pedido/${order.id}?k=${order.access_key}`);
    expect(sendShirtEmailOnce).toHaveBeenCalledTimes(1);
    expect(sendShirtEmailOnce).toHaveBeenCalledWith(order.id);
  });

  it("4. o painel de cupons mostra 1 uso pago, desconto concedido e receita zero", async () => {
    const row = await couponRow();
    expect(row).toMatchObject({ paid_uses: 1, pending_uses: 0, discount_given_cents: PRICE, revenue_cents: 0 });
    expect(couponUsesText(row)).toBe("1 / 10");
    expect(couponDescription(row)).toBe("100% de desconto (sem pagamento)");
    expect(couponStatus(row)).toBe("ativo");

    const [summary] = await asRole<Record<string, unknown>>("authenticated", admin, "select * from public.v_shirt_finance_summary");
    expect(Number(summary.paid_orders)).toBe(1);
    expect(Number(summary.gross_cents)).toBe(0);
    expect(Number(summary.pending_orders)).toBe(0);
  });

  it("5. o mesmo CPF não usa o cupom de novo (1 por CPF): erro claro, nada criado, nenhum e-mail", async () => {
    const result = await submit(form({ tamanho: "M" }));

    expect(result).toMatchObject({ error: "Este cupom já foi usado por este CPF." });
    expect(await ordersWithCoupon()).toHaveLength(1);
    expect(sendShirtEmailOnce).not.toHaveBeenCalled();
    // O CPF digitado com pontuação é o mesmo CPF.
    const formatted = cpf(1).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    expect(await submit(form({ cpf: formatted }))).toMatchObject({ error: "Este cupom já foi usado por este CPF." });
  });

  it("6. o limite de usos conta encomendas, não camisas: 1 uso leva até 10 camisas de graça", async () => {
    const result = await submit(form({ cpf: cpf(2), qtd: "10", tamanho: "M" }));

    expect(result).toBeInstanceOf(Redirect);
    const orders = await ordersWithCoupon();
    expect(orders).toHaveLength(2);
    expect(orders[1]).toMatchObject({ status: "pago", quantity: 10, subtotal_cents: 0, total_cents: 0, discount_cents: 10 * PRICE });
    expect((await couponRow()).paid_uses).toBe(2);
    expect(sendShirtEmailOnce).toHaveBeenCalledTimes(1);
  });

  it("7. quantidade acima do máximo por encomenda é barrada, mesmo com o cupom", async () => {
    const result = await submit(form({ cpf: cpf(3), qtd: "11" }));
    expect(result).toMatchObject({ error: "Quantidade inválida. Volte e escolha novamente." });
    expect(await ordersWithCoupon()).toHaveLength(2);
  });

  it("8. esgota no 10º uso: o 11º comprador e o botão Aplicar recebem cupom inválido", async () => {
    for (let n = 3; n <= 10; n++) {
      expect(await submit(form({ cpf: cpf(n), email: `parceiro${n}@example.com` })), `uso ${n}`).toBeInstanceOf(Redirect);
    }
    const row = await couponRow();
    // 10 encomendas: 1 + 10 + 8 camisas, todas com 100% de desconto.
    expect(row).toMatchObject({ paid_uses: 10, pending_uses: 0, discount_given_cents: 19 * PRICE, revenue_cents: 0 });
    expect(couponStatus(row)).toBe("esgotado");
    expect(couponUsesText(row)).toBe("10 / 10");
    expect(sendShirtEmailOnce).toHaveBeenCalledTimes(8);

    sendShirtEmailOnce.mockClear();
    expect(await submit(form({ cpf: cpf(11) }))).toMatchObject({ error: COUPON_INVALID_MESSAGE });
    expect(await previewCoupon(CODE, 1)).toEqual({ ok: false, message: COUPON_INVALID_MESSAGE });
    expect(await ordersWithCoupon()).toHaveLength(10);
    expect(sendShirtEmailOnce).not.toHaveBeenCalled();
  });

  it("9. validade e ativação: vencido, agendado e desativado são barrados; ao corrigir, volta a valer", async () => {
    await setCoupon("max_uses = 20"); // reabre vagas para testar só as outras regras
    const tryBuy = (n: number) => submit(form({ cpf: cpf(n), email: `v${n}@example.com` }));

    await setCoupon("valid_until = now() - interval '1 minute'");
    expect(await tryBuy(20)).toMatchObject({ error: COUPON_INVALID_MESSAGE });
    expect(await previewCoupon(CODE, 1)).toMatchObject({ ok: false });
    expect(couponStatus(await couponRow())).toBe("encerrado");

    await setCoupon("valid_until = now() + interval '15 days', valid_from = now() + interval '1 hour'");
    expect(await tryBuy(20)).toMatchObject({ error: COUPON_INVALID_MESSAGE });
    expect(couponStatus(await couponRow())).toBe("agendado");

    await setCoupon("valid_from = now() - interval '1 day', active = false");
    expect(await tryBuy(20)).toMatchObject({ error: COUPON_INVALID_MESSAGE });
    expect(couponStatus(await couponRow())).toBe("desativado");

    await setCoupon("active = true");
    expect(await previewCoupon(CODE, 1)).toMatchObject({ ok: true, coupon: { finalCents: 0 } });
    expect(await tryBuy(20)).toBeInstanceOf(Redirect);
    expect(await ordersWithCoupon()).toHaveLength(11);
  });

  it("10. modo Somente com cupom: o HIBRIDOPARCEIRO libera a compra; sem cupom continua barrado", async () => {
    await db.exec("update public.shirt_products set sales_mode = 'cupom'");
    try {
      expect(await submit(form({ cpf: cpf(30), cupom: "" }))).toMatchObject({ error: "As encomendas estão abertas só para quem tem um cupom." });
      expect(await submit(form({ cpf: cpf(30) }))).toBeInstanceOf(Redirect);
    } finally {
      await db.exec("update public.shirt_products set sales_mode = 'aberta'");
    }
  });

  it("11. a encomenda gratuita ocupa o lote e o tamanho (não é encomenda de teste)", async () => {
    const [{ units }] = await q<{ units: number }>("select coalesce(sum(quantity), 0)::int as units from public.shirt_orders where status = 'pago' and not is_test");
    const bySize = await asRole<Record<string, unknown>>("authenticated", admin, "select * from public.v_shirt_sales_by_size");
    expect(bySize.reduce((n, r) => n + Number(r.paid_units), 0)).toBe(units);
    expect(units).toBe(1 + 10 + 8 + 1 + 1);

    // Com o lote cheio, nem o cupom de 100% fura o limite.
    await db.exec(`update public.shirt_products set batch_limit = ${units}`);
    try {
      expect(await submit(form({ cpf: cpf(40) }))).toMatchObject({ error: expect.stringContaining("esgotou") });
    } finally {
      await db.exec("update public.shirt_products set batch_limit = 100");
    }
  });
});

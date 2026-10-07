-- Camisa: modo de venda, cupons e tamanhos desabilitados (Story 3.1, opção 3).
-- Continua separado dos ingressos: nada aqui lê ou escreve orders, order_items, tickets ou ticket_types.
-- Idempotente: pode ser executada mais de uma vez.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shirt_sales_mode') then
    create type public.shirt_sales_mode as enum ('fechada', 'cupom', 'aberta');
  end if;
  if not exists (select 1 from pg_type where typname = 'shirt_coupon_kind') then
    create type public.shirt_coupon_kind as enum ('percent', 'amount', 'final');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Produto: modo de venda no lugar do interruptor, tamanhos desabilitados e
-- marcas do roteiro de teste de pagamento.
-- ---------------------------------------------------------------------------
alter table public.shirt_products
  add column if not exists sales_mode           public.shirt_sales_mode not null default 'fechada',
  add column if not exists disabled_sizes       text[] not null default '{}',
  add column if not exists test_checked_at      timestamptz,
  add column if not exists test_refunds_done_at timestamptz;

-- Quem tinha a venda ligada continua com a venda aberta.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'shirt_products' and column_name = 'sales_enabled'
  ) then
    update public.shirt_products set sales_mode = 'aberta' where sales_enabled and sales_mode = 'fechada';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shirt_products_disabled_sizes_in_grid') then
    alter table public.shirt_products
      add constraint shirt_products_disabled_sizes_in_grid check (disabled_sizes <@ sizes);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Cupons. A vitrine nunca lê esta tabela: o servidor confere o código por RPC.
-- percent: pontos percentuais (1..99); amount e final: centavos.
-- "final" é o valor total da encomenda, e nenhum cupom deixa o total abaixo de R$ 1,00.
-- ---------------------------------------------------------------------------
create table if not exists public.shirt_coupons (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  kind         public.shirt_coupon_kind not null,
  value        integer not null,
  max_uses     integer check (max_uses is null or max_uses > 0),
  valid_from   timestamptz,
  valid_until  timestamptz,
  active       boolean not null default true,
  -- Cupom de teste: libera a compra no modo "somente com cupom" e a encomenda fica fora de receita, lote e Excel.
  is_test      boolean not null default false,
  campaign     text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint shirt_coupons_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  constraint shirt_coupons_value check (
    (kind = 'percent' and value between 1 and 99)
    or (kind = 'amount' and value between 1 and 10000000)
    or (kind = 'final' and value between 100 and 10000000)
  ),
  constraint shirt_coupons_window check (valid_until is null or valid_from is null or valid_until > valid_from)
);
create unique index if not exists shirt_coupons_code_key on public.shirt_coupons (code);

drop trigger if exists shirt_coupons_touch on public.shirt_coupons;
create trigger shirt_coupons_touch before update on public.shirt_coupons
  for each row execute function public.touch_updated_at();

alter table public.shirt_coupons enable row level security;

drop policy if exists "admin lê cupons de camisa" on public.shirt_coupons;
create policy "admin lê cupons de camisa" on public.shirt_coupons
  for select to authenticated using (public.is_admin());

drop policy if exists "admin cria cupons de camisa" on public.shirt_coupons;
create policy "admin cria cupons de camisa" on public.shirt_coupons
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin edita cupons de camisa" on public.shirt_coupons;
create policy "admin edita cupons de camisa" on public.shirt_coupons
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.shirt_coupons from anon;
revoke delete on public.shirt_coupons from authenticated;

-- ---------------------------------------------------------------------------
-- Encomendas: cupom aplicado, desconto e marca de teste (snapshot da compra)
-- ---------------------------------------------------------------------------
alter table public.shirt_orders
  add column if not exists coupon_id      uuid references public.shirt_coupons (id),
  add column if not exists coupon_code    text,
  add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0),
  add column if not exists is_test        boolean not null default false;
create index if not exists shirt_orders_coupon_idx on public.shirt_orders (coupon_id) where coupon_id is not null;

-- ---------------------------------------------------------------------------
-- Condições comerciais que faltam (tamanhos: precisa sobrar ao menos um habilitado)
-- ---------------------------------------------------------------------------
create or replace function public.shirt_sales_gaps(p public.shirt_products)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    case when p.price_cents is null or p.price_cents < 1 then 'price' end,
    case when cardinality(array(select unnest(p.sizes) except select unnest(p.disabled_sizes))) = 0 then 'sizes' end,
    case when btrim(coalesce(p.size_guide, '')) = '' then 'size_guide' end,
    case when btrim(coalesce(p.production_lead_time, '')) = '' then 'lead_time' end,
    case when btrim(coalesce(p.receipt_details, '')) = '' then 'receipt' end,
    case when p.sales_end is null then 'window' end,
    case when p.batch_limit is null then 'batch_limit' end,
    case when p.max_per_order is null then 'max_per_order' end,
    case when btrim(coalesce(p.purchase_policy, '')) = '' then 'policy' end
  ], null);
$$;

-- ---------------------------------------------------------------------------
-- Valor final da encomenda com o cupom (espelha src/lib/shirt-coupons.ts)
-- ---------------------------------------------------------------------------
create or replace function public.shirt_coupon_final_cents(
  p_kind       public.shirt_coupon_kind,
  p_value      integer,
  p_list_cents integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(
    p_list_cents,
    greatest(
      100,
      case p_kind
        when 'percent' then p_list_cents - round(p_list_cents * p_value / 100.0)::integer
        when 'amount'  then p_list_cents - p_value
        else p_value
      end
    )
  )::integer;
$$;

-- Usos do cupom: encomendas pagas e reservas ainda válidas.
create or replace function public.shirt_coupon_uses(p_coupon_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.shirt_orders o
   where o.coupon_id = p_coupon_id
     and (o.status = 'pago'
          or (o.status = 'pendente'
              and (o.expires_at > now() or coalesce(o.mp_status, '') in ('in_process', 'authorized'))));
$$;

-- ---------------------------------------------------------------------------
-- Confere um cupom (botão Aplicar e link de acesso). Erro único 'coupon_invalid'
-- para código inexistente, desativado, fora da validade ou esgotado.
-- ---------------------------------------------------------------------------
create or replace function public.validate_shirt_coupon(
  p_slug     text,
  p_code     text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_qty     integer := greatest(1, coalesce(p_quantity, 1));
  v_product public.shirt_products;
  v_coupon  public.shirt_coupons;
  v_list    integer;
  v_final   integer;
begin
  select * into v_product from public.shirt_products where slug = p_slug;
  select * into v_coupon from public.shirt_coupons c where c.code = v_code;

  if v_product.id is null or v_product.price_cents is null or v_coupon.id is null
     or not v_coupon.active
     or (v_coupon.valid_from is not null and v_coupon.valid_from > now())
     or (v_coupon.valid_until is not null and v_coupon.valid_until < now())
     or (v_coupon.max_uses is not null and public.shirt_coupon_uses(v_coupon.id) >= v_coupon.max_uses) then
    raise exception 'coupon_invalid';
  end if;

  v_list := v_product.price_cents * v_qty;
  v_final := public.shirt_coupon_final_cents(v_coupon.kind, v_coupon.value, v_list);

  return jsonb_build_object(
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'kind', v_coupon.kind,
    'value', v_coupon.value,
    'is_test', v_coupon.is_test,
    'list_cents', v_list,
    'final_cents', v_final,
    'discount_cents', v_list - v_final
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cria a encomenda: modo de venda, cupom, tamanho habilitado, quantidade e lote.
-- A assinatura antiga (sem cupom) sai para não haver duas funções com o mesmo nome.
-- ---------------------------------------------------------------------------
drop function if exists public.create_shirt_order(text, text, text, text, text, text, integer);

create or replace function public.create_shirt_order(
  p_slug        text,
  p_buyer_name  text,
  p_buyer_email text,
  p_buyer_cpf   text,
  p_buyer_phone text,
  p_size        text,
  p_quantity    integer,
  p_coupon      text default null
)
returns table (order_id uuid, access_key text, subtotal_cents integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product public.shirt_products;
  v_coupon  public.shirt_coupons;
  v_code    text := upper(btrim(coalesce(p_coupon, '')));
  v_size    text := btrim(coalesce(p_size, ''));
  v_used    integer;
  v_list    integer;
  v_final   integer;
  v_order   public.shirt_orders;
begin
  perform public.release_expired_shirt_orders();

  select * into v_product from public.shirt_products where slug = p_slug for update;
  if not found then
    raise exception 'unavailable';
  end if;

  -- Fechada, com condição faltando ou fora do prazo final: ninguém encomenda, nem com cupom.
  if v_product.sales_mode = 'fechada'
     or cardinality(public.shirt_sales_gaps(v_product)) > 0
     or v_product.sales_end < now() then
    raise exception 'unavailable';
  end if;

  if v_code <> '' then
    -- O lock do cupom serializa a contagem de usos entre compras simultâneas.
    select * into v_coupon from public.shirt_coupons c where c.code = v_code for update;
    if v_coupon.id is null
       or not v_coupon.active
       or (v_coupon.valid_from is not null and v_coupon.valid_from > now())
       or (v_coupon.valid_until is not null and v_coupon.valid_until < now())
       or (v_coupon.max_uses is not null and public.shirt_coupon_uses(v_coupon.id) >= v_coupon.max_uses) then
      raise exception 'coupon_invalid';
    end if;
  end if;

  if v_product.sales_mode = 'cupom' and v_coupon.id is null then
    raise exception 'coupon_required';
  end if;

  -- O início da janela vale só para a venda aberta ao público.
  if v_product.sales_mode = 'aberta' and v_product.sales_start is not null and v_product.sales_start > now() then
    raise exception 'unavailable';
  end if;

  if not (v_size = any (v_product.sizes)) then
    raise exception 'invalid_size';
  end if;
  if v_size = any (v_product.disabled_sizes) then
    raise exception 'size_unavailable';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > v_product.max_per_order then
    raise exception 'invalid_quantity';
  end if;

  -- Encomenda de teste não ocupa o lote nem é barrada por ele.
  if not coalesce(v_coupon.is_test, false) then
    select coalesce(sum(o.quantity), 0)::integer into v_used
      from public.shirt_orders o
     where o.product_id = v_product.id
       and not o.is_test
       and (o.status = 'pago'
            or (o.status = 'pendente'
                and (o.expires_at > now() or coalesce(o.mp_status, '') in ('in_process', 'authorized'))));

    if v_used + p_quantity > v_product.batch_limit then
      raise exception 'sold_out';
    end if;
  end if;

  v_list := v_product.price_cents * p_quantity;
  v_final := case when v_coupon.id is null then v_list
                  else public.shirt_coupon_final_cents(v_coupon.kind, v_coupon.value, v_list) end;

  insert into public.shirt_orders (
    product_id, buyer_name, buyer_email, buyer_cpf, buyer_phone,
    size, quantity,
    product_name, unit_price_cents, production_lead_time, receipt_details, purchase_policy,
    subtotal_cents, total_cents, expires_at,
    coupon_id, coupon_code, discount_cents, is_test
  ) values (
    v_product.id, p_buyer_name, lower(p_buyer_email), p_buyer_cpf, p_buyer_phone,
    v_size, p_quantity,
    v_product.name, v_product.price_cents, v_product.production_lead_time,
    v_product.receipt_details, v_product.purchase_policy,
    v_final, v_final, now() + interval '35 minutes',
    v_coupon.id, v_coupon.code, v_list - v_final, coalesce(v_coupon.is_test, false)
  )
  returning * into v_order;

  return query select v_order.id, v_order.access_key, v_order.subtotal_cents;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administração (só admin ativo). Cada função confere is_admin() e as regras.
-- ---------------------------------------------------------------------------
create or replace function public.set_shirt_sales_mode(p_slug text, p_mode public.shirt_sales_mode)
returns public.shirt_sales_mode
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product public.shirt_products;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_product from public.shirt_products where slug = p_slug for update;
  if not found then
    raise exception 'not_found';
  end if;
  if p_mode <> 'fechada' and cardinality(public.shirt_sales_gaps(v_product)) > 0 then
    raise exception 'incomplete';
  end if;
  update public.shirt_products set sales_mode = p_mode where id = v_product.id;
  return p_mode;
end;
$$;

create or replace function public.set_shirt_size_enabled(p_slug text, p_size text, p_enabled boolean)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product public.shirt_products;
  v_size    text := btrim(coalesce(p_size, ''));
  v_after   public.shirt_products;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_product from public.shirt_products where slug = p_slug for update;
  if not found then
    raise exception 'not_found';
  end if;
  if not (v_size = any (v_product.sizes)) then
    raise exception 'invalid_size';
  end if;

  update public.shirt_products
     set disabled_sizes = case when p_enabled then array_remove(disabled_sizes, v_size)
                               else array_append(array_remove(disabled_sizes, v_size), v_size) end
   where id = v_product.id
  returning * into v_after;

  -- Não dá para desligar o último tamanho com a venda aberta.
  if v_after.sales_mode <> 'fechada' and cardinality(public.shirt_sales_gaps(v_after)) > 0 then
    raise exception 'incomplete';
  end if;
  return v_after.disabled_sizes;
end;
$$;

-- p_values: chaves opcionais; chave presente com null limpa o campo.
create or replace function public.update_shirt_settings(p_slug text, p_values jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product public.shirt_products;
  v_after   public.shirt_products;
  v_sizes   text[];
  v_removed text[];
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_product from public.shirt_products where slug = p_slug for update;
  if not found then
    raise exception 'not_found';
  end if;

  v_sizes := v_product.sizes;
  if p_values ? 'sizes' then
    select coalesce(array_agg(btrim(e)), '{}') into v_sizes from jsonb_array_elements_text(p_values -> 'sizes') e;
    if exists (select 1 from unnest(v_sizes) s where s = '' or length(s) > 12)
       or cardinality(v_sizes) > 12
       or (select count(distinct s) from unnest(v_sizes) s) <> cardinality(v_sizes) then
      raise exception 'invalid_sizes';
    end if;
    -- Tamanho que já tem encomenda não sai da grade (desabilite em vez de remover).
    select coalesce(array_agg(s), '{}') into v_removed
      from unnest(v_product.sizes) s
     where not (s = any (v_sizes))
       and exists (select 1 from public.shirt_orders o where o.product_id = v_product.id and o.size = s);
    if cardinality(v_removed) > 0 then
      raise exception 'size_in_use:%', array_to_string(v_removed, ',');
    end if;
  end if;

  update public.shirt_products set
    sizes                = v_sizes,
    disabled_sizes       = array(select unnest(disabled_sizes) intersect select unnest(v_sizes)),
    price_cents          = case when p_values ? 'price_cents' then (p_values ->> 'price_cents')::integer else price_cents end,
    batch_limit          = case when p_values ? 'batch_limit' then (p_values ->> 'batch_limit')::integer else batch_limit end,
    max_per_order        = case when p_values ? 'max_per_order' then (p_values ->> 'max_per_order')::integer else max_per_order end,
    sales_start          = case when p_values ? 'sales_start' then (p_values ->> 'sales_start')::timestamptz else sales_start end,
    sales_end            = case when p_values ? 'sales_end' then (p_values ->> 'sales_end')::timestamptz else sales_end end,
    production_lead_time = case when p_values ? 'production_lead_time' then nullif(btrim(p_values ->> 'production_lead_time'), '') else production_lead_time end,
    receipt_details      = case when p_values ? 'receipt_details' then nullif(btrim(p_values ->> 'receipt_details'), '') else receipt_details end,
    purchase_policy      = case when p_values ? 'purchase_policy' then nullif(btrim(p_values ->> 'purchase_policy'), '') else purchase_policy end,
    size_guide           = case when p_values ? 'size_guide' then nullif(btrim(p_values ->> 'size_guide'), '') else size_guide end,
    composition          = case when p_values ? 'composition' then nullif(btrim(p_values ->> 'composition'), '') else composition end,
    fit                  = case when p_values ? 'fit' then nullif(btrim(p_values ->> 'fit'), '') else fit end,
    description          = case when p_values ? 'description' then nullif(btrim(p_values ->> 'description'), '') else description end
  where id = v_product.id
  returning * into v_after;

  -- Com a venda aberta (ou só com cupom), nenhuma condição pode ficar faltando.
  if v_after.sales_mode <> 'fechada' and cardinality(public.shirt_sales_gaps(v_after)) > 0 then
    raise exception 'incomplete';
  end if;
end;
$$;

-- Andamento da produção: encomenda de teste não entra na produção.
create or replace function public.set_shirt_fulfillment(
  p_ids        uuid[],
  p_to         public.shirt_fulfillment_status,
  p_allow_back boolean default false
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'invalid_ids';
  end if;

  update public.shirt_orders
     set fulfillment_status = p_to
   where id = any (p_ids)
     and status = 'pago'
     and not is_test
     and fulfillment_status is distinct from p_to
     and (p_allow_back or fulfillment_status < p_to);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Marcas do roteiro de teste: 'checked' (encomendas conferidas), 'refunds' (estornos feitos ou pulados), 'reset'.
create or replace function public.mark_shirt_test_step(p_slug text, p_step text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_step = 'checked' then
    update public.shirt_products set test_checked_at = now() where slug = p_slug;
  elsif p_step = 'refunds' then
    update public.shirt_products set test_refunds_done_at = now() where slug = p_slug;
  elsif p_step = 'reset' then
    update public.shirt_products set test_checked_at = null, test_refunds_done_at = null where slug = p_slug;
  else
    raise exception 'invalid_step';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visões: encomendas de teste ficam fora de receita, lote e relatórios.
-- (mesmas colunas das visões anteriores: create or replace)
-- ---------------------------------------------------------------------------
create or replace view public.v_shirt_finance_summary with (security_invoker = true) as
with o as (
  select *,
    (status = 'pendente'
      and (expires_at is null or expires_at >= now()
           or coalesce(mp_status, '') in ('in_process', 'authorized'))) as live_pending
  from public.shirt_orders
  where not is_test
)
select
  coalesce(sum(total_cents) filter (where status = 'pago'), 0)::bigint       as gross_cents,
  coalesce(sum(fee_cents)   filter (where status = 'pago'), 0)::bigint       as fee_cents,
  coalesce(sum(net_cents)   filter (where status = 'pago'), 0)::bigint       as net_cents,
  count(*) filter (where status = 'pago')                                     as paid_orders,
  coalesce(sum(quantity) filter (where status = 'pago'), 0)::bigint          as paid_units,
  count(*) filter (where live_pending)                                        as pending_orders,
  coalesce(sum(quantity) filter (where live_pending), 0)::bigint             as pending_units,
  coalesce(sum(total_cents) filter (where live_pending), 0)::bigint          as pending_cents,
  count(*) filter (where status = 'estornado')                                as refunded_orders,
  coalesce(sum(quantity) filter (where status = 'estornado'), 0)::bigint     as refunded_units,
  coalesce(sum(total_cents) filter (where status = 'estornado'), 0)::bigint  as refunded_cents
from o;

create or replace view public.v_shirt_sales_daily with (security_invoker = true) as
select
  (paid_at at time zone 'America/Sao_Paulo')::date as day,
  count(*)                                         as orders,
  sum(quantity)::bigint                            as units,
  sum(total_cents)::bigint                         as gross_cents,
  sum(net_cents)::bigint                           as net_cents
from public.shirt_orders
where status = 'pago' and not is_test
group by 1
order by 1;

create or replace view public.v_shirt_sales_by_size with (security_invoker = true) as
with o as (
  select *,
    (status = 'pendente'
      and (expires_at is null or expires_at >= now()
           or coalesce(mp_status, '') in ('in_process', 'authorized'))) as live_pending
  from public.shirt_orders
  where not is_test
)
select
  size,
  coalesce(sum(quantity) filter (where status = 'pago'), 0)::bigint                                                  as paid_units,
  count(*) filter (where status = 'pago')                                                                             as paid_orders,
  coalesce(sum(quantity) filter (where live_pending), 0)::bigint                                                     as pending_units,
  coalesce(sum(quantity) filter (where status = 'pago' and fulfillment_status = 'aguardando_producao'), 0)::bigint   as waiting_units,
  coalesce(sum(quantity) filter (where status = 'pago' and fulfillment_status = 'em_producao'), 0)::bigint           as in_production_units,
  coalesce(sum(quantity) filter (where status = 'pago' and fulfillment_status = 'pronto'), 0)::bigint                as ready_units,
  coalesce(sum(quantity) filter (where status = 'pago' and fulfillment_status = 'entregue'), 0)::bigint              as delivered_units,
  coalesce(sum(total_cents) filter (where status = 'pago'), 0)::bigint                                               as gross_cents
from o
group by size;

create or replace view public.v_shirt_sales_by_method with (security_invoker = true) as
select
  payment_method,
  count(*)                 as orders,
  sum(quantity)::bigint    as units,
  sum(total_cents)::bigint as gross_cents,
  sum(fee_cents)::bigint   as fee_cents,
  sum(net_cents)::bigint   as net_cents
from public.shirt_orders
where status = 'pago' and not is_test
group by payment_method;

-- Cupons com o uso de cada um (pagas + reservas válidas), desconto concedido e receita.
create or replace view public.v_shirt_coupons with (security_invoker = true) as
select
  c.id, c.code, c.kind, c.value, c.max_uses, c.valid_from, c.valid_until,
  c.active, c.is_test, c.campaign, c.notes, c.created_at,
  coalesce(u.paid_uses, 0)::bigint        as paid_uses,
  coalesce(u.pending_uses, 0)::bigint     as pending_uses,
  coalesce(u.discount_cents, 0)::bigint   as discount_given_cents,
  coalesce(u.revenue_cents, 0)::bigint    as revenue_cents
from public.shirt_coupons c
left join lateral (
  select
    count(*) filter (where o.status = 'pago') as paid_uses,
    count(*) filter (where o.status = 'pendente'
                       and (o.expires_at is null or o.expires_at >= now()
                            or coalesce(o.mp_status, '') in ('in_process', 'authorized'))) as pending_uses,
    coalesce(sum(o.discount_cents) filter (where o.status = 'pago'), 0) as discount_cents,
    coalesce(sum(o.total_cents) filter (where o.status = 'pago'), 0)    as revenue_cents
  from public.shirt_orders o
  where o.coupon_id = c.id
) u on true;

revoke all on public.v_shirt_finance_summary, public.v_shirt_sales_daily,
              public.v_shirt_sales_by_size, public.v_shirt_sales_by_method,
              public.v_shirt_coupons from anon;

-- ---------------------------------------------------------------------------
-- Troca do interruptor pelo modo de venda: a coluna antiga sai por último.
-- ---------------------------------------------------------------------------
alter table public.shirt_products drop column if exists sales_enabled;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------
revoke all on function public.shirt_coupon_uses(uuid) from public, anon, authenticated;
revoke all on function public.validate_shirt_coupon(text, text, integer) from public, anon, authenticated;
revoke all on function public.create_shirt_order(text, text, text, text, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.set_shirt_sales_mode(text, public.shirt_sales_mode) from public, anon;
revoke all on function public.set_shirt_size_enabled(text, text, boolean) from public, anon;
revoke all on function public.update_shirt_settings(text, jsonb) from public, anon;
revoke all on function public.mark_shirt_test_step(text, text) from public, anon;

grant execute on function public.shirt_coupon_uses(uuid) to service_role;
grant execute on function public.validate_shirt_coupon(text, text, integer) to service_role;
grant execute on function public.create_shirt_order(text, text, text, text, text, text, integer, text) to service_role;
grant execute on function public.set_shirt_sales_mode(text, public.shirt_sales_mode) to authenticated;
grant execute on function public.set_shirt_size_enabled(text, text, boolean) to authenticated;
grant execute on function public.update_shirt_settings(text, jsonb) to authenticated;
grant execute on function public.mark_shirt_test_step(text, text) to authenticated;

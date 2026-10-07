-- Camisa oficial sob encomenda (Story 3.1).
-- Domínio separado dos ingressos: nada aqui lê ou escreve orders, order_items,
-- tickets ou ticket_types. Pagamentos de camisa usam external_reference "shirt:<uuid>".
-- Venda fechada por padrão: só abre com todas as condições comerciais confirmadas.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shirt_fulfillment_status') then
    create type public.shirt_fulfillment_status as enum
      ('aguardando_producao', 'em_producao', 'pronto', 'entregue');
  end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo. Informação desconhecida fica nula/vazia, nunca ilustrativa.
-- ---------------------------------------------------------------------------
create table if not exists public.shirt_products (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  description           text,
  price_cents           integer check (price_cents is null or price_cents between 1 and 10000000),
  -- Grade confirmada com o fornecedor, na ordem de exibição (ex.: {P,M,G}).
  sizes                 text[] not null default '{}' check (cardinality(sizes) <= 12),
  size_guide            text,
  composition           text,
  fit                   text,
  sales_enabled         boolean not null default false,
  sales_start           timestamptz,
  sales_end             timestamptz,
  production_lead_time  text,
  receipt_details       text,
  purchase_policy       text,
  max_per_order         integer check (max_per_order is null or max_per_order between 1 and 10),
  batch_limit           integer check (batch_limit is null or batch_limit > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists shirt_products_touch on public.shirt_products;
create trigger shirt_products_touch before update on public.shirt_products
  for each row execute function public.touch_updated_at();

insert into public.shirt_products (slug, name, description)
values (
  'camisa-hibrido-games',
  'Camisa oficial Híbrido Games',
  'Camisa oficial do evento, produzida sob encomenda.'
)
on conflict (slug) do nothing;

-- Condições comerciais que faltam para abrir a venda (chaves estáveis, usadas também no app).
create or replace function public.shirt_sales_gaps(p public.shirt_products)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    case when p.price_cents is null or p.price_cents < 1 then 'price' end,
    case when cardinality(p.sizes) = 0 then 'sizes' end,
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
-- Encomendas
-- ---------------------------------------------------------------------------
create table if not exists public.shirt_orders (
  id                        uuid primary key default gen_random_uuid(),
  code                      text not null unique default public.gen_short_code(),
  product_id                uuid not null references public.shirt_products (id),
  buyer_name                text not null,
  buyer_email               text not null,
  buyer_cpf                 text not null,
  buyer_phone               text,
  size                      text not null,
  quantity                  integer not null check (quantity > 0),
  -- Snapshot das condições aceitas no momento da compra.
  product_name              text not null,
  unit_price_cents          integer not null check (unit_price_cents > 0),
  production_lead_time      text not null,
  receipt_details           text not null,
  purchase_policy           text not null,
  subtotal_cents            integer not null check (subtotal_cents >= 0),
  total_cents               integer not null check (total_cents >= 0),
  fee_cents                 integer not null default 0 check (fee_cents >= 0),
  net_cents                 integer not null default 0,
  -- Financeiro e produção são estados independentes.
  status                    public.order_status not null default 'pendente',
  fulfillment_status        public.shirt_fulfillment_status not null default 'aguardando_producao',
  payment_method            public.payment_method,
  mp_payment_id             text unique,
  mp_status                 text,
  mp_status_detail          text,
  paid_at                   timestamptz,
  expires_at                timestamptz,
  access_key                text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  confirmation_email_sent_at timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint shirt_orders_fulfillment_needs_payment
    check (fulfillment_status = 'aguardando_producao' or paid_at is not null)
);
create index if not exists shirt_orders_status_idx on public.shirt_orders (status);
create index if not exists shirt_orders_created_idx on public.shirt_orders (created_at desc);
create index if not exists shirt_orders_paid_at_idx on public.shirt_orders (paid_at);
create index if not exists shirt_orders_pending_expiry_idx on public.shirt_orders (expires_at) where status = 'pendente';

drop trigger if exists shirt_orders_touch on public.shirt_orders;
create trigger shirt_orders_touch before update on public.shirt_orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: catálogo público; encomendas só para admin. Escritas pelo servidor (RPCs).
-- ---------------------------------------------------------------------------
alter table public.shirt_products enable row level security;
alter table public.shirt_orders   enable row level security;

drop policy if exists "catálogo de camisas público" on public.shirt_products;
create policy "catálogo de camisas público" on public.shirt_products
  for select to anon, authenticated using (true);

drop policy if exists "admin lê encomendas de camisa" on public.shirt_orders;
create policy "admin lê encomendas de camisa" on public.shirt_orders
  for select to authenticated using (public.is_admin());

revoke all on public.shirt_orders from anon;
revoke insert, update, delete on public.shirt_products from anon, authenticated;
revoke insert, update, delete on public.shirt_orders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cancela encomendas pendentes vencidas (exceto cartão em análise no MP).
-- Não há estoque a devolver: o limite do lote conta apenas pagas e reservas válidas.
-- ---------------------------------------------------------------------------
create or replace function public.release_expired_shirt_orders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.shirt_orders
     set status = 'cancelado', expires_at = null
   where status = 'pendente'
     and expires_at < now()
     and coalesce(mp_status, '') not in ('in_process', 'authorized');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cria a encomenda validando catálogo, janela, tamanho, quantidade e limite do lote.
-- O cliente nunca define preço ou condições: tudo vem do produto, sob lock.
-- ---------------------------------------------------------------------------
create or replace function public.create_shirt_order(
  p_slug        text,
  p_buyer_name  text,
  p_buyer_email text,
  p_buyer_cpf   text,
  p_buyer_phone text,
  p_size        text,
  p_quantity    integer
)
returns table (order_id uuid, access_key text, subtotal_cents integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product public.shirt_products;
  v_size    text := btrim(coalesce(p_size, ''));
  v_used    integer;
  v_order   public.shirt_orders;
begin
  perform public.release_expired_shirt_orders();

  select * into v_product from public.shirt_products where slug = p_slug for update;
  if not found then
    raise exception 'unavailable';
  end if;

  if not v_product.sales_enabled
     or cardinality(public.shirt_sales_gaps(v_product)) > 0
     or (v_product.sales_start is not null and v_product.sales_start > now())
     or v_product.sales_end < now() then
    raise exception 'unavailable';
  end if;

  if not (v_size = any (v_product.sizes)) then
    raise exception 'invalid_size';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > v_product.max_per_order then
    raise exception 'invalid_quantity';
  end if;

  select coalesce(sum(o.quantity), 0)::integer into v_used
    from public.shirt_orders o
   where o.product_id = v_product.id
     and (o.status = 'pago'
          or (o.status = 'pendente'
              and (o.expires_at > now() or coalesce(o.mp_status, '') in ('in_process', 'authorized'))));

  if v_used + p_quantity > v_product.batch_limit then
    raise exception 'sold_out';
  end if;

  insert into public.shirt_orders (
    product_id, buyer_name, buyer_email, buyer_cpf, buyer_phone,
    size, quantity,
    product_name, unit_price_cents, production_lead_time, receipt_details, purchase_policy,
    subtotal_cents, total_cents, expires_at
  ) values (
    v_product.id, p_buyer_name, lower(p_buyer_email), p_buyer_cpf, p_buyer_phone,
    v_size, p_quantity,
    v_product.name, v_product.price_cents, v_product.production_lead_time,
    v_product.receipt_details, v_product.purchase_policy,
    v_product.price_cents * p_quantity, v_product.price_cents * p_quantity,
    now() + interval '35 minutes'
  )
  returning * into v_order;

  return query select v_order.id, v_order.access_key, v_order.subtotal_cents;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aplica o status de um pagamento do Mercado Pago (idempotente).
-- Retorna o status financeiro final. Nunca toca em ingressos.
-- ---------------------------------------------------------------------------
create or replace function public.apply_shirt_payment(
  p_order_id      uuid,
  p_mp_payment_id text,
  p_mp_status     text,
  p_status_detail text,
  p_method        public.payment_method,
  p_total_cents   integer,
  p_fee_cents     integer,
  p_net_cents     integer,
  p_paid_at       timestamptz
)
returns public.order_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.shirt_orders;
begin
  select * into v_order from public.shirt_orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  if p_mp_status = 'approved' then
    if v_order.status in ('pago', 'estornado') then
      return v_order.status; -- já confirmado: notificação repetida não duplica nada
    end if;

    -- O valor aprovado precisa cobrir o subtotal calculado no servidor.
    if p_total_cents < v_order.subtotal_cents then
      update public.shirt_orders
         set mp_status = p_mp_status, mp_status_detail = 'amount_mismatch'
       where id = p_order_id and status = 'pendente';
      return v_order.status;
    end if;

    -- Pedido liberado por expiração, mas pago: confirma (o dinheiro já foi recebido).
    update public.shirt_orders set
      status = 'pago',
      mp_payment_id = p_mp_payment_id,
      mp_status = p_mp_status,
      mp_status_detail = p_status_detail,
      payment_method = p_method,
      total_cents = p_total_cents,
      fee_cents = p_fee_cents,
      net_cents = p_net_cents,
      paid_at = coalesce(p_paid_at, now()),
      expires_at = null
    where id = p_order_id;
    return 'pago';
  end if;

  if p_mp_status in ('refunded', 'charged_back') then
    if v_order.status <> 'pago' or v_order.mp_payment_id is distinct from p_mp_payment_id then
      return v_order.status;
    end if;
    -- O andamento da produção fica no histórico; o pedido sai do lote pago.
    update public.shirt_orders
       set status = 'estornado', mp_status = p_mp_status, mp_status_detail = p_status_detail
     where id = p_order_id;
    return 'estornado';
  end if;

  -- Pendente, em análise, recusado ou cancelado no MP: só registra, e só enquanto pendente.
  if v_order.status = 'pendente' then
    update public.shirt_orders set
      mp_payment_id = p_mp_payment_id,
      mp_status = p_mp_status,
      mp_status_detail = p_status_detail,
      payment_method = p_method,
      -- Cartão em análise segura a reserva até a resposta final.
      expires_at = case when p_mp_status in ('in_process', 'authorized')
                        then greatest(expires_at, now() + interval '48 hours')
                        else expires_at end
    where id = p_order_id;
  end if;

  return v_order.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Andamento da produção (admin). Só encomendas pagas; em lote, apenas avança.
-- p_allow_back = true permite corrigir um andamento marcado por engano.
-- ---------------------------------------------------------------------------
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
     and fulfillment_status is distinct from p_to
     and (p_allow_back or fulfillment_status < p_to);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visões do painel (security_invoker: só admin enxerga, via RLS de shirt_orders).
-- Pendente "vivo" = dentro do prazo de reserva ou cartão em análise.
-- ---------------------------------------------------------------------------
create or replace view public.v_shirt_finance_summary with (security_invoker = true) as
with o as (
  select *,
    (status = 'pendente'
      and (expires_at is null or expires_at >= now()
           or coalesce(mp_status, '') in ('in_process', 'authorized'))) as live_pending
  from public.shirt_orders
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
where status = 'pago'
group by 1
order by 1;

-- Também é o "lote por tamanho": unidades pagas por tamanho e por andamento.
create or replace view public.v_shirt_sales_by_size with (security_invoker = true) as
with o as (
  select *,
    (status = 'pendente'
      and (expires_at is null or expires_at >= now()
           or coalesce(mp_status, '') in ('in_process', 'authorized'))) as live_pending
  from public.shirt_orders
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
where status = 'pago'
group by payment_method;

revoke all on public.v_shirt_finance_summary, public.v_shirt_sales_daily,
              public.v_shirt_sales_by_size, public.v_shirt_sales_by_method from anon;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------
revoke all on function public.release_expired_shirt_orders() from public, anon, authenticated;
revoke all on function public.create_shirt_order(text, text, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.apply_shirt_payment(uuid, text, text, text, public.payment_method, integer, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.set_shirt_fulfillment(uuid[], public.shirt_fulfillment_status, boolean)
  from public, anon;

grant execute on function public.release_expired_shirt_orders() to service_role;
grant execute on function public.create_shirt_order(text, text, text, text, text, text, integer) to service_role;
grant execute on function public.apply_shirt_payment(uuid, text, text, text, public.payment_method, integer, integer, integer, timestamptz)
  to service_role;
grant execute on function public.set_shirt_fulfillment(uuid[], public.shirt_fulfillment_status, boolean)
  to authenticated;

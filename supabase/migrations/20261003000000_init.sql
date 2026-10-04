-- Híbrido Games 2026 — schema inicial (Story 1.3)
-- Vendas de ingressos, perfis (admin/staff), portaria e visões financeiras.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'staff');
create type public.order_status as enum ('pendente', 'pago', 'cancelado', 'estornado');
create type public.payment_method as enum ('pix', 'cartao');
create type public.ticket_status as enum ('valido', 'rasgado', 'cancelado');
create type public.scan_result as enum ('ok', 'ja_utilizado', 'cancelado', 'invalido');

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null,
  role       public.app_role not null default 'staff',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catálogo e pedidos
-- ---------------------------------------------------------------------------
create table public.ticket_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  price_cents  integer not null check (price_cents >= 0),
  quantity     integer not null check (quantity >= 0),
  sold         integer not null default 0 check (sold >= 0),
  sales_start  timestamptz,
  sales_end    timestamptz,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint ticket_types_stock check (sold <= quantity)
);

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  buyer_name      text not null,
  buyer_email     text not null,
  buyer_cpf       text not null,
  buyer_phone     text,
  status          public.order_status not null default 'pendente',
  payment_method  public.payment_method,
  total_cents     integer not null check (total_cents >= 0),
  fee_cents       integer not null default 0 check (fee_cents >= 0),
  net_cents       integer not null default 0,
  mp_payment_id   text unique,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index orders_status_idx on public.orders (status);
create index orders_paid_at_idx on public.orders (paid_at);
create index orders_buyer_email_idx on public.orders (lower(buyer_email));

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  ticket_type_id    uuid not null references public.ticket_types (id),
  quantity          integer not null check (quantity > 0),
  unit_price_cents  integer not null check (unit_price_cents >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- Ingressos
-- ---------------------------------------------------------------------------
-- Código curto para digitação manual na portaria (sem caracteres ambíguos).
create or replace function public.gen_short_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  result text := '';
begin
  for i in 0..7 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  ticket_type_id  uuid not null references public.ticket_types (id),
  holder_name     text not null,
  -- Conteúdo do QR: aleatório e opaco (192 bits), sem dados pessoais.
  token           text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  short_code      text not null unique default public.gen_short_code(),
  status          public.ticket_status not null default 'valido',
  redeemed_at     timestamptz,
  redeemed_by     uuid references public.profiles (user_id),
  created_at      timestamptz not null default now(),
  constraint tickets_redeemed_consistency
    check ((status = 'rasgado') = (redeemed_at is not null))
);
create index tickets_order_idx on public.tickets (order_id);
create index tickets_status_idx on public.tickets (status);

create table public.ticket_scans (
  id          bigint generated always as identity primary key,
  ticket_id   uuid references public.tickets (id) on delete set null,
  code        text not null,
  scanned_by  uuid not null references public.profiles (user_id),
  result      public.scan_result not null,
  created_at  timestamptz not null default now()
);
create index ticket_scans_created_idx on public.ticket_scans (created_at desc);
create index ticket_scans_by_idx on public.ticket_scans (scanned_by, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers de autorização
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and active
  );
$$;

-- ---------------------------------------------------------------------------
-- Portaria: leitura atômica do ingresso
-- ---------------------------------------------------------------------------
-- Aceita o token do QR ou o código curto. O UPDATE condicional garante que,
-- com leituras simultâneas do mesmo ingresso, apenas uma retorne 'ok'.
create or replace function public.redeem_ticket(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_raw    text := left(trim(coalesce(p_code, '')), 128);
  v_ticket public.tickets;
  v_type   text;
  v_by     text;
begin
  if not public.is_active_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.tickets
     set status = 'rasgado', redeemed_at = now(), redeemed_by = v_uid
   where (token = lower(v_raw) or short_code = upper(v_raw))
     and status = 'valido'
  returning * into v_ticket;

  if found then
    select name into v_type from public.ticket_types where id = v_ticket.ticket_type_id;
    insert into public.ticket_scans (ticket_id, code, scanned_by, result)
    values (v_ticket.id, v_raw, v_uid, 'ok');
    return jsonb_build_object(
      'result', 'ok',
      'holder_name', v_ticket.holder_name,
      'ticket_type', v_type,
      'short_code', v_ticket.short_code
    );
  end if;

  select * into v_ticket from public.tickets
   where token = lower(v_raw) or short_code = upper(v_raw);

  if not found then
    insert into public.ticket_scans (ticket_id, code, scanned_by, result)
    values (null, v_raw, v_uid, 'invalido');
    return jsonb_build_object('result', 'invalido');
  end if;

  select name into v_type from public.ticket_types where id = v_ticket.ticket_type_id;

  if v_ticket.status = 'rasgado' then
    select name into v_by from public.profiles where user_id = v_ticket.redeemed_by;
    insert into public.ticket_scans (ticket_id, code, scanned_by, result)
    values (v_ticket.id, v_raw, v_uid, 'ja_utilizado');
    return jsonb_build_object(
      'result', 'ja_utilizado',
      'holder_name', v_ticket.holder_name,
      'ticket_type', v_type,
      'short_code', v_ticket.short_code,
      'redeemed_at', v_ticket.redeemed_at,
      'redeemed_by', v_by
    );
  end if;

  insert into public.ticket_scans (ticket_id, code, scanned_by, result)
  values (v_ticket.id, v_raw, v_uid, 'cancelado');
  return jsonb_build_object(
    'result', 'cancelado',
    'holder_name', v_ticket.holder_name,
    'ticket_type', v_type,
    'short_code', v_ticket.short_code
  );
end;
$$;

revoke all on function public.redeem_ticket(text) from public, anon;
grant execute on function public.redeem_ticket(text) to authenticated;
revoke all on function public.gen_short_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS — escrita de pedidos/ingressos só pelo servidor (service role).
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.ticket_types enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.tickets      enable row level security;
alter table public.ticket_scans enable row level security;

create policy "perfil próprio ou admin" on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "catálogo público" on public.ticket_types
  for select to anon, authenticated
  using (active or public.is_admin());

create policy "admin lê pedidos" on public.orders
  for select to authenticated using (public.is_admin());

create policy "admin lê itens" on public.order_items
  for select to authenticated using (public.is_admin());

create policy "admin lê ingressos" on public.tickets
  for select to authenticated using (public.is_admin());

create policy "staff lê as próprias leituras; admin lê todas" on public.ticket_scans
  for select to authenticated
  using (scanned_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Visões financeiras (security_invoker: respeitam o RLS de quem consulta)
-- ---------------------------------------------------------------------------
create view public.v_finance_summary with (security_invoker = true) as
select
  coalesce(sum(total_cents) filter (where status = 'pago'), 0)::bigint      as gross_cents,
  coalesce(sum(fee_cents)   filter (where status = 'pago'), 0)::bigint      as fee_cents,
  coalesce(sum(net_cents)   filter (where status = 'pago'), 0)::bigint      as net_cents,
  count(*) filter (where status = 'pago')                                    as paid_orders,
  count(*) filter (where status = 'pendente')                                as pending_orders,
  coalesce(sum(total_cents) filter (where status = 'pendente'), 0)::bigint  as pending_cents,
  count(*) filter (where status = 'estornado')                               as refunded_orders,
  coalesce(sum(total_cents) filter (where status = 'estornado'), 0)::bigint as refunded_cents,
  (select count(*) from public.tickets t where t.status <> 'cancelado')      as tickets_sold,
  (select count(*) from public.tickets t where t.status = 'rasgado')         as tickets_redeemed
from public.orders;

create view public.v_sales_daily with (security_invoker = true) as
select
  (paid_at at time zone 'America/Sao_Paulo')::date as day,
  count(*)                                         as orders,
  sum(total_cents)::bigint                         as gross_cents,
  sum(net_cents)::bigint                           as net_cents
from public.orders
where status = 'pago'
group by 1
order by 1;

create view public.v_sales_by_type with (security_invoker = true) as
select
  tt.id,
  tt.name,
  tt.price_cents,
  tt.quantity,
  tt.sort_order,
  count(t.id) filter (where t.status <> 'cancelado')  as sold,
  count(t.id) filter (where t.status = 'rasgado')     as redeemed,
  coalesce((
    select sum(oi.quantity * oi.unit_price_cents)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id and o.status = 'pago'
     where oi.ticket_type_id = tt.id
  ), 0)::bigint                                        as gross_cents
from public.ticket_types tt
left join public.tickets t on t.ticket_type_id = tt.id
group by tt.id;

create view public.v_sales_by_method with (security_invoker = true) as
select
  payment_method,
  count(*)                 as orders,
  sum(total_cents)::bigint as gross_cents,
  sum(fee_cents)::bigint   as fee_cents,
  sum(net_cents)::bigint   as net_cents
from public.orders
where status = 'pago'
group by payment_method;

create view public.v_staff_activity with (security_invoker = true) as
select
  p.user_id,
  count(s.id) filter (where s.result = 'ok') as redeemed,
  count(s.id)                                as scans,
  max(s.created_at)                          as last_scan_at
from public.profiles p
left join public.ticket_scans s on s.scanned_by = p.user_id
group by p.user_id;

revoke all on public.v_finance_summary, public.v_sales_daily, public.v_sales_by_type,
              public.v_sales_by_method, public.v_staff_activity from anon;

-- Checkout: reserva atômica de estoque, confirmação idempotente de pagamento e expiração.
-- Todas as funções são executadas apenas pelo servidor (service role).
-- Idempotente: pode ser executada mais de uma vez sem erro.

-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists subtotal_cents   integer not null default 0 check (subtotal_cents >= 0),
  -- Link secreto do pedido (/pedido/[id]?k=...), 256 bits.
  add column if not exists access_key       text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  add column if not exists expires_at       timestamptz,
  add column if not exists mp_status        text,
  add column if not exists mp_status_detail text;

create index if not exists orders_pending_expiry_idx on public.orders (expires_at) where status = 'pendente';

alter table public.order_items
  add column if not exists holder_names text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Libera o estoque de um pedido pendente (interno)
-- ---------------------------------------------------------------------------
create or replace function public.release_order(p_order_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  update public.orders set status = 'cancelado', expires_at = null
   where id = p_order_id and status = 'pendente';
  if not found then
    return;
  end if;

  for v_item in
    select ticket_type_id, sum(quantity)::int as qty
      from public.order_items where order_id = p_order_id
     group by ticket_type_id order by ticket_type_id
  loop
    update public.ticket_types
       set sold = greatest(0, sold - v_item.qty)
     where id = v_item.ticket_type_id;
  end loop;
end;
$$;

-- Cancela pedidos pendentes vencidos (exceto cartão em análise no MP).
create or replace function public.release_expired_orders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.orders
     where status = 'pendente'
       and expires_at < now()
       and coalesce(mp_status, '') not in ('in_process', 'authorized')
     order by expires_at
     for update skip locked
  loop
    perform public.release_order(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cria o pedido reservando o estoque
-- p_items: [{"ticket_type_id": "<uuid>", "holder_names": ["Ana", "Bia"]}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_buyer_name  text,
  p_buyer_email text,
  p_buyer_cpf   text,
  p_buyer_phone text,
  p_items       jsonb
)
returns table (order_id uuid, access_key text, subtotal_cents integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_item     jsonb;
  v_type     public.ticket_types;
  v_qty      integer;
  v_total_qty integer := 0;
  v_subtotal integer := 0;
  v_order    public.orders;
begin
  perform public.release_expired_orders();

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_items';
  end if;

  if (select count(distinct e->>'ticket_type_id') from jsonb_array_elements(p_items) e)
     <> jsonb_array_length(p_items) then
    raise exception 'invalid_items';
  end if;

  -- Ordem fixa evita deadlock entre pedidos concorrentes.
  for v_item in
    select e from jsonb_array_elements(p_items) e order by e->>'ticket_type_id'
  loop
    v_qty := jsonb_array_length(v_item->'holder_names');
    if v_qty < 1 then
      raise exception 'invalid_items';
    end if;
    v_total_qty := v_total_qty + v_qty;

    select * into v_type from public.ticket_types
     where id = (v_item->>'ticket_type_id')::uuid
     for update;

    if not found or not v_type.active or v_type.event_date < v_today
       or (v_type.sales_start is not null and v_type.sales_start > now())
       or (v_type.sales_end is not null and v_type.sales_end < now()) then
      raise exception 'unavailable:%', coalesce(v_type.name, 'ingresso');
    end if;

    if v_type.quantity - v_type.sold < v_qty then
      raise exception 'sold_out:%', v_type.name;
    end if;

    update public.ticket_types set sold = sold + v_qty where id = v_type.id;
    v_subtotal := v_subtotal + v_qty * v_type.price_cents;
  end loop;

  if v_total_qty > 10 then
    raise exception 'too_many';
  end if;

  insert into public.orders (
    buyer_name, buyer_email, buyer_cpf, buyer_phone,
    status, total_cents, subtotal_cents, expires_at
  ) values (
    p_buyer_name, lower(p_buyer_email), p_buyer_cpf, p_buyer_phone,
    'pendente', v_subtotal, v_subtotal, now() + interval '35 minutes'
  )
  returning * into v_order;

  insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_cents, holder_names)
  select v_order.id, tt.id, jsonb_array_length(e->'holder_names'), tt.price_cents,
         array(select jsonb_array_elements_text(e->'holder_names'))
    from jsonb_array_elements(p_items) e
    join public.ticket_types tt on tt.id = (e->>'ticket_type_id')::uuid;

  return query select v_order.id, v_order.access_key, v_subtotal;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aplica o status de um pagamento do Mercado Pago (idempotente)
-- Retorna o status final do pedido.
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment(
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
  v_order public.orders;
  v_item  record;
  v_name  text;
  v_cancelled integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  -- Pagamento antigo de um pedido já pago com outro pagamento: ignora.
  if v_order.status = 'pago' and v_order.mp_payment_id is distinct from p_mp_payment_id
     and p_mp_status <> 'approved' then
    return v_order.status;
  end if;

  if p_mp_status = 'approved' then
    if v_order.status = 'pago' then
      return v_order.status; -- já confirmado
    end if;
    if v_order.status = 'estornado' then
      return v_order.status;
    end if;

    -- Pedido liberado por expiração mas pago: reserva de novo.
    -- Se o estoque acabou nesse intervalo, o estoque total acompanha (não nega o ingresso pago).
    if v_order.status = 'cancelado' then
      for v_item in
        select ticket_type_id, sum(quantity)::int as qty
          from public.order_items where order_id = p_order_id
         group by ticket_type_id order by ticket_type_id
      loop
        update public.ticket_types
           set sold = sold + v_item.qty,
               quantity = greatest(quantity, sold + v_item.qty)
         where id = v_item.ticket_type_id;
      end loop;
    end if;

    update public.orders set
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

    for v_item in select * from public.order_items where order_id = p_order_id loop
      foreach v_name in array v_item.holder_names loop
        insert into public.tickets (order_id, ticket_type_id, holder_name)
        values (p_order_id, v_item.ticket_type_id, v_name);
      end loop;
    end loop;

    return 'pago';
  end if;

  if p_mp_status in ('refunded', 'charged_back') then
    if v_order.status <> 'pago' or v_order.mp_payment_id is distinct from p_mp_payment_id then
      return v_order.status;
    end if;

    update public.orders set status = 'estornado', mp_status = p_mp_status,
           mp_status_detail = p_status_detail
     where id = p_order_id;

    -- Cancela os ingressos ainda não usados e devolve-os ao estoque.
    for v_item in
      with cancelled as (
        update public.tickets set status = 'cancelado'
         where order_id = p_order_id and status = 'valido'
        returning ticket_type_id
      )
      select ticket_type_id, count(*)::int as qty from cancelled group by ticket_type_id
    loop
      update public.ticket_types set sold = greatest(0, sold - v_item.qty)
       where id = v_item.ticket_type_id;
    end loop;

    return 'estornado';
  end if;

  -- Pendente, em análise, recusado ou cancelado no MP: só registra.
  if v_order.status = 'pendente' then
    update public.orders set
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

revoke all on function public.release_order(uuid) from public, anon, authenticated;
revoke all on function public.release_expired_orders() from public, anon, authenticated;
revoke all on function public.create_order(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.apply_payment(uuid, text, text, text, public.payment_method, integer, integer, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.release_order(uuid) to service_role;
grant execute on function public.release_expired_orders() to service_role;
grant execute on function public.create_order(text, text, text, text, jsonb) to service_role;
grant execute on function public.apply_payment(uuid, text, text, text, public.payment_method, integer, integer, integer, timestamptz)
  to service_role;

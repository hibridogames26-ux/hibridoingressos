-- Estoque de ingressos com data do evento + recusa de ingresso de outro dia na portaria.

-- ---------------------------------------------------------------------------
-- Data do dia do evento em que o ingresso vale
-- ---------------------------------------------------------------------------
alter table public.ticket_types add column event_date date not null;
create index ticket_types_event_date_idx on public.ticket_types (event_date, sort_order);

-- ---------------------------------------------------------------------------
-- Admin gerencia o catálogo com a própria sessão (RLS), sem service role.
-- A exclusão de tipos com vendas é barrada pelas FKs de tickets/order_items.
-- ---------------------------------------------------------------------------
create policy "admin cria tipos" on public.ticket_types
  for insert to authenticated with check (public.is_admin());

create policy "admin edita tipos" on public.ticket_types
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin exclui tipos" on public.ticket_types
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Portaria: novo resultado para ingresso de outro dia
-- ---------------------------------------------------------------------------
alter type public.scan_result add value if not exists 'data_errada';

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
  v_today  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ticket public.tickets;
  v_type   public.ticket_types;
  v_by     text;
begin
  if not public.is_active_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Só rasga se ainda for válido E for do dia de hoje. Com leituras
  -- simultâneas do mesmo ingresso, apenas uma passa por este UPDATE.
  update public.tickets t
     set status = 'rasgado', redeemed_at = now(), redeemed_by = v_uid
    from public.ticket_types tt
   where tt.id = t.ticket_type_id
     and tt.event_date = v_today
     and (t.token = lower(v_raw) or t.short_code = upper(v_raw))
     and t.status = 'valido'
  returning t.* into v_ticket;

  if found then
    select * into v_type from public.ticket_types where id = v_ticket.ticket_type_id;
    insert into public.ticket_scans (ticket_id, code, scanned_by, result)
    values (v_ticket.id, v_raw, v_uid, 'ok');
    return jsonb_build_object(
      'result', 'ok',
      'holder_name', v_ticket.holder_name,
      'ticket_type', v_type.name,
      'event_date', v_type.event_date,
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

  select * into v_type from public.ticket_types where id = v_ticket.ticket_type_id;

  if v_ticket.status = 'rasgado' then
    select name into v_by from public.profiles where user_id = v_ticket.redeemed_by;
    insert into public.ticket_scans (ticket_id, code, scanned_by, result)
    values (v_ticket.id, v_raw, v_uid, 'ja_utilizado');
    return jsonb_build_object(
      'result', 'ja_utilizado',
      'holder_name', v_ticket.holder_name,
      'ticket_type', v_type.name,
      'event_date', v_type.event_date,
      'short_code', v_ticket.short_code,
      'redeemed_at', v_ticket.redeemed_at,
      'redeemed_by', v_by
    );
  end if;

  if v_ticket.status = 'cancelado' then
    insert into public.ticket_scans (ticket_id, code, scanned_by, result)
    values (v_ticket.id, v_raw, v_uid, 'cancelado');
    return jsonb_build_object(
      'result', 'cancelado',
      'holder_name', v_ticket.holder_name,
      'ticket_type', v_type.name,
      'event_date', v_type.event_date,
      'short_code', v_ticket.short_code
    );
  end if;

  -- Válido, mas de outro dia: não rasga.
  insert into public.ticket_scans (ticket_id, code, scanned_by, result)
  values (v_ticket.id, v_raw, v_uid, 'data_errada');
  return jsonb_build_object(
    'result', 'data_errada',
    'holder_name', v_ticket.holder_name,
    'ticket_type', v_type.name,
    'event_date', v_type.event_date,
    'short_code', v_ticket.short_code
  );
end;
$$;

revoke all on function public.redeem_ticket(text) from public, anon;
grant execute on function public.redeem_ticket(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Views: data do evento e contador de reservas no resumo por tipo
-- (colunas novas no fim para permitir create or replace)
-- ---------------------------------------------------------------------------
create or replace view public.v_sales_by_type with (security_invoker = true) as
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
  ), 0)::bigint                                        as gross_cents,
  tt.event_date,
  tt.active,
  tt.description,
  tt.sold                                              as reserved
from public.ticket_types tt
left join public.tickets t on t.ticket_type_id = tt.id
group by tt.id;

revoke all on public.v_sales_by_type from anon;

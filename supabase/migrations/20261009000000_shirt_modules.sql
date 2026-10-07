-- Camisa: módulos de Cupons e Configurações (Story 3.1, opção 2).
-- Limite de uso por comprador (CPF), limite e mensagem por tamanho e histórico de alterações.
-- Idempotente: pode ser executada mais de uma vez.

-- ---------------------------------------------------------------------------
-- Cupom: limite de usos por comprador (NULL = sem limite por CPF)
-- ---------------------------------------------------------------------------
alter table public.shirt_coupons
  add column if not exists max_per_buyer integer check (max_per_buyer is null or max_per_buyer >= 1);

-- ---------------------------------------------------------------------------
-- Produto: limite de camisas e mensagem ao cliente por tamanho
--   size_limits   {"G": 40}                                   (tamanho -> unidades, pagas + reservas)
--   size_messages {"XG": "O fornecedor não atende este tamanho"}
-- ---------------------------------------------------------------------------
alter table public.shirt_products
  add column if not exists size_limits   jsonb not null default '{}'::jsonb check (jsonb_typeof(size_limits) = 'object'),
  add column if not exists size_messages jsonb not null default '{}'::jsonb check (jsonb_typeof(size_messages) = 'object');

-- ---------------------------------------------------------------------------
-- Histórico de alterações (só leitura para o admin; gravado por gatilhos)
-- ---------------------------------------------------------------------------
create table if not exists public.shirt_audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  kind        text not null,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists shirt_audit_log_at_idx on public.shirt_audit_log (at desc);

alter table public.shirt_audit_log enable row level security;

drop policy if exists "admin lê histórico de camisas" on public.shirt_audit_log;
create policy "admin lê histórico de camisas" on public.shirt_audit_log
  for select to authenticated using (public.is_admin());

revoke all on public.shirt_audit_log from anon;
revoke insert, update, delete on public.shirt_audit_log from authenticated;

create or replace function public.shirt_audit(p_kind text, p_detail jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
begin
  if v_uid is not null then
    select p.name into v_name from public.profiles p where p.user_id = v_uid;
  end if;
  insert into public.shirt_audit_log (actor_id, actor_name, kind, detail)
  values (v_uid, v_name, p_kind, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function public.shirt_audit(text, jsonb) from public, anon, authenticated;

create or replace function public.shirt_products_audit()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s text;
begin
  if new.sales_mode is distinct from old.sales_mode then
    perform public.shirt_audit('mode', jsonb_build_object('from', old.sales_mode, 'to', new.sales_mode));
  end if;

  for s in select unnest(new.disabled_sizes) except select unnest(old.disabled_sizes) loop
    perform public.shirt_audit('size_disabled', jsonb_build_object('size', s));
  end loop;
  for s in select unnest(old.disabled_sizes) except select unnest(new.disabled_sizes) loop
    -- Tamanho que saiu da grade não conta como "habilitado".
    if s = any (new.sizes) then
      perform public.shirt_audit('size_enabled', jsonb_build_object('size', s));
    end if;
  end loop;

  if new.price_cents is distinct from old.price_cents then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'price', 'from', old.price_cents, 'to', new.price_cents));
  end if;
  if new.batch_limit is distinct from old.batch_limit then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'batch_limit', 'from', old.batch_limit, 'to', new.batch_limit));
  end if;
  if new.max_per_order is distinct from old.max_per_order then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'max_per_order', 'from', old.max_per_order, 'to', new.max_per_order));
  end if;
  if new.sales_start is distinct from old.sales_start then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'sales_start', 'from', old.sales_start, 'to', new.sales_start));
  end if;
  if new.sales_end is distinct from old.sales_end then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'sales_end', 'from', old.sales_end, 'to', new.sales_end));
  end if;
  if new.sizes is distinct from old.sizes then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'sizes', 'from', to_jsonb(old.sizes), 'to', to_jsonb(new.sizes)));
  end if;
  if new.size_limits is distinct from old.size_limits then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'size_limits', 'from', old.size_limits, 'to', new.size_limits));
  end if;
  if new.size_messages is distinct from old.size_messages then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'size_messages'));
  end if;
  -- Textos longos: só registra que mudaram.
  if new.production_lead_time is distinct from old.production_lead_time then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'lead_time'));
  end if;
  if new.receipt_details is distinct from old.receipt_details then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'receipt'));
  end if;
  if new.purchase_policy is distinct from old.purchase_policy then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'policy'));
  end if;
  if new.size_guide is distinct from old.size_guide then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'size_guide'));
  end if;
  if new.composition is distinct from old.composition then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'composition'));
  end if;
  if new.fit is distinct from old.fit then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'fit'));
  end if;
  if new.description is distinct from old.description then
    perform public.shirt_audit('setting', jsonb_build_object('field', 'description'));
  end if;
  return null;
end;
$$;
revoke all on function public.shirt_products_audit() from public, anon, authenticated;

drop trigger if exists shirt_products_audit on public.shirt_products;
create trigger shirt_products_audit after update on public.shirt_products
  for each row execute function public.shirt_products_audit();

create or replace function public.shirt_coupons_audit()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.shirt_audit('coupon_created', jsonb_build_object(
      'code', new.code, 'kind', new.kind, 'value', new.value, 'is_test', new.is_test, 'campaign', new.campaign));
  elsif new.active is distinct from old.active then
    perform public.shirt_audit(case when new.active then 'coupon_enabled' else 'coupon_disabled' end,
      jsonb_build_object('code', new.code));
  elsif (new.max_uses, new.valid_from, new.valid_until, new.campaign, new.notes, new.max_per_buyer)
        is distinct from (old.max_uses, old.valid_from, old.valid_until, old.campaign, old.notes, old.max_per_buyer) then
    perform public.shirt_audit('coupon_updated', jsonb_build_object('code', new.code));
  end if;
  return null;
end;
$$;
revoke all on function public.shirt_coupons_audit() from public, anon, authenticated;

drop trigger if exists shirt_coupons_audit on public.shirt_coupons;
create trigger shirt_coupons_audit after insert or update on public.shirt_coupons
  for each row execute function public.shirt_coupons_audit();

-- ---------------------------------------------------------------------------
-- Cria a encomenda: agora também confere o limite por comprador (CPF) e o limite do tamanho.
-- ---------------------------------------------------------------------------
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
  v_product    public.shirt_products;
  v_coupon     public.shirt_coupons;
  v_code       text := upper(btrim(coalesce(p_coupon, '')));
  v_size       text := btrim(coalesce(p_size, ''));
  v_used       integer;
  v_size_used  integer;
  v_buyer_used integer;
  v_list       integer;
  v_final      integer;
  v_order      public.shirt_orders;
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

    if v_coupon.max_per_buyer is not null then
      select count(*)::integer into v_buyer_used
        from public.shirt_orders o
       where o.coupon_id = v_coupon.id
         and o.buyer_cpf = p_buyer_cpf
         and (o.status = 'pago'
              or (o.status = 'pendente'
                  and (o.expires_at > now() or coalesce(o.mp_status, '') in ('in_process', 'authorized'))));
      if v_buyer_used >= v_coupon.max_per_buyer then
        raise exception 'coupon_buyer_limit';
      end if;
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

  -- Encomenda de teste não ocupa o lote nem os limites de tamanho, e não é barrada por eles.
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

    if v_product.size_limits ? v_size then
      select coalesce(sum(o.quantity), 0)::integer into v_size_used
        from public.shirt_orders o
       where o.product_id = v_product.id
         and o.size = v_size
         and not o.is_test
         and (o.status = 'pago'
              or (o.status = 'pendente'
                  and (o.expires_at > now() or coalesce(o.mp_status, '') in ('in_process', 'authorized'))));

      if v_size_used + p_quantity > (v_product.size_limits ->> v_size)::integer then
        raise exception 'size_sold_out';
      end if;
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
-- Limite e mensagem por tamanho (admin). Campo vazio remove o limite ou a mensagem.
-- ---------------------------------------------------------------------------
create or replace function public.update_shirt_size_settings(p_slug text, p_limits jsonb, p_messages jsonb)
returns void
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
  if jsonb_typeof(p_limits) is distinct from 'object' or jsonb_typeof(p_messages) is distinct from 'object' then
    raise exception 'invalid_limits';
  end if;
  select * into v_product from public.shirt_products where slug = p_slug for update;
  if not found then
    raise exception 'not_found';
  end if;

  if exists (
    select 1 from jsonb_each_text(p_limits) t (k, v)
     where btrim(v) <> ''
       and (not (k = any (v_product.sizes)) or btrim(v) !~ '^[0-9]{1,6}$' or btrim(v)::integer < 1)
  ) then
    raise exception 'invalid_limits';
  end if;
  if exists (
    select 1 from jsonb_each_text(p_messages) t (k, v)
     where btrim(v) <> '' and (not (k = any (v_product.sizes)) or length(btrim(v)) > 200)
  ) then
    raise exception 'invalid_messages';
  end if;

  update public.shirt_products set
    size_limits = (
      select coalesce(jsonb_object_agg(k, btrim(v)::integer), '{}'::jsonb)
        from jsonb_each_text(p_limits) t (k, v) where btrim(v) <> ''),
    size_messages = (
      select coalesce(jsonb_object_agg(k, btrim(v)), '{}'::jsonb)
        from jsonb_each_text(p_messages) t (k, v) where btrim(v) <> '')
  where id = v_product.id;
end;
$$;

-- A grade que muda leva junto os limites e mensagens dos tamanhos que saíram.
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
    size_limits          = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(size_limits) t (k, v) where k = any (v_sizes)),
    size_messages        = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(size_messages) t (k, v) where k = any (v_sizes)),
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

-- ---------------------------------------------------------------------------
-- Visão de cupons: ganha max_per_buyer (coluna nova sempre no fim)
-- ---------------------------------------------------------------------------
create or replace view public.v_shirt_coupons with (security_invoker = true) as
select
  c.id, c.code, c.kind, c.value, c.max_uses, c.valid_from, c.valid_until,
  c.active, c.is_test, c.campaign, c.notes, c.created_at,
  coalesce(u.paid_uses, 0)::bigint        as paid_uses,
  coalesce(u.pending_uses, 0)::bigint     as pending_uses,
  coalesce(u.discount_cents, 0)::bigint   as discount_given_cents,
  coalesce(u.revenue_cents, 0)::bigint    as revenue_cents,
  c.max_per_buyer
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

revoke all on public.v_shirt_coupons from anon;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------
revoke all on function public.create_shirt_order(text, text, text, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_shirt_order(text, text, text, text, text, text, integer, text) to service_role;

revoke all on function public.update_shirt_size_settings(text, jsonb, jsonb) from public, anon;
grant execute on function public.update_shirt_size_settings(text, jsonb, jsonb) to authenticated;

revoke all on function public.update_shirt_settings(text, jsonb) from public, anon;
grant execute on function public.update_shirt_settings(text, jsonb) to authenticated;

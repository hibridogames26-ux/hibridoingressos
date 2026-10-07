-- Cupom de 100%: encomenda gratuita (cortesia).
--
-- Até aqui nenhum cupom zerava o total: o valor final tinha piso de R$ 1,00 (mínimo do Mercado Pago) e o
-- percentual ia só até 99%. Agora o percentual de 100% é permitido e dispensa pagamento: a encomenda é criada
-- já como "pago" (sem Mercado Pago, sem taxa, sem reserva de 35 minutos) e segue para a produção como
-- qualquer outra. Para não permitir camisas grátis sem controle, o cupom de 100% exige limite de usos.
-- Os outros tipos continuam com o piso de R$ 1,00.

-- ---------------------------------------------------------------------------
-- Regras do cupom na tabela
-- ---------------------------------------------------------------------------
alter table public.shirt_coupons drop constraint if exists shirt_coupons_value;
alter table public.shirt_coupons add constraint shirt_coupons_value check (
  (kind = 'percent' and value between 1 and 100)
  or (kind = 'amount' and value between 1 and 10000000)
  or (kind = 'final' and value between 100 and 10000000)
);

alter table public.shirt_coupons drop constraint if exists shirt_coupons_free_needs_limit;
alter table public.shirt_coupons add constraint shirt_coupons_free_needs_limit check (
  not (kind = 'percent' and value = 100) or max_uses is not null
);

-- ---------------------------------------------------------------------------
-- Valor final: 100% zera; o resto mantém o piso de R$ 1,00.
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
  select case
    when p_kind = 'percent' and p_value = 100 then 0
    else least(
      p_list_cents,
      greatest(
        100,
        case p_kind
          when 'percent' then p_list_cents - round(p_list_cents * p_value / 100.0)::integer
          when 'amount'  then p_list_cents - p_value
          else p_value
        end
      )
    )
  end::integer;
$$;

-- ---------------------------------------------------------------------------
-- Cria a encomenda (mesma assinatura): total zero nasce paga.
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

  -- Cupom de 100% (único que zera o total): a encomenda já nasce paga, sem passar pelo Mercado Pago.
  v_list := v_product.price_cents * p_quantity;
  v_final := case when v_coupon.id is null then v_list
                  else public.shirt_coupon_final_cents(v_coupon.kind, v_coupon.value, v_list) end;

  insert into public.shirt_orders (
    product_id, buyer_name, buyer_email, buyer_cpf, buyer_phone,
    size, quantity,
    product_name, unit_price_cents, production_lead_time, receipt_details, purchase_policy,
    subtotal_cents, total_cents, expires_at, status, paid_at,
    coupon_id, coupon_code, discount_cents, is_test
  ) values (
    v_product.id, p_buyer_name, lower(p_buyer_email), p_buyer_cpf, p_buyer_phone,
    v_size, p_quantity,
    v_product.name, v_product.price_cents, v_product.production_lead_time,
    v_product.receipt_details, v_product.purchase_policy,
    v_final, v_final,
    case when v_final = 0 then null else now() + interval '35 minutes' end,
    case when v_final = 0 then 'pago' else 'pendente' end::public.order_status,
    case when v_final = 0 then now() end,
    v_coupon.id, v_coupon.code, v_list - v_final, coalesce(v_coupon.is_test, false)
  )
  returning * into v_order;

  return query select v_order.id, v_order.access_key, v_order.subtotal_cents;
end;
$$;

revoke all on function public.create_shirt_order(text, text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.create_shirt_order(text, text, text, text, text, text, integer, text) to service_role;

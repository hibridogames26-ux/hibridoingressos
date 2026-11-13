-- Retirada de camisas dos atletas (Story 4.6).
-- Lista própria, separada dos cadastros do check-in: editar ou excluir aqui nunca mexe em termos e atestados.
-- A retirada só é confirmada para quem já fez o check-in; o vínculo com o atleta de "Documentos" é
-- automático (mesmo nome na mesma competição) ou escolhido pelo admin (athlete_id).
-- Só admin ativo (public.is_admin()). As funções rodam com a sessão do admin para registrar quem fez.

-- ---------------------------------------------------------------------------
-- Lista de retirada: uma linha por camisa de atleta
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_shirt_pickups (
  id                   uuid primary key default gen_random_uuid(),
  -- Chave estável da planilha (competição + equipe + atleta + ordem): a importação é idempotente.
  source_key           text not null unique,
  origin               text not null default 'planilha' check (origin in ('planilha', 'manual')),
  competition          text not null check (competition in ('hibrido-games', 'hibrido-race')),
  team_name            text not null check (btrim(team_name) <> ''),
  full_name            text not null check (btrim(full_name) <> ''),
  shirt_size           text not null check (btrim(shirt_size) <> ''),
  box                  text,
  email                text not null check (position('@' in email) > 1),
  phone                text,
  -- Vínculo escolhido no painel com o atleta do check-in. Nulo = automático, pelo nome.
  athlete_id           uuid references public.athletes (id) on delete set null,
  -- Campos corrigidos no painel: a importação da planilha não os sobrescreve.
  admin_edited_fields  text[] not null default '{}',
  -- Retirada
  picked_up_at         timestamptz,
  delivered_size       text,
  picked_by_name       text,
  -- true: quem retirou foi o próprio atleta desta linha.
  picked_by_self       boolean,
  picked_by_document   text,
  pickup_note          text,
  delivered_by         uuid,
  delivered_by_name    text,
  -- Camisas confirmadas juntas (mesma inscrição): saem no mesmo e-mail.
  pickup_batch         uuid,
  email_sent_at        timestamptz,
  -- Excluído no painel: fica fora da lista e a importação não o traz de volta.
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint athlete_shirt_pickups_pickup_complete check (
    picked_up_at is null or (
      btrim(coalesce(delivered_size, '')) <> ''
      and btrim(coalesce(picked_by_name, '')) <> ''
      and picked_by_self is not null
    )
  )
);
create index if not exists athlete_shirt_pickups_team_idx on public.athlete_shirt_pickups (competition, team_name);
create index if not exists athlete_shirt_pickups_batch_idx on public.athlete_shirt_pickups (pickup_batch);

drop trigger if exists athlete_shirt_pickups_touch on public.athlete_shirt_pickups;
create trigger athlete_shirt_pickups_touch before update on public.athlete_shirt_pickups
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Histórico (só leitura para o admin; gravado pelas funções abaixo)
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_shirt_pickup_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  pickup_id   uuid references public.athlete_shirt_pickups (id) on delete set null,
  kind        text not null check (kind in ('create', 'edit', 'delete', 'pickup', 'undo')),
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists athlete_shirt_pickup_log_pickup_idx on public.athlete_shirt_pickup_log (pickup_id, at desc);

alter table public.athlete_shirt_pickups    enable row level security;
alter table public.athlete_shirt_pickup_log enable row level security;
revoke all on public.athlete_shirt_pickups, public.athlete_shirt_pickup_log from anon, authenticated;
grant select on public.athlete_shirt_pickups, public.athlete_shirt_pickup_log to authenticated;
grant select, insert, update, delete on public.athlete_shirt_pickups, public.athlete_shirt_pickup_log to service_role;

drop policy if exists "admin lê retiradas de camisa" on public.athlete_shirt_pickups;
create policy "admin lê retiradas de camisa" on public.athlete_shirt_pickups
  for select to authenticated using (public.is_admin());
drop policy if exists "admin lê histórico de retiradas" on public.athlete_shirt_pickup_log;
create policy "admin lê histórico de retiradas" on public.athlete_shirt_pickup_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Vínculo com o check-in
-- ---------------------------------------------------------------------------

-- Nome comparável: sem acentos, sem espaços extras e em minúsculas.
create or replace function public.shirt_pickup_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    btrim(lower(translate(
      coalesce(p_name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
      'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
    ))),
    '\s+', ' ', 'g'
  )
$$;

-- Atleta de "Documentos" com o mesmo nome na mesma competição (inscrição aprovada).
-- Homônimos: desempata pelo e-mail da inscrição. Sem resultado único, devolve nulo.
create or replace function public.shirt_pickup_match_athlete(p_competition text, p_name text, p_email text)
returns uuid
language sql
stable
set search_path = ''
as $$
  with candidates as (
    select a.id, lower(btrim(r.email)) = lower(btrim(coalesce(p_email, ''))) as same_email
      from public.athletes a
      join public.athlete_registrations r on r.id = a.registration_id
     where r.competition = p_competition
       and r.status = 'aprovado'
       and public.shirt_pickup_name_key(a.full_name) = public.shirt_pickup_name_key(p_name)
  )
  select case
    when (select count(*) from candidates) = 1 then (select id from candidates)
    when (select count(*) from candidates where same_email) = 1 then (select id from candidates where same_email)
  end
$$;

-- Lista do painel: a linha, o atleta vinculado (escolhido ou automático) e a data do check-in dele.
create or replace view public.v_athlete_shirt_pickups with (security_invoker = true) as
select
  p.*,
  l.athlete_id as linked_athlete_id,
  c.signed_at  as checkin_signed_at
from public.athlete_shirt_pickups p
left join lateral (
  select coalesce(p.athlete_id, public.shirt_pickup_match_athlete(p.competition, p.full_name, p.email)) as athlete_id
) l on true
left join public.athlete_checkins c on c.athlete_id = l.athlete_id
where p.deleted_at is null;

revoke all on public.v_athlete_shirt_pickups from anon, authenticated;
grant select on public.v_athlete_shirt_pickups to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Novo atleta (p_id nulo) ou edição. p_fields: competition, team_name, full_name, shirt_size,
-- box, email, phone, athlete_id (vazio = vínculo automático).
-- Equipe em branco vira o nome do atleta (individual).
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_shirt_pickup(p_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_actor    text;
  v_f        jsonb := coalesce(p_fields, '{}'::jsonb);
  v_row      public.athlete_shirt_pickups;
  v_new      jsonb;
  v_changes  jsonb := '{}'::jsonb;
  v_fields   text[] := '{}';
  v_key      text;
  v_id       uuid;
  v_name     text := regexp_replace(btrim(coalesce(v_f ->> 'full_name', '')), '\s+', ' ', 'g');
  v_link     uuid := nullif(btrim(coalesce(v_f ->> 'athlete_id', '')), '')::uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if v_name = '' or btrim(coalesce(v_f ->> 'shirt_size', '')) = '' then
    raise exception 'invalid_fields';
  end if;
  if v_link is not null and not exists (select 1 from public.athletes a where a.id = v_link) then
    raise exception 'invalid_athlete';
  end if;

  -- Valores normalizados, como o banco guarda.
  v_new := jsonb_build_object(
    'competition', btrim(coalesce(v_f ->> 'competition', '')),
    'team_name', coalesce(nullif(regexp_replace(btrim(coalesce(v_f ->> 'team_name', '')), '\s+', ' ', 'g'), ''), v_name),
    'full_name', v_name,
    'shirt_size', upper(regexp_replace(btrim(v_f ->> 'shirt_size'), '\s+', ' ', 'g')),
    'box', nullif(regexp_replace(btrim(coalesce(v_f ->> 'box', '')), '\s+', ' ', 'g'), ''),
    'email', lower(btrim(coalesce(v_f ->> 'email', ''))),
    'phone', nullif(btrim(coalesce(v_f ->> 'phone', '')), ''),
    'athlete_id', v_link
  );

  if v_uid is not null then
    select p.name into v_actor from public.profiles p where p.user_id = v_uid;
  end if;

  if p_id is null then
    v_id := gen_random_uuid();
    insert into public.athlete_shirt_pickups (id, source_key, origin, competition, team_name, full_name, shirt_size, box, email, phone, athlete_id)
    values (
      v_id, 'manual|' || v_id, 'manual',
      v_new ->> 'competition', v_new ->> 'team_name', v_new ->> 'full_name', v_new ->> 'shirt_size',
      v_new ->> 'box', v_new ->> 'email', v_new ->> 'phone', v_link
    );
    insert into public.athlete_shirt_pickup_log (actor_id, actor_name, pickup_id, kind, detail)
    values (v_uid, v_actor, v_id, 'create', v_new - 'athlete_id');
    return jsonb_build_object('status', 'ok', 'id', v_id);
  end if;

  select * into v_row from public.athlete_shirt_pickups where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  foreach v_key in array array['competition', 'team_name', 'full_name', 'shirt_size', 'box', 'email', 'phone', 'athlete_id'] loop
    if (v_new ->> v_key) is distinct from (to_jsonb(v_row) ->> v_key) then
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', to_jsonb(v_row) -> v_key, 'to', v_new -> v_key));
      v_fields := v_fields || v_key;
    end if;
  end loop;
  if v_changes = '{}'::jsonb then
    return jsonb_build_object('status', 'unchanged', 'id', v_row.id);
  end if;

  update public.athlete_shirt_pickups set
    competition = v_new ->> 'competition',
    team_name   = v_new ->> 'team_name',
    full_name   = v_new ->> 'full_name',
    shirt_size  = v_new ->> 'shirt_size',
    box         = v_new ->> 'box',
    email       = v_new ->> 'email',
    phone       = v_new ->> 'phone',
    athlete_id  = v_link,
    admin_edited_fields = array(select distinct f from unnest(admin_edited_fields || v_fields) as f order by f)
  where id = v_row.id;

  insert into public.athlete_shirt_pickup_log (actor_id, actor_name, pickup_id, kind, detail)
  values (v_uid, v_actor, v_row.id, 'edit', jsonb_build_object('changes', v_changes));

  return jsonb_build_object('status', 'ok', 'id', v_row.id, 'fields', to_jsonb(v_fields));
end;
$$;

-- ---------------------------------------------------------------------------
-- Excluir da lista: só camisa pendente. A linha fica marcada (a importação não a recria).
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_shirt_pickup(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_actor  text;
  v_row    public.athlete_shirt_pickups;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_row from public.athlete_shirt_pickups where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_row.picked_up_at is not null then
    return jsonb_build_object('status', 'picked_up');
  end if;

  update public.athlete_shirt_pickups set deleted_at = now() where id = v_row.id;

  if v_uid is not null then
    select p.name into v_actor from public.profiles p where p.user_id = v_uid;
  end if;
  insert into public.athlete_shirt_pickup_log (actor_id, actor_name, pickup_id, kind, detail)
  values (v_uid, v_actor, v_row.id, 'delete', jsonb_build_object(
    'full_name', v_row.full_name,
    'team_name', v_row.team_name,
    'competition', v_row.competition,
    'shirt_size', v_row.shirt_size
  ));

  return jsonb_build_object('status', 'ok', 'name', v_row.full_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirmar retirada de uma ou mais camisas da mesma inscrição, numa transação.
-- p_pickup: primary_id (atleta no balcão), self (o próprio atleta retira), name e document
-- (quando é outra pessoa), delivered_size (tamanho entregue ao atleta principal), note.
-- Recusa camisa já retirada e atleta sem check-in (ou sem cadastro em "Documentos").
-- ---------------------------------------------------------------------------
create or replace function public.admin_confirm_shirt_pickup(p_ids uuid[], p_pickup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_actor    text;
  v_p        jsonb := coalesce(p_pickup, '{}'::jsonb);
  v_primary  uuid := nullif(btrim(coalesce(v_p ->> 'primary_id', '')), '')::uuid;
  v_self     boolean := coalesce((v_p ->> 'self')::boolean, false);
  v_by       text;
  v_doc      text;
  v_note     text := nullif(left(btrim(coalesce(v_p ->> 'note', '')), 300), '');
  v_size     text := nullif(upper(left(btrim(coalesce(v_p ->> 'delivered_size', '')), 12)), '');
  v_main     public.athlete_shirt_pickups;
  v_row      public.athlete_shirt_pickups;
  v_count    integer;
  v_link     uuid;
  v_taken    jsonb := '[]'::jsonb;
  v_blocked  jsonb := '[]'::jsonb;
  v_batch    uuid := gen_random_uuid();
  v_now      timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 20
     or v_primary is null or not (v_primary = any (p_ids)) then
    raise exception 'invalid_batch';
  end if;

  -- Trava as linhas em ordem fixa: duas confirmações simultâneas não se cruzam.
  select count(*) into v_count from (
    select 1 from public.athlete_shirt_pickups
     where id = any (p_ids) and deleted_at is null
     order by id
       for update
  ) locked;
  if v_count <> (select count(distinct x) from unnest(p_ids) as x) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_main from public.athlete_shirt_pickups where id = v_primary;

  for v_row in select * from public.athlete_shirt_pickups where id = any (p_ids) order by full_name loop
    if v_row.competition <> v_main.competition
       or public.shirt_pickup_name_key(v_row.team_name) <> public.shirt_pickup_name_key(v_main.team_name) then
      raise exception 'invalid_batch';
    end if;
    if v_row.picked_up_at is not null then
      v_taken := v_taken || jsonb_build_object(
        'id', v_row.id, 'name', v_row.full_name, 'by', v_row.delivered_by_name, 'at', v_row.picked_up_at
      );
      continue;
    end if;
    v_link := coalesce(v_row.athlete_id, public.shirt_pickup_match_athlete(v_row.competition, v_row.full_name, v_row.email));
    if v_link is null then
      v_blocked := v_blocked || jsonb_build_object('id', v_row.id, 'name', v_row.full_name, 'reason', 'sem_cadastro');
    elsif not exists (select 1 from public.athlete_checkins c where c.athlete_id = v_link) then
      v_blocked := v_blocked || jsonb_build_object('id', v_row.id, 'name', v_row.full_name, 'reason', 'sem_checkin');
    end if;
  end loop;
  if jsonb_array_length(v_taken) > 0 then
    return jsonb_build_object('status', 'already', 'items', v_taken);
  end if;
  if jsonb_array_length(v_blocked) > 0 then
    return jsonb_build_object('status', 'blocked', 'items', v_blocked);
  end if;

  if v_self then
    v_by := v_main.full_name;
  else
    v_by := left(regexp_replace(btrim(coalesce(v_p ->> 'name', '')), '\s+', ' ', 'g'), 120);
    v_doc := nullif(left(btrim(coalesce(v_p ->> 'document', '')), 40), '');
  end if;
  if v_by = '' then
    raise exception 'name_required';
  end if;

  if v_uid is not null then
    select p.name into v_actor from public.profiles p where p.user_id = v_uid;
  end if;

  for v_row in
    update public.athlete_shirt_pickups set
      picked_up_at       = v_now,
      delivered_size     = case when id = v_primary then coalesce(v_size, shirt_size) else shirt_size end,
      picked_by_name     = v_by,
      picked_by_self     = (v_self and id = v_primary),
      picked_by_document = v_doc,
      pickup_note        = v_note,
      delivered_by       = v_uid,
      delivered_by_name  = v_actor,
      pickup_batch       = v_batch,
      email_sent_at      = null
    where id = any (p_ids)
    returning *
  loop
    insert into public.athlete_shirt_pickup_log (actor_id, actor_name, pickup_id, kind, detail)
    values (v_uid, v_actor, v_row.id, 'pickup', jsonb_build_object(
      'full_name', v_row.full_name,
      'delivered_size', v_row.delivered_size,
      'picked_by_name', v_row.picked_by_name,
      'picked_by_self', v_row.picked_by_self,
      'picked_by_document', v_row.picked_by_document,
      'batch', v_batch
    ));
  end loop;

  return jsonb_build_object('status', 'ok', 'batch', v_batch, 'count', cardinality(p_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- Desfazer retirada: a camisa volta para pendente. O histórico guarda o que foi desfeito.
-- ---------------------------------------------------------------------------
create or replace function public.admin_undo_shirt_pickup(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_actor  text;
  v_row    public.athlete_shirt_pickups;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_row from public.athlete_shirt_pickups where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_row.picked_up_at is null then
    return jsonb_build_object('status', 'none');
  end if;

  update public.athlete_shirt_pickups set
    picked_up_at = null, delivered_size = null, picked_by_name = null, picked_by_self = null,
    picked_by_document = null, pickup_note = null, delivered_by = null, delivered_by_name = null,
    pickup_batch = null, email_sent_at = null
  where id = v_row.id;

  if v_uid is not null then
    select p.name into v_actor from public.profiles p where p.user_id = v_uid;
  end if;
  insert into public.athlete_shirt_pickup_log (actor_id, actor_name, pickup_id, kind, detail)
  values (v_uid, v_actor, v_row.id, 'undo', jsonb_build_object(
    'full_name', v_row.full_name,
    'picked_up_at', v_row.picked_up_at,
    'delivered_size', v_row.delivered_size,
    'picked_by_name', v_row.picked_by_name,
    'delivered_by_name', v_row.delivered_by_name
  ));

  return jsonb_build_object('status', 'ok', 'name', v_row.full_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- Marca o envio do e-mail da retirada (chamado depois que o provedor aceitou a mensagem).
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_shirt_pickup_emailed(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  update public.athlete_shirt_pickups set email_sent_at = now()
   where id = any (coalesce(p_ids, '{}')) and picked_up_at is not null and deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_save_shirt_pickup(uuid, jsonb) from public, anon;
revoke all on function public.admin_delete_shirt_pickup(uuid) from public, anon;
revoke all on function public.admin_confirm_shirt_pickup(uuid[], jsonb) from public, anon;
revoke all on function public.admin_undo_shirt_pickup(uuid) from public, anon;
revoke all on function public.admin_mark_shirt_pickup_emailed(uuid[]) from public, anon;
revoke all on function public.shirt_pickup_match_athlete(text, text, text) from public, anon;
grant execute on function public.admin_save_shirt_pickup(uuid, jsonb) to authenticated, service_role;
grant execute on function public.admin_delete_shirt_pickup(uuid) to authenticated, service_role;
grant execute on function public.admin_confirm_shirt_pickup(uuid[], jsonb) to authenticated, service_role;
grant execute on function public.admin_undo_shirt_pickup(uuid) to authenticated, service_role;
grant execute on function public.admin_mark_shirt_pickup_emailed(uuid[]) to authenticated, service_role;
grant execute on function public.shirt_pickup_match_athlete(text, text, text) to authenticated, service_role;
grant execute on function public.shirt_pickup_name_key(text) to authenticated, service_role;

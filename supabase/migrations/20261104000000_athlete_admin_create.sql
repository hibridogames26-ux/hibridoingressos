-- Admin: novo cadastro, excluir cadastro manual e check-in presencial (Story 4.5).
-- Só admin ativo (public.is_admin()). As funções rodam com a sessão do admin para registrar quem fez.

-- ---------------------------------------------------------------------------
-- Origem da inscrição: a importação das planilhas não cancela nem altera cadastros manuais.
-- ---------------------------------------------------------------------------
alter table public.athlete_registrations
  add column if not exists origin text not null default 'planilha';
alter table public.athlete_registrations drop constraint if exists athlete_registrations_origin_check;
alter table public.athlete_registrations
  add constraint athlete_registrations_origin_check check (origin in ('planilha', 'manual'));

-- ---------------------------------------------------------------------------
-- Check-in registrado presencialmente pelo admin (sem código por e-mail).
-- ---------------------------------------------------------------------------
alter table public.athlete_checkins add column if not exists recorded_by uuid;
alter table public.athlete_checkins add column if not exists recorded_by_name text;

-- ---------------------------------------------------------------------------
-- Histórico: criação, exclusão e check-in presencial.
-- ---------------------------------------------------------------------------
alter table public.athlete_audit_log drop constraint if exists athlete_audit_log_kind_check;
alter table public.athlete_audit_log
  add constraint athlete_audit_log_kind_check check (kind in ('edit', 'reset', 'create', 'delete', 'checkin'));

-- Nome comparável: sem espaços extras e em minúsculas.
create or replace function public.athlete_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$ select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')) $$;

-- ---------------------------------------------------------------------------
-- Novo cadastro: a inscrição e os atletas (1 no individual, 2 na dupla) numa transação.
-- p_registration: competition, category, team_name, kind, email, phone, box.
-- p_athletes: [{ full_name, instagram, shirt_size }], na ordem dos integrantes.
-- Recusa atleta com o mesmo nome e o mesmo e-mail de inscrição na mesma competição.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_registration(p_registration jsonb, p_athletes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_name      text;
  v_r         jsonb := coalesce(p_registration, '{}'::jsonb);
  v_list      jsonb := coalesce(p_athletes, '[]'::jsonb);
  v_reg       uuid := gen_random_uuid();
  v_comp      text;
  v_kind      text;
  v_email     text;
  v_count     integer;
  v_item      jsonb;
  v_pos       integer := 0;
  v_athlete   uuid;
  v_ids       uuid[] := '{}';
  v_names     text[] := '{}';
  v_dup       uuid;
  v_full      text;
  clean       text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  v_comp  := btrim(coalesce(v_r ->> 'competition', ''));
  v_kind  := btrim(coalesce(v_r ->> 'kind', ''));
  v_email := lower(btrim(coalesce(v_r ->> 'email', '')));
  if jsonb_typeof(v_list) <> 'array' then
    raise exception 'invalid_athletes';
  end if;
  v_count := jsonb_array_length(v_list);
  if (v_kind = 'individual' and v_count <> 1) or (v_kind = 'dupla' and v_count <> 2) then
    raise exception 'invalid_athletes';
  end if;

  -- Duplicidade (antes de gravar qualquer coisa).
  for v_item in select value from jsonb_array_elements(v_list) loop
    v_full := regexp_replace(btrim(coalesce(v_item ->> 'full_name', '')), '\s+', ' ', 'g');
    if v_full = '' then
      raise exception 'invalid_athletes';
    end if;
    select a.id into v_dup
      from public.athletes a
      join public.athlete_registrations r on r.id = a.registration_id
     where r.competition = v_comp
       and r.status = 'aprovado'
       and lower(btrim(r.email)) = v_email
       and public.athlete_name_key(a.full_name) = public.athlete_name_key(v_full)
     limit 1;
    if found then
      return jsonb_build_object('status', 'duplicate', 'athlete_id', v_dup, 'name', v_full);
    end if;
  end loop;

  insert into public.athlete_registrations (id, source_key, competition, category, team_name, kind, email, phone, box, origin)
  values (
    v_reg,
    'manual|' || v_reg,
    v_comp,
    regexp_replace(btrim(coalesce(v_r ->> 'category', '')), '\s+', ' ', 'g'),
    regexp_replace(btrim(coalesce(v_r ->> 'team_name', '')), '\s+', ' ', 'g'),
    v_kind,
    v_email,
    nullif(btrim(coalesce(v_r ->> 'phone', '')), ''),
    nullif(regexp_replace(btrim(coalesce(v_r ->> 'box', '')), '\s+', ' ', 'g'), ''),
    'manual'
  );

  for v_item in select value from jsonb_array_elements(v_list) loop
    v_pos := v_pos + 1;
    clean := regexp_replace(btrim(v_item ->> 'full_name'), '\s+', ' ', 'g');
    insert into public.athletes (registration_id, source_key, full_name, instagram, shirt_size, position)
    values (
      v_reg,
      'manual|' || v_reg || '|' || v_pos,
      clean,
      nullif(btrim(coalesce(v_item ->> 'instagram', '')), ''),
      nullif(upper(btrim(coalesce(v_item ->> 'shirt_size', ''))), ''),
      v_pos
    )
    returning id into v_athlete;
    v_ids := v_ids || v_athlete;
    v_names := v_names || clean;
  end loop;

  if v_uid is not null then
    select p.name into v_name from public.profiles p where p.user_id = v_uid;
  end if;
  insert into public.athlete_audit_log (actor_id, actor_name, athlete_id, registration_id, kind, detail)
  values (v_uid, v_name, v_ids[1], v_reg, 'create', jsonb_build_object(
    'athletes', to_jsonb(v_names),
    'competition', v_comp,
    'kind', v_kind
  ));

  return jsonb_build_object('status', 'ok', 'registration_id', v_reg, 'athlete_ids', to_jsonb(v_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- Excluir cadastro manual: a inscrição inteira (os dois da dupla), só sem check-in e sem termo arquivado.
-- Inscrições da planilha não são excluídas: a importação as recriaria (use "Situação: Cancelada").
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_registration(p_registration uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  v_reg    public.athlete_registrations;
  v_names  text[];
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_reg from public.athlete_registrations where id = p_registration for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_reg.origin <> 'manual' then
    return jsonb_build_object('status', 'not_manual');
  end if;

  perform 1 from public.athletes where registration_id = v_reg.id for update;
  if exists (
    select 1 from public.athletes a
     where a.registration_id = v_reg.id
       and (exists (select 1 from public.athlete_checkins c where c.athlete_id = a.id)
         or exists (select 1 from public.athlete_checkins_archive x where x.athlete_id = a.id))
  ) then
    return jsonb_build_object('status', 'has_documents');
  end if;

  select coalesce(array_agg(a.full_name order by a.position), '{}') into v_names
    from public.athletes a where a.registration_id = v_reg.id;

  delete from public.athlete_registrations where id = v_reg.id;

  if v_uid is not null then
    select p.name into v_name from public.profiles p where p.user_id = v_uid;
  end if;
  insert into public.athlete_audit_log (actor_id, actor_name, athlete_id, registration_id, kind, detail)
  values (v_uid, v_name, null, null, 'delete', jsonb_build_object(
    'registration_id', v_reg.id,
    'athletes', to_jsonb(v_names),
    'team_name', v_reg.team_name,
    'competition', v_reg.competition,
    'category', v_reg.category,
    'email', v_reg.email
  ));

  return jsonb_build_object('status', 'ok', 'athletes', to_jsonb(v_names));
end;
$$;

revoke all on function public.admin_create_registration(jsonb, jsonb) from public, anon;
revoke all on function public.admin_delete_registration(uuid) from public, anon;
grant execute on function public.admin_create_registration(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.admin_delete_registration(uuid) to authenticated, service_role;
grant execute on function public.athlete_name_key(text) to authenticated, service_role;

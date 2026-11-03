-- Admin: editar cadastro do atleta e refazer check-in (Story 4.4).
-- Só admin ativo (public.is_admin()). As funções rodam com a sessão do admin para registrar
-- quem fez a alteração. O termo de um check-in refeito vai para o arquivo; nada é apagado.

-- ---------------------------------------------------------------------------
-- Campos corrigidos no painel: a importação das planilhas não os sobrescreve.
-- ---------------------------------------------------------------------------
alter table public.athlete_registrations add column if not exists admin_edited_fields text[] not null default '{}';
alter table public.athletes              add column if not exists admin_edited_fields text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Histórico (só leitura para o admin; gravado pelas funções abaixo)
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_audit_log (
  id               bigint generated always as identity primary key,
  at               timestamptz not null default now(),
  actor_id         uuid,
  actor_name       text,
  athlete_id       uuid references public.athletes (id) on delete set null,
  registration_id  uuid references public.athlete_registrations (id) on delete set null,
  kind             text not null check (kind in ('edit', 'reset')),
  detail           jsonb not null default '{}'::jsonb
);
create index if not exists athlete_audit_log_athlete_idx on public.athlete_audit_log (athlete_id, at desc);
create index if not exists athlete_audit_log_registration_idx on public.athlete_audit_log (registration_id, at desc);

-- ---------------------------------------------------------------------------
-- Termos arquivados: snapshot completo da linha de athlete_checkins (os arquivos continuam no Storage).
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_checkins_archive (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references public.athletes (id) on delete restrict,
  checkin           jsonb not null,
  signed_at         timestamptz not null,
  reason            text not null check (reason in ('dados', 'atestado', 'assinatura', 'outro')),
  reason_note       text,
  archived_by       uuid,
  archived_by_name  text,
  archived_at       timestamptz not null default now(),
  constraint athlete_checkins_archive_note_when_other
    check (reason <> 'outro' or btrim(coalesce(reason_note, '')) <> '')
);
create index if not exists athlete_checkins_archive_athlete_idx on public.athlete_checkins_archive (athlete_id, archived_at desc);

alter table public.athlete_audit_log        enable row level security;
alter table public.athlete_checkins_archive enable row level security;
revoke all on public.athlete_audit_log, public.athlete_checkins_archive from anon, authenticated;
grant select on public.athlete_audit_log, public.athlete_checkins_archive to authenticated;
grant select, insert, update, delete on public.athlete_audit_log, public.athlete_checkins_archive to service_role;

drop policy if exists "admin lê histórico de atletas" on public.athlete_audit_log;
create policy "admin lê histórico de atletas" on public.athlete_audit_log
  for select to authenticated using (public.is_admin());
drop policy if exists "admin lê termos arquivados" on public.athlete_checkins_archive;
create policy "admin lê termos arquivados" on public.athlete_checkins_archive
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Editar cadastro. Recebe só os campos enviados pelo painel; grava o que mudou (de → para),
-- marca os campos como editados e registra no histórico.
-- Atleta: full_name, instagram, shirt_size. Inscrição: email, phone, team_name, box,
-- competition, category, status. O tipo (dupla/individual) não muda por aqui.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_athlete(p_athlete uuid, p_athlete_fields jsonb, p_registration_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_name      text;
  v_athlete   public.athletes;
  v_reg       public.athlete_registrations;
  v_a         jsonb := coalesce(p_athlete_fields, '{}'::jsonb);
  v_r         jsonb := coalesce(p_registration_fields, '{}'::jsonb);
  v_changes   jsonb := '{}'::jsonb;
  v_a_fields  text[] := '{}';
  v_r_fields  text[] := '{}';
  v_key       text;
  v_old       text;
  v_new       text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_reg from public.athlete_registrations where id = v_athlete.registration_id for update;

  foreach v_key in array array['full_name', 'instagram', 'shirt_size'] loop
    if v_a ? v_key then
      v_new := nullif(regexp_replace(btrim(coalesce(v_a ->> v_key, '')), '\s+', ' ', 'g'), '');
      v_old := to_jsonb(v_athlete) ->> v_key;
      if v_new is distinct from v_old then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old, 'to', v_new));
        v_a_fields := v_a_fields || v_key;
      end if;
    end if;
  end loop;

  foreach v_key in array array['email', 'phone', 'team_name', 'box', 'competition', 'category', 'status'] loop
    if v_r ? v_key then
      v_new := nullif(regexp_replace(btrim(coalesce(v_r ->> v_key, '')), '\s+', ' ', 'g'), '');
      if v_key = 'email' then
        v_new := lower(v_new);
      end if;
      v_old := to_jsonb(v_reg) ->> v_key;
      if v_new is distinct from v_old then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old, 'to', v_new));
        v_r_fields := v_r_fields || v_key;
      end if;
    end if;
  end loop;

  if v_changes = '{}'::jsonb then
    return jsonb_build_object('status', 'unchanged');
  end if;

  if cardinality(v_a_fields) > 0 then
    update public.athletes set
      full_name  = case when 'full_name' = any (v_a_fields) then (v_changes -> 'full_name' ->> 'to') else full_name end,
      instagram  = case when 'instagram' = any (v_a_fields) then (v_changes -> 'instagram' ->> 'to') else instagram end,
      shirt_size = case when 'shirt_size' = any (v_a_fields) then (v_changes -> 'shirt_size' ->> 'to') else shirt_size end,
      admin_edited_fields = array(select distinct f from unnest(admin_edited_fields || v_a_fields) as f order by f)
    where id = v_athlete.id;
  end if;

  if cardinality(v_r_fields) > 0 then
    update public.athlete_registrations set
      email       = case when 'email' = any (v_r_fields) then (v_changes -> 'email' ->> 'to') else email end,
      phone       = case when 'phone' = any (v_r_fields) then (v_changes -> 'phone' ->> 'to') else phone end,
      team_name   = case when 'team_name' = any (v_r_fields) then (v_changes -> 'team_name' ->> 'to') else team_name end,
      box         = case when 'box' = any (v_r_fields) then (v_changes -> 'box' ->> 'to') else box end,
      competition = case when 'competition' = any (v_r_fields) then (v_changes -> 'competition' ->> 'to') else competition end,
      category    = case when 'category' = any (v_r_fields) then (v_changes -> 'category' ->> 'to') else category end,
      status      = case when 'status' = any (v_r_fields) then (v_changes -> 'status' ->> 'to') else status end,
      admin_edited_fields = array(select distinct f from unnest(admin_edited_fields || v_r_fields) as f order by f)
    where id = v_reg.id;
  end if;

  if v_uid is not null then
    select p.name into v_name from public.profiles p where p.user_id = v_uid;
  end if;
  insert into public.athlete_audit_log (actor_id, actor_name, athlete_id, registration_id, kind, detail)
  values (v_uid, v_name, v_athlete.id, v_reg.id, 'edit', jsonb_build_object('changes', v_changes));

  return jsonb_build_object(
    'status', 'ok',
    'fields', to_jsonb(v_a_fields || v_r_fields)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Refazer check-in: arquiva o termo, libera o atleta e registra o motivo.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_athlete_checkin(p_athlete uuid, p_reason text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text;
  v_checkin  public.athlete_checkins;
  v_reg      uuid;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_archive  uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if p_reason is null or p_reason not in ('dados', 'atestado', 'assinatura', 'outro') then
    raise exception 'invalid_reason';
  end if;
  if p_reason = 'outro' and v_note is null then
    raise exception 'note_required';
  end if;

  select registration_id into v_reg from public.athletes where id = p_athlete for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_checkin from public.athlete_checkins where athlete_id = p_athlete for update;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  if v_uid is not null then
    select p.name into v_name from public.profiles p where p.user_id = v_uid;
  end if;

  insert into public.athlete_checkins_archive (athlete_id, checkin, signed_at, reason, reason_note, archived_by, archived_by_name)
  values (p_athlete, to_jsonb(v_checkin), v_checkin.signed_at, p_reason, left(v_note, 500), v_uid, v_name)
  returning id into v_archive;

  delete from public.athlete_checkins where id = v_checkin.id;

  insert into public.athlete_audit_log (actor_id, actor_name, athlete_id, registration_id, kind, detail)
  values (v_uid, v_name, p_athlete, v_reg, 'reset', jsonb_build_object(
    'reason', p_reason,
    'note', left(v_note, 500),
    'signed_at', v_checkin.signed_at,
    'archive_id', v_archive
  ));

  return jsonb_build_object('status', 'ok', 'archive_id', v_archive);
end;
$$;

revoke all on function public.admin_update_athlete(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.admin_reset_athlete_checkin(uuid, text, text) from public, anon;
grant execute on function public.admin_update_athlete(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.admin_reset_athlete_checkin(uuid, text, text) to authenticated, service_role;

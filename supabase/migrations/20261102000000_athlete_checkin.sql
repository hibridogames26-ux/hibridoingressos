-- Check-in do atleta (Story 4.1).
-- Inscrições importadas das planilhas da plataforma de inscrição; o atleta confirma presença
-- com código enviado ao e-mail da inscrição, preenche o PAR-Q/termo, assina e anexa o atestado.
-- Dados pessoais e de saúde: sem acesso para anon/authenticated. Tudo passa pelo servidor
-- (service role); admin ativo só lê.

-- ---------------------------------------------------------------------------
-- Inscrições (equipe ou atleta individual) e integrantes
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_registrations (
  id             uuid primary key default gen_random_uuid(),
  -- Chave estável da planilha (competição + inscrição + e-mail): a importação é idempotente.
  source_key     text not null unique,
  competition    text not null check (competition in ('hibrido-games', 'hibrido-race')),
  category       text not null check (btrim(category) <> ''),
  team_name      text not null check (btrim(team_name) <> ''),
  kind           text not null check (kind in ('dupla', 'individual')),
  -- E-mail da inscrição: nas duplas, os dois integrantes compartilham o do responsável.
  email          text not null check (position('@' in email) > 1),
  phone          text,
  box            text,
  status         text not null default 'aprovado' check (status in ('aprovado', 'cancelado')),
  registered_on  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists athlete_registrations_status_idx on public.athlete_registrations (status, competition);

drop trigger if exists athlete_registrations_touch on public.athlete_registrations;
create trigger athlete_registrations_touch before update on public.athlete_registrations
  for each row execute function public.touch_updated_at();

create table if not exists public.athletes (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null references public.athlete_registrations (id) on delete cascade,
  source_key       text not null unique,
  full_name        text not null check (btrim(full_name) <> ''),
  instagram        text,
  shirt_size       text,
  position         smallint not null default 1 check (position between 1 and 10),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists athletes_registration_idx on public.athletes (registration_id, position);

drop trigger if exists athletes_touch on public.athletes;
create trigger athletes_touch before update on public.athletes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Código de confirmação por e-mail. Só o hash é guardado; a verificação abre uma
-- sessão curta (hash do cookie) que autoriza o envio do termo.
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_checkin_codes (
  id                  uuid primary key default gen_random_uuid(),
  athlete_id          uuid not null references public.athletes (id) on delete cascade,
  email               text not null,
  code_hash           text not null,
  expires_at          timestamptz not null,
  attempts            smallint not null default 0,
  verified_at         timestamptz,
  session_hash        text unique,
  session_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  constraint athlete_checkin_codes_session_needs_verify
    check (session_hash is null or verified_at is not null)
);
create index if not exists athlete_checkin_codes_athlete_idx on public.athlete_checkin_codes (athlete_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Check-in: termo assinado, um por atleta. Snapshot do texto aceito.
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_checkins (
  id                       uuid primary key default gen_random_uuid(),
  athlete_id               uuid not null unique references public.athletes (id) on delete restrict,
  terms_version            text not null,
  terms_text               text not null,
  full_name                text not null,
  birth_date               date not null,
  phone                    text not null,
  email                    text not null,
  emergency_name           text not null,
  emergency_phone          text not null,
  competition              text not null,
  category                 text not null,
  -- 10 respostas do PAR-Q, na ordem do termo (true = Sim).
  parq                     jsonb not null check (jsonb_typeof(parq) = 'array' and jsonb_array_length(parq) = 10),
  parq_any_yes             boolean not null,
  image_consent            boolean not null,
  is_minor                 boolean not null,
  guardian_name            text,
  guardian_relation        text,
  guardian_phone           text,
  place                    text not null,
  signature_path           text not null,
  guardian_signature_path  text,
  certificate_path         text not null,
  certificate_name         text,
  certificate_type         text,
  certificate_size         integer,
  verified_email           text not null,
  ip                       text,
  user_agent               text,
  signed_at                timestamptz not null default now(),
  constraint athlete_checkins_guardian_when_minor check (
    not is_minor or (
      btrim(coalesce(guardian_name, '')) <> ''
      and btrim(coalesce(guardian_relation, '')) <> ''
      and btrim(coalesce(guardian_phone, '')) <> ''
      and guardian_signature_path is not null
    )
  )
);
create index if not exists athlete_checkins_signed_idx on public.athlete_checkins (signed_at desc);

-- ---------------------------------------------------------------------------
-- RLS: nada para anon/authenticated, exceto leitura por admin ativo.
-- ---------------------------------------------------------------------------
alter table public.athlete_registrations enable row level security;
alter table public.athletes              enable row level security;
alter table public.athlete_checkin_codes enable row level security;
alter table public.athlete_checkins      enable row level security;

revoke all on public.athlete_registrations, public.athletes, public.athlete_checkin_codes, public.athlete_checkins
  from anon, authenticated;
grant select on public.athlete_registrations, public.athletes, public.athlete_checkins to authenticated;
-- Explícito: projetos novos do Supabase não concedem mais acesso automático às tabelas de public.
grant select, insert, update, delete
  on public.athlete_registrations, public.athletes, public.athlete_checkin_codes, public.athlete_checkins
  to service_role;

drop policy if exists "admin lê inscrições de atletas" on public.athlete_registrations;
create policy "admin lê inscrições de atletas" on public.athlete_registrations
  for select to authenticated using (public.is_admin());
drop policy if exists "admin lê atletas" on public.athletes;
create policy "admin lê atletas" on public.athletes
  for select to authenticated using (public.is_admin());
drop policy if exists "admin lê check-ins" on public.athlete_checkins;
create policy "admin lê check-ins" on public.athlete_checkins
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RPCs (só service role): emissão e verificação do código sob lock do atleta.
-- ---------------------------------------------------------------------------

-- Regras: inscrição aprovada, atleta sem check-in, reenvio após 60 s, até 5 códigos por hora.
-- Invalida códigos anteriores ainda não verificados. Retorna o status e o e-mail de destino.
create or replace function public.issue_checkin_code(p_athlete uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email      text;
  v_status     text;
  v_last       timestamptz;
  v_recent     integer;
begin
  select r.email, r.status into v_email, v_status
    from public.athletes a
    join public.athlete_registrations r on r.id = a.registration_id
   where a.id = p_athlete
     for update of a;
  if not found or v_status <> 'aprovado' then
    return jsonb_build_object('status', 'not_found');
  end if;

  if exists (select 1 from public.athlete_checkins c where c.athlete_id = p_athlete) then
    return jsonb_build_object('status', 'done');
  end if;

  select max(created_at), count(*) filter (where created_at > now() - interval '1 hour')
    into v_last, v_recent
    from public.athlete_checkin_codes
   where athlete_id = p_athlete;

  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object(
      'status', 'cooldown',
      'wait', greatest(1, ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::int)
    );
  end if;
  if v_recent >= 5 then
    return jsonb_build_object('status', 'limit');
  end if;

  update public.athlete_checkin_codes
     set expires_at = least(expires_at, now())
   where athlete_id = p_athlete and verified_at is null and expires_at > now();

  insert into public.athlete_checkin_codes (athlete_id, email, code_hash, expires_at)
  values (p_athlete, v_email, p_code_hash, now() + interval '10 minutes');

  return jsonb_build_object('status', 'ok', 'email', v_email);
end;
$$;

-- Confere o código mais recente: até 5 tentativas, válido por 10 min. Acertou: abre sessão de 2 h.
create or replace function public.verify_checkin_code(p_athlete uuid, p_code_hash text, p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.athlete_checkin_codes;
begin
  select * into v_code
    from public.athlete_checkin_codes
   where athlete_id = p_athlete and verified_at is null
   order by created_at desc
   limit 1
     for update;

  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  if v_code.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_code.attempts >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;

  if v_code.code_hash = p_code_hash then
    update public.athlete_checkin_codes
       set verified_at = now(),
           session_hash = p_session_hash,
           session_expires_at = now() + interval '2 hours'
     where id = v_code.id;
    return jsonb_build_object('status', 'ok', 'email', v_code.email);
  end if;

  update public.athlete_checkin_codes set attempts = attempts + 1 where id = v_code.id;
  if v_code.attempts + 1 >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;
  return jsonb_build_object('status', 'invalid', 'remaining', 5 - (v_code.attempts + 1));
end;
$$;

revoke all on function public.issue_checkin_code(uuid, text) from public, anon, authenticated;
revoke all on function public.verify_checkin_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.issue_checkin_code(uuid, text) to service_role;
grant execute on function public.verify_checkin_code(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Storage privado para assinaturas e atestados (ausente em bancos sem Storage, como nos testes).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'checkin-docs', 'checkin-docs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
      )
      on conflict (id) do update
        set public = false,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types
    $sql$;
  end if;
end $$;

-- Check-in pelo e-mail da inscrição (Story 4.3).
-- A página pública deixa de listar atletas: o atleta digita o e-mail da inscrição, recebe um
-- código e só então vê os atletas das inscrições daquele e-mail. O acesso de uma sessão a um
-- atleta é sempre conferido contra o e-mail atual da inscrição (trocar o e-mail no admin
-- encerra o acesso do e-mail antigo àquela inscrição).
-- Tudo passa pelo servidor com service role; anon/authenticated não leem nada.

-- ---------------------------------------------------------------------------
-- Código e sessão por e-mail (só hashes)
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_email_codes (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null check (position('@' in email) > 1 and email = lower(btrim(email))),
  code_hash           text not null,
  expires_at          timestamptz not null,
  attempts            smallint not null default 0,
  verified_at         timestamptz,
  session_hash        text unique,
  session_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  constraint athlete_email_codes_session_needs_verify
    check (session_hash is null or verified_at is not null)
);
create index if not exists athlete_email_codes_email_idx on public.athlete_email_codes (email, created_at desc);

-- E-mails não encontrados por IP: limita a consulta de quem está inscrito.
create table if not exists public.athlete_email_misses (
  id  bigint generated always as identity primary key,
  ip  text not null,
  at  timestamptz not null default now()
);
create index if not exists athlete_email_misses_ip_idx on public.athlete_email_misses (ip, at desc);

alter table public.athlete_email_codes  enable row level security;
alter table public.athlete_email_misses enable row level security;
revoke all on public.athlete_email_codes, public.athlete_email_misses from anon, authenticated;
grant select, insert, update, delete on public.athlete_email_codes, public.athlete_email_misses to service_role;

-- E-mail usado nas comparações com a inscrição.
create index if not exists athlete_registrations_email_idx on public.athlete_registrations (lower(btrim(email)));

-- ---------------------------------------------------------------------------
-- Emissão do código. Regras: até 10 e-mails não encontrados por hora por IP; e-mail com
-- inscrição aprovada e atleta pendente; reenvio após 60 s; até 5 códigos por hora por e-mail.
-- Invalida códigos anteriores ainda não verificados.
-- ---------------------------------------------------------------------------
create or replace function public.issue_checkin_email_code(p_email text, p_code_hash text, p_ip text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_ip       text := nullif(btrim(coalesce(p_ip, '')), '');
  v_misses   integer;
  v_total    integer;
  v_pending  integer;
  v_last     timestamptz;
  v_recent   integer;
begin
  if v_ip is not null then
    perform pg_advisory_xact_lock(hashtext('checkin-ip:' || v_ip));
    select count(*) into v_misses
      from public.athlete_email_misses
     where ip = v_ip and at > now() - interval '1 hour';
    if v_misses >= 10 then
      return jsonb_build_object('status', 'ip_limit');
    end if;
  end if;

  select count(a.id), count(a.id) filter (where c.id is null)
    into v_total, v_pending
    from public.athlete_registrations r
    join public.athletes a on a.registration_id = r.id
    left join public.athlete_checkins c on c.athlete_id = a.id
   where lower(btrim(r.email)) = v_email
     and r.status = 'aprovado';

  if position('@' in v_email) < 2 or v_total = 0 then
    if v_ip is not null then
      insert into public.athlete_email_misses (ip) values (v_ip);
      delete from public.athlete_email_misses where at < now() - interval '1 day';
    end if;
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_pending = 0 then
    return jsonb_build_object('status', 'done');
  end if;

  perform pg_advisory_xact_lock(hashtext('checkin-email:' || v_email));

  select max(created_at), count(*) filter (where created_at > now() - interval '1 hour')
    into v_last, v_recent
    from public.athlete_email_codes
   where email = v_email;

  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object(
      'status', 'cooldown',
      'wait', greatest(1, ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::int)
    );
  end if;
  if v_recent >= 5 then
    return jsonb_build_object('status', 'limit');
  end if;

  update public.athlete_email_codes
     set expires_at = least(expires_at, now())
   where email = v_email and verified_at is null and expires_at > now();

  insert into public.athlete_email_codes (email, code_hash, expires_at)
  values (v_email, p_code_hash, now() + interval '10 minutes');

  return jsonb_build_object('status', 'ok', 'email', v_email);
end;
$$;

-- Confere o código mais recente do e-mail: até 5 tentativas, válido por 10 min. Acertou: sessão de 2 h.
create or replace function public.verify_checkin_email_code(p_email text, p_code_hash text, p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_code  public.athlete_email_codes;
begin
  select * into v_code
    from public.athlete_email_codes
   where email = v_email and verified_at is null
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
    update public.athlete_email_codes
       set verified_at = now(),
           session_hash = p_session_hash,
           session_expires_at = now() + interval '2 hours'
     where id = v_code.id;
    return jsonb_build_object('status', 'ok', 'email', v_email);
  end if;

  update public.athlete_email_codes set attempts = attempts + 1 where id = v_code.id;
  if v_code.attempts + 1 >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;
  return jsonb_build_object('status', 'invalid', 'remaining', 5 - (v_code.attempts + 1));
end;
$$;

revoke all on function public.issue_checkin_email_code(text, text, text) from public, anon, authenticated;
revoke all on function public.verify_checkin_email_code(text, text, text) from public, anon, authenticated;
grant execute on function public.issue_checkin_email_code(text, text, text) to service_role;
grant execute on function public.verify_checkin_email_code(text, text, text) to service_role;

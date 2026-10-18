-- Safe to run after the earlier Google-auth schema; it creates separate PIN-auth tables.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.student_accounts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  username text not null unique,
  pin_hash text not null,
  recovery_hash bytea not null,
  failed_pin_attempts smallint not null default 0,
  pin_locked_until timestamptz,
  failed_recovery_attempts smallint not null default 0,
  recovery_locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.student_sessions (
  token_hash bytea primary key,
  student_id uuid not null references private.student_accounts (id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.student_pin_progress (
  student_id uuid primary key references private.student_accounts (id) on delete cascade,
  current_problem integer not null default 0 check (current_problem between 0 and 9),
  solved integer[] not null default '{}',
  codes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.student_pin_progress enable row level security;
revoke all on public.student_pin_progress from public, anon, authenticated;
revoke all on private.student_accounts from public, anon, authenticated;
revoke all on private.student_sessions from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

create or replace function public.student_register(p_username text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_username text := pg_catalog.lower(pg_catalog.btrim(p_username));
  recovery_code text;
  session_token text;
  new_student_id uuid;
begin
  if p_username is null or p_pin is null
     or clean_username !~ '^[a-z0-9_]{3,20}$'
     or p_pin !~ '^[0-9]{6}$' then
    return pg_catalog.jsonb_build_object('error', 'invalid_input');
  end if;

  recovery_code := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(6), 'hex'));
  session_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.student_accounts (username, pin_hash, recovery_hash)
  values (
    clean_username,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    extensions.digest(pg_catalog.lower(recovery_code), 'sha256')
  )
  returning id into new_student_id;

  insert into private.student_sessions (token_hash, student_id, expires_at)
  values (extensions.digest(session_token, 'sha256'), new_student_id, pg_catalog.now() + interval '30 days');

  insert into public.student_pin_progress (student_id) values (new_student_id);

  return pg_catalog.jsonb_build_object(
    'student_id', new_student_id,
    'username', clean_username,
    'session_token', session_token,
    'recovery_code', recovery_code
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object('error', 'username_taken');
end;
$$;

create or replace function public.student_login(p_username text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account private.student_accounts%rowtype;
  session_token text;
begin
  if p_username is null or p_pin is null
     or pg_catalog.lower(pg_catalog.btrim(p_username)) !~ '^[a-z0-9_]{3,20}$'
     or p_pin !~ '^[0-9]{6}$' then
    return pg_catalog.jsonb_build_object('error', 'invalid_credentials');
  end if;

  select * into account
  from private.student_accounts
  where username = pg_catalog.lower(pg_catalog.btrim(p_username))
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('error', 'invalid_credentials');
  end if;
  if account.pin_locked_until is not null and account.pin_locked_until > pg_catalog.now() then
    return pg_catalog.jsonb_build_object('error', 'invalid_credentials');
  end if;

  if account.pin_hash <> extensions.crypt(p_pin, account.pin_hash) then
    account.failed_pin_attempts := account.failed_pin_attempts + 1;
    update private.student_accounts
    set failed_pin_attempts = account.failed_pin_attempts,
        pin_locked_until = case when account.failed_pin_attempts >= 5 then pg_catalog.now() + interval '15 minutes' else null end
    where id = account.id;
    return pg_catalog.jsonb_build_object('error', 'invalid_credentials');
  end if;

  update private.student_accounts
  set failed_pin_attempts = 0, pin_locked_until = null
  where id = account.id;

  session_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.student_sessions (token_hash, student_id, expires_at)
  values (extensions.digest(session_token, 'sha256'), account.id, pg_catalog.now() + interval '30 days');

  return pg_catalog.jsonb_build_object(
    'student_id', account.id,
    'username', account.username,
    'session_token', session_token
  );
end;
$$;

create or replace function public.student_reset_pin(p_username text, p_recovery_code text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account private.student_accounts%rowtype;
  recovery_code text;
  session_token text;
begin
  if p_username is null or p_recovery_code is null or p_new_pin is null
     or pg_catalog.lower(pg_catalog.btrim(p_username)) !~ '^[a-z0-9_]{3,20}$'
     or p_recovery_code !~ '^[0-9A-Fa-f]{12}$'
     or p_new_pin !~ '^[0-9]{6}$' then
    return pg_catalog.jsonb_build_object('error', 'invalid_input');
  end if;

  select * into account
  from private.student_accounts
  where username = pg_catalog.lower(pg_catalog.btrim(p_username))
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('error', 'invalid_recovery');
  end if;
  if account.recovery_locked_until is not null and account.recovery_locked_until > pg_catalog.now() then
    return pg_catalog.jsonb_build_object('error', 'invalid_recovery');
  end if;

  if account.recovery_hash <> extensions.digest(pg_catalog.lower(pg_catalog.btrim(p_recovery_code)), 'sha256') then
    account.failed_recovery_attempts := account.failed_recovery_attempts + 1;
    update private.student_accounts
    set failed_recovery_attempts = account.failed_recovery_attempts,
        recovery_locked_until = case when account.failed_recovery_attempts >= 5 then pg_catalog.now() + interval '30 minutes' else null end
    where id = account.id;
    return pg_catalog.jsonb_build_object('error', 'invalid_recovery');
  end if;

  recovery_code := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(6), 'hex'));
  session_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  update private.student_accounts
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
      recovery_hash = extensions.digest(pg_catalog.lower(recovery_code), 'sha256'),
      failed_pin_attempts = 0,
      pin_locked_until = null,
      failed_recovery_attempts = 0,
      recovery_locked_until = null
  where id = account.id;

  delete from private.student_sessions where student_id = account.id;
  insert into private.student_sessions (token_hash, student_id, expires_at)
  values (extensions.digest(session_token, 'sha256'), account.id, pg_catalog.now() + interval '30 days');

  return pg_catalog.jsonb_build_object(
    'student_id', account.id,
    'username', account.username,
    'session_token', session_token,
    'recovery_code', recovery_code
  );
end;
$$;

create or replace function public.student_get_progress(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'student_id', account.id,
    'username', account.username,
    'current_problem', coalesce(progress.current_problem, 0),
    'solved', coalesce(progress.solved, '{}'::integer[]),
    'codes', coalesce(progress.codes, '{}'::jsonb)
  ) into result
  from private.student_sessions as session
  join private.student_accounts as account on account.id = session.student_id
  left join public.student_pin_progress as progress on progress.student_id = account.id
  where session.token_hash = extensions.digest(p_session_token, 'sha256')
    and session.expires_at > pg_catalog.now();

  return coalesce(result, pg_catalog.jsonb_build_object('error', 'session_expired'));
end;
$$;

create or replace function public.student_save_progress(
  p_session_token text,
  p_current_problem integer,
  p_solved integer[],
  p_codes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid;
begin
  if p_current_problem is null
     or p_current_problem not between 0 and 9
     or p_solved is null
     or pg_catalog.cardinality(p_solved) > 10
     or exists (select 1 from pg_catalog.unnest(p_solved) as items(problem_index) where problem_index < 0 or problem_index > 9)
     or p_codes is null
     or pg_catalog.jsonb_typeof(p_codes) <> 'object'
     or pg_catalog.octet_length(p_codes::text) > 200000 then
    return pg_catalog.jsonb_build_object('error', 'invalid_progress');
  end if;

  select student_id into account_id
  from private.student_sessions
  where token_hash = extensions.digest(p_session_token, 'sha256')
    and expires_at > pg_catalog.now();

  if account_id is null then
    return pg_catalog.jsonb_build_object('error', 'session_expired');
  end if;

  insert into public.student_pin_progress (student_id, current_problem, solved, codes, updated_at)
  values (account_id, p_current_problem, p_solved, p_codes, pg_catalog.now())
  on conflict (student_id) do update
    set current_problem = excluded.current_problem,
        solved = excluded.solved,
        codes = excluded.codes,
        updated_at = excluded.updated_at;

  update private.student_sessions
  set expires_at = pg_catalog.now() + interval '30 days'
  where token_hash = extensions.digest(p_session_token, 'sha256');

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

create or replace function public.student_logout(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.student_sessions
  where token_hash = extensions.digest(p_session_token, 'sha256');
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.student_register(text, text) from public;
revoke all on function public.student_login(text, text) from public;
revoke all on function public.student_reset_pin(text, text, text) from public;
revoke all on function public.student_get_progress(text) from public;
revoke all on function public.student_save_progress(text, integer, integer[], jsonb) from public;
revoke all on function public.student_logout(text) from public;

grant execute on function public.student_register(text, text) to anon, authenticated;
grant execute on function public.student_login(text, text) to anon, authenticated;
grant execute on function public.student_reset_pin(text, text, text) to anon, authenticated;
grant execute on function public.student_get_progress(text) to anon, authenticated;
grant execute on function public.student_save_progress(text, integer, integer[], jsonb) to anon, authenticated;
grant execute on function public.student_logout(text) to anon, authenticated;

-- PostgREST roles (mirror Supabase's setup so the app's service_role JWT works).
-- Runs after 01-schema.sql on first DB init.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'authpw';
  end if;
end
$$;

-- PostgREST connects as authenticator, then switches into the JWT's role.
grant anon           to authenticator;
grant service_role   to authenticator;

-- service_role gets full access (RLS is bypassed via BYPASSRLS above).
grant usage on schema public to anon, service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

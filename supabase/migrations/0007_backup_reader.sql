-- Read-only login used only by the nightly GitHub Actions backup (pg_dump).
-- The password is set separately in the Supabase SQL editor and stored as the GitHub secret
-- SUPABASE_DB_URL — never in this repository.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader with login bypassrls nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;
alter role backup_reader set default_transaction_read_only = on;
grant usage on schema public to backup_reader;
grant select on all tables in schema public to backup_reader;
grant select on all sequences in schema public to backup_reader;
alter default privileges in schema public grant select on tables to backup_reader;
alter default privileges in schema public grant select on sequences to backup_reader;

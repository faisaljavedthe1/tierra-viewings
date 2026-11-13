-- Pen-test fixes for phone notifications.
-- #1 Server secrets stay out of backups (the backup login may read everything else).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'backup_reader') then
    revoke all on public.app_secrets from backup_reader;
  end if;
end $$;

-- #3 Keep the reminder log small: the 5-minute tick also removes entries older than 30 days.
create or replace function public.push_reminders_tick() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.push_log where sent_at < now() - interval '30 days';
  perform public._push_call(jsonb_build_object('type', 'reminders'));
end $$;
revoke all on function public.push_reminders_tick() from public, anon, authenticated;

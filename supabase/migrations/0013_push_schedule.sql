-- Supabase only (free plan includes both): pg_net lets the database call the push-send function,
-- pg_cron runs the reminder check every 5 minutes. Skipped automatically where unavailable.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'push-reminders';
    perform cron.schedule('push-reminders', '*/5 * * * *', 'select public.push_reminders_tick()');
  end if;
end $$;
insert into public.app_secrets (name, value)
values ('push_url', 'https://mfmsokgjeszhulrufuww.supabase.co/functions/v1/push-send')
on conflict (name) do update set value = excluded.value;

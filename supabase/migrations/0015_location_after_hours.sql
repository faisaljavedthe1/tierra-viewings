-- Pen-test fix: the driver's location is removed by the server outside working hours
-- (Mon–Sat 9:00 AM – 6:30 PM Dubai), even if his phone was locked or the app closed.
create or replace function public.push_reminders_tick() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n timestamp := public.dubai_now();
begin
  delete from public.push_log where sent_at < now() - interval '30 days';
  if extract(dow from n) = 0 or n::time < time '09:00' or n::time >= time '18:30' then
    delete from public.driver_location;
  end if;
  perform public._push_call(jsonb_build_object('type', 'reminders'));
end $$;
revoke all on function public.push_reminders_tick() from public, anon, authenticated;

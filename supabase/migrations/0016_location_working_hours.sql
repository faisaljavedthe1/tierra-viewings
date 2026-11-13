-- Pen-test fix (13 Nov): location is only stored during working hours (Mon–Sat 9:00 AM – 6:30 PM Dubai),
-- enforced by the database itself, not just the app. Outside those hours updates are quietly ignored.
create or replace function public.update_driver_location(p_lat double precision, p_lng double precision, p_accuracy int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n timestamp := public.dubai_now();
begin
  if public.require_staff() <> 'driver' then raise exception 'For the driver only'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  if extract(dow from n) = 0 or n::time < time '09:00' or n::time >= time '18:30' then
    delete from public.driver_location where driver_id = auth.uid();
    return;
  end if;
  insert into public.driver_location (driver_id, lat, lng, accuracy, updated_at)
  values (auth.uid(), p_lat, p_lng, least(greatest(coalesce(p_accuracy, 0), 0), 100000), now())
  on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, updated_at = now();
end $$;

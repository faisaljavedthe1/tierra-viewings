-- Live updates: the app listens for booking and driver-location changes.
-- Realtime respects the row level security policies above.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings, public.driver_location;
  end if;
end $$;
alter table public.driver_location replica identity full;

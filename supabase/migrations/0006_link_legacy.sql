-- When a staff member's profile gets their full name (on account creation or rename),
-- old Firebase bookings recorded under that name are linked to the new login.
create function public.link_legacy_bookings() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.full_name <> '' then
    update public.bookings set agent_id = new.id
     where agent_id is null and legacy_id is not null and lower(btrim(agent_name)) = lower(btrim(new.full_name));
  end if;
  return new;
end $$;
revoke all on function public.link_legacy_bookings() from public, anon, authenticated;
create trigger profiles_link_legacy after insert or update of full_name on public.profiles
  for each row execute function public.link_legacy_bookings();

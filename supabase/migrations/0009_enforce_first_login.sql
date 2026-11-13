-- Pen-test fix: "choose your own password" is enforced by the server, not only the app screen.
-- Until then the account counts as not-yet-staff: no calendar, no bookings, no staff list.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid() and active and not must_change_password $$;

create or replace function public.require_staff() returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text := public.my_role();
begin
  if r is null then
    if exists (select 1 from public.profiles where id = auth.uid() and active and must_change_password) then
      raise exception 'Please choose your own password first (reload the app).';
    end if;
    raise exception 'You are not an active staff member. Ask Faisal to activate your account.';
  end if;
  return r;
end $$;

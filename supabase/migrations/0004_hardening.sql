-- Pen-test fixes (see docs/SECURITY.md, findings 2, 5–10).

-- #5 fixed search_path on the remaining helpers.
alter function public.dubai_now() set search_path = public, pg_temp;
alter function public._parse_booking(jsonb) set search_path = public, pg_temp;
alter function public._len(text, int, text) set search_path = public, pg_temp;

-- #2 only active staff can report errors.
create or replace function public.log_client_error(p_message text, p_stack text, p_url text, p_agent text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_staff() then return; end if;
  if (select count(*) from public.client_errors where user_id = auth.uid() and at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into public.client_errors (user_id, message, stack, url, agent)
  values (auth.uid(), left(coalesce(p_message, ''), 1000), left(p_stack, 4000), left(p_url, 500), left(p_agent, 300));
end $$;

-- #7 at most 6 months ahead; #8 times formatted like the app (no leading zero).
create or replace function public._check_slot(d date, t time, mins int, exclude uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  nowl timestamp := public.dubai_now();
  c record;
begin
  if d < nowl::date then raise exception 'Cannot book a date in the past'; end if;
  if d > (nowl + interval '6 months')::date then raise exception 'Bookings can be made up to 6 months ahead'; end if;
  if extract(dow from d) = 0 then raise exception 'Sunday is a day off — no bookings'; end if;
  if t < time '09:30' then raise exception 'Viewings start at 9:30 AM — choose a later time'; end if;
  if t >= time '18:00' then raise exception 'No bookings starting at or after 6:00 PM'; end if;
  if d = nowl::date and d + t < nowl + interval '30 minutes' then
    raise exception 'Book at least 30 minutes ahead of the start time';
  end if;
  select b.start_time, b.duration_mins, b.area into c from public.bookings b
   where b.id is distinct from exclude and b.status in ('pending', 'confirmed', 'rescheduled')
     and b.slot && tsrange(d + t, d + t + make_interval(mins => mins))
   limit 1;
  if found then
    raise exception 'Driver is already booked % – % (%). Choose another time.',
      to_char(c.start_time, 'FMHH12:MI AM'), to_char(c.start_time + make_interval(mins => c.duration_mins), 'FMHH12:MI AM'), c.area;
  end if;
end $$;

-- #6 check the caller before looking the booking up.
create or replace function public.edit_booking(bid uuid, p jsonb) returns public.bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare x record; b public.bookings;
begin
  perform public.require_staff();
  b := public._get_booking(bid);
  if b.agent_id <> auth.uid() and not public.is_manager() then raise exception 'You can only edit your own bookings'; end if;
  if b.status <> 'pending' then raise exception 'Only pending bookings can be edited'; end if;
  select * into x from public._parse_booking(p);
  perform public._check_slot(x.d, x.t, x.mins, bid);
  update public.bookings set date = x.d, start_time = x.t, duration_mins = x.mins, area = x.area, trip_type = x.trip,
    pickup_location = x.pickup, location = x.loc, purpose = x.purpose, notes = x.notes, client_ref = x.ref,
    updated_at = now()
  where id = bid returning * into b;
  return b;
exception when exclusion_violation then
  raise exception 'Driver is already booked at that time. Choose another time.';
end $$;

-- #9 plain message for bad phone numbers.
create or replace function public.admin_update_staff(uid uuid, new_role text, new_active boolean, new_department text, new_phone text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'For the admin only'; end if;
  if uid = auth.uid() and (coalesce(new_role, 'admin') <> 'admin' or new_active is false) then
    raise exception 'You cannot deactivate or demote yourself';
  end if;
  if new_phone is not null and new_phone !~ '^\+[0-9]{8,15}$' then
    raise exception 'Phone must look like +971501234567';
  end if;
  if new_role is not null and new_role not in ('agent', 'manager', 'driver', 'admin') then raise exception 'Unknown role'; end if;
  update public.profiles set
    role = coalesce(new_role, role), active = coalesce(new_active, active),
    department = left(coalesce(new_department, department), 80), phone = coalesce(new_phone, phone)
  where id = uid;
  if not found then raise exception 'Staff member not found'; end if;
end $$;

-- #10 a forgotten "share location" does not leave a stale pin for long.
drop policy "managers and driver see location" on public.driver_location;
create policy "managers and driver see recent location" on public.driver_location for select to authenticated
  using ((public.is_manager() or (public.is_staff() and driver_id = auth.uid())) and updated_at > now() - interval '2 hours');

-- Same privileges as before for the replaced functions.
revoke all on function public.log_client_error(text, text, text, text), public.edit_booking(uuid, jsonb),
  public.admin_update_staff(uuid, text, boolean, text, text), public._check_slot(date, time, int, uuid) from public, anon;
revoke all on function public._check_slot(date, time, int, uuid) from authenticated;

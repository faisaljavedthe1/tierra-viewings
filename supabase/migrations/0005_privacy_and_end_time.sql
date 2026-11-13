-- Faisal's decisions (13 Nov 2026):
--  1. Agents see only time, location and the booking agent on colleagues' bookings.
--  2. Every booking must finish by 6:00 PM.
--  3. Old Firebase bookings are kept as history (no login attached, original agent name kept).

------------------------------------------------------------------ legacy history
alter table public.bookings alter column agent_id drop not null;
alter table public.bookings add column agent_name text check (length(agent_name) <= 80);
alter table public.bookings add constraint bookings_agent_required check (agent_id is not null or legacy_id is not null);

------------------------------------------------------------------ 1. who reads the raw table
-- Managers: everything. Agents: only their own rows. Driver: confirmed and completed trips.
-- (Live updates use this table, so each person only receives changes they may see in full.)
drop policy "staff see the calendar" on public.bookings;
create policy "full rows for owner, managers and driver trips" on public.bookings for select to authenticated
  using (public.is_manager()
         or (public.is_staff() and agent_id = auth.uid())
         or (public.my_role() = 'driver' and status in ('confirmed', 'completed')));

-- Everyone else's bookings come through this function with client details removed.
create function public.calendar(p_from date)
returns table (
  id uuid, agent_id uuid, agent_name text, department text, date date, start_time time, duration_mins int,
  area text, trip_type text, pickup_location text, location text, purpose text, notes text, client_ref text,
  status text, created_at timestamptz, updated_at timestamptz,
  confirmed_at timestamptz, confirmed_by uuid, cancelled_at timestamptz, cancelled_by uuid, cancel_reason text,
  rescheduled_at timestamptz, rescheduled_by uuid, original_date date, original_start time,
  completed_at timestamptz, completed_by uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text := public.my_role();
begin
  if r is null then return; end if;
  return query
  select b.id, b.agent_id, b.agent_name, b.department, b.date, b.start_time, b.duration_mins,
    b.area, b.trip_type, b.pickup_location, b.location,
    case when v.full then b.purpose end, case when v.full then b.notes end,
    case when v.full then b.client_ref end,
    b.status, b.created_at, b.updated_at, b.confirmed_at, b.confirmed_by, b.cancelled_at, b.cancelled_by,
    case when v.full then b.cancel_reason end,
    b.rescheduled_at, b.rescheduled_by, b.original_date, b.original_start, b.completed_at, b.completed_by
  from public.bookings b
  cross join lateral (select (r in ('manager', 'admin') or b.agent_id = auth.uid()
                              or (r = 'driver' and b.status in ('confirmed', 'completed'))) as full) v
  where b.date >= p_from
  order by b.date, b.start_time;
end $$;
revoke all on function public.calendar(date) from public, anon;
grant execute on function public.calendar(date) to authenticated;

------------------------------------------------------------------ 2. finish by 6:00 PM
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
  if extract(epoch from t) / 60 + mins > 18 * 60 then
    raise exception 'Viewings must finish by 6:00 PM — start earlier or shorten the duration';
  end if;
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
revoke all on function public._check_slot(date, time, int, uuid) from public, anon, authenticated;

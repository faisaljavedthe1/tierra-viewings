-- Tierra Viewings v4 — core schema, roles, row level security and booking rules.
-- All booking writes go through the functions below; clients can only SELECT tables.

------------------------------------------------------------------ clock (tests can freeze it)
create table public.app_clock (one boolean primary key default true check (one), fixed_now timestamptz);
insert into public.app_clock default values;
revoke all on public.app_clock from public, anon, authenticated;

create function public.app_now() returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select fixed_now from public.app_clock), now()) $$;

create function public.dubai_now() returns timestamp
language sql stable as $$ select public.app_now() at time zone 'Asia/Dubai' $$;

------------------------------------------------------------------ staff profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 80),
  role text not null default 'agent' check (role in ('agent', 'manager', 'driver', 'admin')),
  department text check (length(department) <= 80),
  phone text check (phone ~ '^\+[0-9]{8,15}$'),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Every new login gets a profile with no access; the admin activates it.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), ''), 80));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.my_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid() and active $$;
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.my_role() is not null $$;
create function public.is_manager() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.my_role() in ('manager', 'admin'), false) $$;

create function public.require_staff() returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text := public.my_role();
begin
  if r is null then raise exception 'You are not an active staff member. Ask Faisal to activate your account.'; end if;
  return r;
end $$;

------------------------------------------------------------------ bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id),
  department text,
  date date not null,
  start_time time not null,
  duration_mins int not null check (duration_mins between 30 and 480 and duration_mins % 30 = 0),
  slot tsrange generated always as
    (tsrange(date + start_time, date + start_time + make_interval(mins => duration_mins))) stored,
  area text not null check (length(area) between 1 and 120),
  trip_type text not null default 'direct' check (trip_type in ('direct', 'pickup')),
  pickup_location text check (length(pickup_location) <= 500),
  location text not null check (length(location) between 1 and 500),
  purpose text not null check (length(purpose) between 1 and 1000),
  notes text check (length(notes) <= 2000),
  client_ref text check (length(client_ref) <= 120),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rescheduled', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz, confirmed_by uuid references public.profiles(id),
  cancelled_at timestamptz, cancelled_by uuid references public.profiles(id),
  cancel_reason text check (length(cancel_reason) <= 500),
  rescheduled_at timestamptz, rescheduled_by uuid references public.profiles(id),
  original_date date, original_start time,
  completed_at timestamptz, completed_by uuid references public.profiles(id),
  legacy_id text unique,
  -- One driver: active bookings can never overlap, even under simultaneous requests.
  constraint one_driver_no_overlap exclude using gist (slot with &&)
    where (status in ('pending', 'confirmed', 'rescheduled'))
);
create index bookings_date_idx on public.bookings (date);
create index bookings_agent_idx on public.bookings (agent_id);

------------------------------------------------------------------ audit log
create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  action text not null,
  actor_id uuid,
  at timestamptz not null default now(),
  before jsonb, after jsonb
);
create index booking_events_booking_idx on public.booking_events (booking_id);

create function public.log_booking_event() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare act text;
begin
  if tg_op = 'INSERT' then act := 'created';
  elsif new.status is distinct from old.status then act := new.status;
  else act := 'edited'; end if;
  insert into public.booking_events (booking_id, action, actor_id, before, after)
  values (new.id, act, auth.uid(), case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;
create trigger bookings_audit after insert or update on public.bookings
  for each row execute function public.log_booking_event();

------------------------------------------------------------------ driver live location
create table public.driver_location (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy int check (accuracy between 0 and 100000),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------ privileges + RLS
revoke all on public.profiles, public.bookings, public.booking_events, public.driver_location from public, anon, authenticated;
grant select on public.profiles, public.bookings, public.booking_events, public.driver_location to authenticated;

alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.driver_location enable row level security;
alter table public.app_clock enable row level security;

create policy "staff see staff" on public.profiles for select to authenticated
  using (public.is_staff() or id = auth.uid());
create policy "staff see the calendar" on public.bookings for select to authenticated
  using (public.is_staff());
create policy "managers see the audit log" on public.booking_events for select to authenticated
  using (public.is_manager());
create policy "managers and driver see location" on public.driver_location for select to authenticated
  using (public.is_manager() or (public.is_staff() and driver_id = auth.uid()));

------------------------------------------------------------------ booking rules
create function public._len(v text, maxlen int, label text) returns text
language plpgsql immutable as $$
begin
  if length(v) > maxlen then raise exception '% is too long (max % characters)', label, maxlen; end if;
  return v;
end $$;

create function public._parse_booking(p jsonb,
  out d date, out t time, out mins int, out area text, out trip text, out pickup text,
  out loc text, out purpose text, out notes text, out ref text)
language plpgsql immutable as $$
declare h numeric;
begin
  d := (p->>'date')::date;
  t := (p->>'start_time')::time;
  if d is null or t is null then raise exception 'Date and start time are required'; end if;
  h := (p->>'duration_hours')::numeric;
  if h is null or h < 0.5 or h > 8 or (h * 60) <> round(h * 60) or (h * 60)::int % 30 <> 0 then
    raise exception 'Duration must be 0.5 to 8 hours in 30-minute steps';
  end if;
  mins := (h * 60)::int;
  area := public._len(nullif(btrim(p->>'area'), ''), 120, 'Area');
  trip := coalesce(nullif(p->>'trip_type', ''), 'direct');
  pickup := public._len(nullif(btrim(p->>'pickup_location'), ''), 500, 'Pick-up point');
  loc := public._len(nullif(btrim(p->>'location'), ''), 500, 'Location');
  purpose := public._len(nullif(btrim(p->>'purpose'), ''), 1000, 'Purpose');
  notes := public._len(nullif(btrim(p->>'notes'), ''), 2000, 'Notes');
  ref := public._len(nullif(btrim(p->>'client_ref'), ''), 120, 'Client reference');
  if area is null then raise exception 'Area is required'; end if;
  if trip not in ('direct', 'pickup') then raise exception 'Invalid trip type'; end if;
  if trip = 'pickup' and pickup is null then raise exception 'Pick-up point is required'; end if;
  if trip = 'direct' then pickup := null; end if;
  if loc is null then raise exception 'Location is required'; end if;
  if purpose is null then raise exception 'Purpose is required'; end if;
end $$;

create function public._check_slot(d date, t time, mins int, exclude uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  nowl timestamp := public.dubai_now();
  c record;
begin
  if d < nowl::date then raise exception 'Cannot book a date in the past'; end if;
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
      to_char(c.start_time, 'HH12:MI AM'), to_char(c.start_time + make_interval(mins => c.duration_mins), 'HH12:MI AM'), c.area;
  end if;
end $$;

create function public._get_booking(bid uuid) returns public.bookings
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = bid for update;
  if not found then raise exception 'Booking not found'; end if;
  return b;
end $$;

------------------------------------------------------------------ RPCs
create function public.book_viewing(p jsonb) returns public.bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare x record; b public.bookings;
begin
  perform public.require_staff();
  select * into x from public._parse_booking(p);
  perform public._check_slot(x.d, x.t, x.mins, null);
  insert into public.bookings (agent_id, department, date, start_time, duration_mins, area, trip_type,
    pickup_location, location, purpose, notes, client_ref)
  select auth.uid(), pr.department, x.d, x.t, x.mins, x.area, x.trip, x.pickup, x.loc, x.purpose, x.notes, x.ref
    from public.profiles pr where pr.id = auth.uid()
  returning * into b;
  return b;
exception when exclusion_violation then
  raise exception 'Driver is already booked at that time. Choose another time.';
end $$;

create function public.edit_booking(bid uuid, p jsonb) returns public.bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare x record; b public.bookings := public._get_booking(bid);
begin
  perform public.require_staff();
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

create function public.confirm_booking(bid uuid) returns public.bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.bookings;
begin
  perform public.require_staff();
  if not public.is_manager() then raise exception 'Only managers can confirm bookings'; end if;
  b := public._get_booking(bid);
  if b.status not in ('pending', 'rescheduled') then raise exception 'This booking is already %', b.status; end if;
  update public.bookings set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), updated_at = now()
  where id = bid returning * into b;
  return b;
end $$;

create function public.cancel_booking(bid uuid, reason text) returns public.bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.bookings;
begin
  perform public.require_staff();
  b := public._get_booking(bid);
  if b.agent_id <> auth.uid() and not public.is_manager() then raise exception 'You can only cancel your own bookings'; end if;
  if b.status in ('cancelled', 'completed') then raise exception 'This booking is already %', b.status; end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = public._len(nullif(btrim(reason), ''), 500, 'Reason'), updated_at = now()
  where id = bid returning * into b;
  return b;
end $$;

create function public.reschedule_booking(bid uuid, new_date date, new_start time) returns public.bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.bookings;
begin
  perform public.require_staff();
  if not public.is_manager() then raise exception 'Only managers can reschedule bookings'; end if;
  b := public._get_booking(bid);
  if b.status not in ('pending', 'confirmed', 'rescheduled') then raise exception 'This booking is already %', b.status; end if;
  perform public._check_slot(new_date, new_start, b.duration_mins, bid);
  update public.bookings set
    original_date = coalesce(original_date, date), original_start = coalesce(original_start, start_time),
    date = new_date, start_time = new_start, status = 'rescheduled',
    confirmed_at = null, confirmed_by = null, rescheduled_at = now(), rescheduled_by = auth.uid(), updated_at = now()
  where id = bid returning * into b;
  return b;
exception when exclusion_violation then
  raise exception 'Driver is already booked at that time. Choose another time.';
end $$;

create function public.complete_trip(bid uuid) returns public.bookings
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.bookings;
begin
  if public.require_staff() not in ('driver', 'manager', 'admin') then raise exception 'For the driver or managers only'; end if;
  b := public._get_booking(bid);
  if b.status <> 'confirmed' then raise exception 'Only confirmed trips can be completed'; end if;
  if public.dubai_now() < b.date + b.start_time then raise exception 'This trip has not started yet'; end if;
  update public.bookings set status = 'completed', completed_at = now(), completed_by = auth.uid(), updated_at = now()
  where id = bid returning * into b;
  return b;
end $$;

create function public.update_driver_location(p_lat double precision, p_lng double precision, p_accuracy int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.require_staff() <> 'driver' then raise exception 'For the driver only'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  insert into public.driver_location (driver_id, lat, lng, accuracy, updated_at)
  values (auth.uid(), p_lat, p_lng, least(greatest(coalesce(p_accuracy, 0), 0), 100000), now())
  on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, updated_at = now();
end $$;

create function public.clear_driver_location() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_staff();
  delete from public.driver_location where driver_id = auth.uid();
end $$;

create function public.admin_update_staff(uid uuid, new_role text, new_active boolean, new_department text, new_phone text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'For the admin only'; end if;
  if uid = auth.uid() and (coalesce(new_role, 'admin') <> 'admin' or new_active is false) then
    raise exception 'You cannot deactivate or demote yourself';
  end if;
  update public.profiles set
    role = coalesce(new_role, role), active = coalesce(new_active, active),
    department = coalesce(new_department, department), phone = coalesce(new_phone, phone)
  where id = uid;
  if not found then raise exception 'Staff member not found'; end if;
end $$;

------------------------------------------------------------------ function privileges
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon', f.sig);
  end loop;
end $$;
grant execute on function public.book_viewing(jsonb), public.edit_booking(uuid, jsonb), public.confirm_booking(uuid),
  public.cancel_booking(uuid, text), public.reschedule_booking(uuid, date, time), public.complete_trip(uuid),
  public.update_driver_location(double precision, double precision, int), public.clear_driver_location(),
  public.admin_update_staff(uuid, text, boolean, text, text),
  public.my_role(), public.is_staff(), public.is_manager()
  to authenticated;
-- Internal helpers are not callable by clients.
revoke all on function public._parse_booking(jsonb), public._check_slot(date, time, int, uuid), public._get_booking(uuid),
  public._len(text, int, text), public.app_now(), public.require_staff(), public.handle_new_user(),
  public.log_booking_event() from authenticated;
-- Policies and functions run helper code as their owner, so RLS keeps working.
grant execute on function public.dubai_now() to authenticated;

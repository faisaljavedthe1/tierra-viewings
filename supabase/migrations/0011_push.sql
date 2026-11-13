-- Phone notifications (Web Push). The database asks the push-send function to notify people when a
-- booking changes; pg_cron asks it every 5 minutes to send trip reminders. All free-plan features.

------------------------------------------------------------------ server-only secrets
-- Readable only by the server (service role). Nobody using the app can read this table.
create table public.app_secrets (name text primary key, value text not null);
revoke all on public.app_secrets from public, anon, authenticated;
alter table public.app_secrets enable row level security;
-- Shared secret between the database and the push-send function, generated here and never shown.
insert into public.app_secrets (name, value)
values ('push_secret', encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'));

create function public.push_public_key() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select value from public.app_secrets where name = 'vapid_public' and public.is_staff() $$;
revoke all on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

------------------------------------------------------------------ subscriptions (one per phone/browser)
create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select on public.push_subscriptions to authenticated;
alter table public.push_subscriptions enable row level security;
create policy "own phones" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_staff();
  if p_endpoint is null or p_endpoint !~ '^https://[^\s]+$' or length(p_endpoint) > 1000 then raise exception 'Invalid push address'; end if;
  if p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$' or p_auth !~ '^[A-Za-z0-9_-]{16,30}$' then raise exception 'Invalid push key'; end if;
  -- Keep at most 10 devices per person (drop the oldest).
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where user_id = auth.uid() and endpoint <> p_endpoint
    order by created_at desc offset 9);
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_device, 120))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    device = excluded.device, created_at = now();
end $$;

create function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid() $$;

revoke all on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) to authenticated;

------------------------------------------------------------------ reminder de-duplication
create table public.push_log (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (booking_id, user_id, kind)
);
revoke all on public.push_log from public, anon, authenticated;
alter table public.push_log enable row level security;

------------------------------------------------------------------ asking the push-send function
-- Uses pg_net when available (Supabase); quietly does nothing elsewhere (tests, local copies).
create function public._push_call(body jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare url text; secret text;
begin
  if to_regproc('net.http_post') is null then return; end if;
  select value into url from public.app_secrets where name = 'push_url';
  select value into secret from public.app_secrets where name = 'push_secret';
  if url is null or secret is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
    using url, body, jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret);
exception when others then
  raise warning 'push call failed: %', sqlerrm; -- a notification problem must never block a booking
end $$;

create function public.push_on_booking_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.legacy_id is not null and tg_op = 'UPDATE' and new.status = old.status then return new; end if; -- legacy linking
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public._push_call(jsonb_build_object('type', 'booking', 'booking_id', new.id,
      'old_status', case when tg_op = 'UPDATE' then old.status end));
  end if;
  return new;
end $$;
create trigger bookings_push after insert or update of status on public.bookings
  for each row execute function public.push_on_booking_change();

create function public.send_test_push() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_staff();
  perform public._push_call(jsonb_build_object('type', 'test', 'user_id', auth.uid()));
end $$;
revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;

create function public.push_reminders_tick() returns void
language sql security definer set search_path = public, pg_temp as $$
  select public._push_call(jsonb_build_object('type', 'reminders')) $$;

revoke all on function public._push_call(jsonb), public.push_on_booking_change(), public.push_reminders_tick() from public, anon, authenticated;

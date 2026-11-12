-- Error tracking without a third-party service: the app reports crashes here; the admin reads them.
create table public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  message text not null,
  stack text,
  url text,
  agent text
);
create index client_errors_user_at_idx on public.client_errors (user_id, at);
revoke all on public.client_errors from public, anon, authenticated;
grant select on public.client_errors to authenticated;
alter table public.client_errors enable row level security;
create policy "admin reads errors" on public.client_errors for select to authenticated
  using (public.my_role() = 'admin');

create function public.log_client_error(p_message text, p_stack text, p_url text, p_agent text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return; end if;
  -- Flood cap: 30 reports per user per hour.
  if (select count(*) from public.client_errors where user_id = auth.uid() and at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into public.client_errors (user_id, message, stack, url, agent)
  values (auth.uid(), left(coalesce(p_message, ''), 1000), left(p_stack, 4000), left(p_url, 500), left(p_agent, 300));
end $$;
revoke all on function public.log_client_error(text, text, text, text) from public, anon;
grant execute on function public.log_client_error(text, text, text, text) to authenticated;

-- Keep the table small: errors older than 90 days are removed whenever a new one arrives.
create function public.prune_client_errors() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.client_errors where at < now() - interval '90 days';
  return null;
end $$;
revoke all on function public.prune_client_errors() from public, anon, authenticated;
create trigger client_errors_prune after insert on public.client_errors
  for each statement execute function public.prune_client_errors();

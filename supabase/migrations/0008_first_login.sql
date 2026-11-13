-- New accounts (and admin password resets) must choose their own password at first sign-in.
alter table public.profiles add column must_change_password boolean not null default false;

-- Called by the app right after the person sets a new password. Only clears their own flag.
create function public.password_changed() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.profiles set must_change_password = false where id = auth.uid() $$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

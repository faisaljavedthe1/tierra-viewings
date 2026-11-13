-- Managers can see who has phone notifications on (device count only — never the device addresses).
create function public.staff_push_status() returns table (user_id uuid, devices int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_manager() then raise exception 'For managers only'; end if;
  return query select p.id, (select count(*)::int from public.push_subscriptions s where s.user_id = p.id)
    from public.profiles p where p.active;
end $$;
revoke all on function public.staff_push_status() from public, anon;
grant execute on function public.staff_push_status() to authenticated;

-- Keep portal administration limited to the verified yjin@usc.edu account.

delete from public.portal_admins
where user_id not in (
  select id from auth.users where lower(email) = 'yjin@usc.edu'
);

insert into public.portal_admins (user_id)
select id from auth.users where lower(email) = 'yjin@usc.edu'
on conflict (user_id) do nothing;

alter table public.portal_admins
add column singleton boolean not null default true check (singleton);

create unique index portal_admins_singleton_idx
on public.portal_admins (singleton);

create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_admins as administrator
    join auth.users as account on account.id = administrator.user_id
    where administrator.user_id = auth.uid()
      and lower(account.email) = 'yjin@usc.edu'
  );
$$;

revoke all on function public.is_portal_admin() from public;
grant execute on function public.is_portal_admin() to authenticated;

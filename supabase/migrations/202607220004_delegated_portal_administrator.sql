-- Allow the permanent portal owner to appoint one revocable delegated administrator.

create table public.portal_admin_delegates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  appointed_email text not null,
  appointed_by uuid not null references auth.users(id) on delete restrict,
  singleton boolean not null default true check (singleton),
  appointed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index portal_admin_delegates_singleton_idx
on public.portal_admin_delegates (singleton);

create table public.portal_admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.portal_admin_delegates enable row level security;
alter table public.portal_admin_audit_log enable row level security;

revoke all on table public.portal_admin_delegates from anon, authenticated;
revoke all on table public.portal_admin_audit_log from anon, authenticated;

create or replace function public.is_portal_owner()
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

create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_portal_owner() or exists (
    select 1
    from public.portal_admin_delegates as delegate
    join auth.users as account on account.id = delegate.user_id
    where delegate.user_id = auth.uid()
      and account.email_confirmed_at is not null
      and lower(account.email) = delegate.appointed_email
  );
$$;

create or replace function public.get_portal_delegate()
returns table (
  delegate_user_id uuid,
  delegate_email text,
  appointed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_owner() then
    raise exception 'Portal owner access is required.';
  end if;

  return query
  select delegate.user_id, delegate.appointed_email, delegate.appointed_at, delegate.updated_at
  from public.portal_admin_delegates as delegate
  where delegate.singleton = true;
end;
$$;

create or replace function public.set_portal_delegate(p_email text)
returns table (
  delegate_user_id uuid,
  delegate_email text,
  appointed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user auth.users;
begin
  if not public.is_portal_owner() then
    raise exception 'Only the portal owner can appoint a delegated administrator.';
  end if;
  if coalesce(v_email, '') = '' then
    raise exception 'Enter the delegate account email address.';
  end if;
  if v_email = 'yjin@usc.edu' then
    raise exception 'The permanent owner does not need a delegated assignment.';
  end if;

  select account.* into v_user
  from auth.users as account
  where lower(account.email) = v_email;

  if v_user.id is null then
    raise exception 'This email has not signed in to the ML4EA portal yet.';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'This account must verify its email before it can be appointed.';
  end if;

  insert into public.portal_admin_delegates (
    user_id, appointed_email, appointed_by, singleton, appointed_at, updated_at
  ) values (
    v_user.id, v_email, auth.uid(), true, now(), now()
  )
  on conflict (singleton) do update set
    user_id = excluded.user_id,
    appointed_email = excluded.appointed_email,
    appointed_by = excluded.appointed_by,
    appointed_at = now(),
    updated_at = now();

  insert into public.portal_admin_audit_log (actor_id, action, target_user_id, target_email)
  values (auth.uid(), 'delegate_appointed', v_user.id, v_email);

  return query select * from public.get_portal_delegate();
end;
$$;

create or replace function public.remove_portal_delegate()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delegate public.portal_admin_delegates;
begin
  if not public.is_portal_owner() then
    raise exception 'Only the portal owner can revoke delegated administration.';
  end if;

  delete from public.portal_admin_delegates
  where singleton = true
  returning * into v_delegate;

  if v_delegate.user_id is null then
    return false;
  end if;

  insert into public.portal_admin_audit_log (actor_id, action, target_user_id, target_email)
  values (auth.uid(), 'delegate_revoked', v_delegate.user_id, v_delegate.appointed_email);

  return true;
end;
$$;

revoke all on function public.is_portal_owner() from public;
revoke all on function public.get_portal_delegate() from public;
revoke all on function public.set_portal_delegate(text) from public;
revoke all on function public.remove_portal_delegate() from public;

grant execute on function public.is_portal_owner() to authenticated;
grant execute on function public.get_portal_delegate() to authenticated;
grant execute on function public.set_portal_delegate(text) to authenticated;
grant execute on function public.remove_portal_delegate() to authenticated;


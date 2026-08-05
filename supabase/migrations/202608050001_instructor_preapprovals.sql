-- Owner-curated instructor preapprovals. Access still requires a verified
-- Supabase session for the exact email address on the preapproval record.

create table public.instructor_preapprovals (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) between 2 and 120),
  email text not null unique check (
    email = lower(trim(email))
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and revoked_at is null and revoked_by is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null)
  )
);

create index instructor_preapprovals_claimed_by_idx
on public.instructor_preapprovals (claimed_by)
where claimed_by is not null;

create trigger instructor_preapprovals_set_updated_at
before update on public.instructor_preapprovals
for each row execute function public.set_updated_at();

alter table public.instructor_preapprovals enable row level security;
revoke all on table public.instructor_preapprovals from anon, authenticated;
grant select, insert, update, delete on table public.instructor_preapprovals to authenticated;

create policy "Administrators can read instructor preapprovals"
on public.instructor_preapprovals for select to authenticated
using (public.is_portal_admin());

create policy "Administrators can create instructor preapprovals"
on public.instructor_preapprovals for insert to authenticated
with check (public.is_portal_admin() and granted_by = auth.uid());

create policy "Administrators can update instructor preapprovals"
on public.instructor_preapprovals for update to authenticated
using (public.is_portal_admin())
with check (public.is_portal_admin());

create policy "Administrators can delete instructor preapprovals"
on public.instructor_preapprovals for delete to authenticated
using (public.is_portal_admin());

create or replace function public.is_approved_instructor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from auth.users as account
      where account.id = auth.uid()
        and account.email_confirmed_at is not null
        and lower(account.email) = lower(auth.jwt() ->> 'email')
    )
    and (
      exists (
        select 1
        from public.instructor_applications as application
        where application.user_id = auth.uid()
          and application.status = 'approved'
          and lower(application.email) = lower(auth.jwt() ->> 'email')
      )
      or exists (
        select 1
        from public.instructor_preapprovals as preapproval
        where preapproval.email = lower(auth.jwt() ->> 'email')
          and preapproval.status = 'active'
          and (preapproval.claimed_by is null or preapproval.claimed_by = auth.uid())
      )
    );
$$;

create or replace function public.claim_preapproved_instructor_access()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_name text;
begin
  if auth.uid() is null or v_email is null then
    return false;
  end if;

  if not exists (
    select 1
    from auth.users as account
    where account.id = auth.uid()
      and account.email_confirmed_at is not null
      and lower(account.email) = v_email
  ) then
    return false;
  end if;

  update public.instructor_preapprovals
  set claimed_by = auth.uid(),
      claimed_at = coalesce(claimed_at, now())
  where email = v_email
    and status = 'active'
    and (claimed_by is null or claimed_by = auth.uid())
  returning name into v_name;

  if v_name is null then
    return false;
  end if;

  update public.profiles
  set display_name = case
    when nullif(trim(display_name), '') is null then v_name
    else display_name
  end
  where user_id = auth.uid();

  return true;
end;
$$;

revoke all on function public.claim_preapproved_instructor_access() from public;
grant execute on function public.claim_preapproved_instructor_access() to authenticated;

drop function if exists public.get_portal_user_directory(text, text, integer, integer);

create function public.get_portal_user_directory(
  p_scope text default 'signed_in',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  account_created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  instructor_status text,
  institution text,
  position_title text,
  instructor_reviewed_at timestamptz,
  roles text[],
  manual_download_count bigint,
  last_manual_download_issued_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text := lower(trim(coalesce(p_scope, 'signed_in')));
  v_search text := lower(trim(coalesce(p_search, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_portal_admin() then
    raise exception 'Portal administrator access is required.';
  end if;

  if v_scope not in ('signed_in', 'instructors') then
    raise exception 'Unsupported user-directory scope.';
  end if;

  return query
  with download_summary as (
    select
      event.user_id,
      count(*)::bigint as manual_download_count,
      max(event.issued_at) as last_manual_download_issued_at
    from public.instructor_manual_download_events as event
    group by event.user_id
  ),
  directory as (
    select
      account.id as user_id,
      lower(account.email) as email,
      coalesce(nullif(trim(profile.display_name), ''), preapproval.name) as display_name,
      account.created_at as account_created_at,
      account.email_confirmed_at,
      account.last_sign_in_at,
      case
        when preapproval.id is not null then 'approved'
        else application.status::text
      end as instructor_status,
      application.institution,
      application.position_title,
      coalesce(application.reviewed_at, preapproval.created_at) as instructor_reviewed_at,
      array_remove(array[
        case when exists (
          select 1
          from public.portal_admins as owner_assignment
          where owner_assignment.user_id = account.id
            and lower(account.email) = 'yjin@usc.edu'
        ) then 'Portal owner' end,
        case when exists (
          select 1
          from public.portal_admin_delegates as delegate
          where delegate.user_id = account.id
            and lower(account.email) = delegate.appointed_email
        ) then 'Delegated administrator' end,
        case when exists (
          select 1
          from public.portal_access_entitlements as entitlement
          where entitlement.user_id = account.id
            and entitlement.role = 'publisher_reviewer'
            and entitlement.status = 'active'
            and (entitlement.expires_at is null or entitlement.expires_at > now())
            and lower(account.email) = entitlement.entitled_email
        ) then 'Publisher reviewer' end,
        case when (
          application.status = 'approved'
          and lower(application.email) = lower(account.email)
        ) or preapproval.id is not null then 'Approved instructor' end,
        case when preapproval.id is not null then 'Preapproved' end,
        case when application.status = 'pending' and preapproval.id is null
          then 'Instructor applicant' end
      ], null)::text[] as roles,
      coalesce(download.manual_download_count, 0::bigint) as manual_download_count,
      download.last_manual_download_issued_at
    from auth.users as account
    left join public.profiles as profile
      on profile.user_id = account.id
    left join public.instructor_applications as application
      on application.user_id = account.id
    left join public.instructor_preapprovals as preapproval
      on preapproval.email = lower(account.email)
      and preapproval.status = 'active'
      and (preapproval.claimed_by is null or preapproval.claimed_by = account.id)
    left join download_summary as download
      on download.user_id = account.id
    where account.email_confirmed_at is not null
      and account.last_sign_in_at is not null
  ),
  filtered as (
    select entry.*
    from directory as entry
    where (
      v_scope = 'signed_in'
      or (
        v_scope = 'instructors'
        and entry.instructor_status = 'approved'
        and 'Approved instructor' = any(entry.roles)
      )
    )
    and (
      v_search = ''
      or entry.email like '%' || v_search || '%'
      or lower(coalesce(entry.display_name, '')) like '%' || v_search || '%'
      or lower(coalesce(entry.institution, '')) like '%' || v_search || '%'
      or lower(coalesce(entry.position_title, '')) like '%' || v_search || '%'
    )
  )
  select
    filtered.user_id,
    filtered.email,
    filtered.display_name,
    filtered.account_created_at,
    filtered.email_confirmed_at,
    filtered.last_sign_in_at,
    filtered.instructor_status,
    filtered.institution,
    filtered.position_title,
    filtered.instructor_reviewed_at,
    filtered.roles,
    filtered.manual_download_count,
    filtered.last_manual_download_issued_at,
    count(*) over() as total_count
  from filtered
  order by filtered.last_sign_in_at desc, filtered.account_created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.get_portal_user_directory(text, text, integer, integer)
from public;

grant execute on function public.get_portal_user_directory(text, text, integer, integer)
to authenticated;

comment on table public.instructor_preapprovals
is 'Owner-curated instructor email allowlist. A matching verified session is required before access is granted.';

comment on function public.claim_preapproved_instructor_access()
is 'Binds an active exact-email instructor preapproval to the currently verified Supabase account.';

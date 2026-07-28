-- Administrator-only directory of verified accounts that have signed in.

create or replace function public.get_portal_user_directory(
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
  with directory as (
    select
      account.id as user_id,
      lower(account.email) as email,
      profile.display_name,
      account.created_at as account_created_at,
      account.email_confirmed_at,
      account.last_sign_in_at,
      application.status::text as instructor_status,
      application.institution,
      application.position_title,
      application.reviewed_at as instructor_reviewed_at,
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
        case when application.status = 'approved'
          and lower(application.email) = lower(account.email)
          then 'Approved instructor' end,
        case when application.status = 'pending'
          then 'Instructor applicant' end
      ], null)::text[] as roles
    from auth.users as account
    left join public.profiles as profile
      on profile.user_id = account.id
    left join public.instructor_applications as application
      on application.user_id = account.id
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

comment on function public.get_portal_user_directory(text, text, integer, integer)
is 'Returns a paginated administrator-only directory of confirmed accounts that have completed at least one sign-in.';

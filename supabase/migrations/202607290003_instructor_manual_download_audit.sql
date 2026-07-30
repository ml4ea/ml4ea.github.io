-- Record successful Instructor's Manual PDF download authorizations and expose
-- per-account summaries through the administrator-only user directory.

create table public.instructor_manual_download_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  edition_id uuid not null references public.instructor_manual_editions(id) on delete restrict,
  notice_version text not null check (length(trim(notice_version)) > 0),
  issued_at timestamptz not null default now()
);

create index instructor_manual_download_events_user_issued_idx
on public.instructor_manual_download_events (user_id, issued_at desc);

create index instructor_manual_download_events_edition_issued_idx
on public.instructor_manual_download_events (edition_id, issued_at desc);

alter table public.instructor_manual_download_events enable row level security;
revoke all on table public.instructor_manual_download_events from anon, authenticated;

create or replace function public.prepare_instructor_manual_download(
  p_edition_id uuid,
  p_notice_version text
)
returns table (
  edition_id uuid,
  pdf_storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_approved_instructor() or public.is_portal_admin()) then
    raise exception 'Approved instructor access is required to download the manual.';
  end if;

  if p_notice_version <> 'manual-copyright-2026-07-29' then
    raise exception 'The copyright notice has changed. Review it and acknowledge it again.';
  end if;

  return query
  select edition.id, edition.pdf_storage_path
  from public.instructor_manual_editions as edition
  where edition.id = p_edition_id
    and edition.is_current = true
    and length(trim(edition.pdf_storage_path)) > 0;

  if not found then
    raise exception 'The current manual PDF is unavailable.';
  end if;
end;
$$;

create or replace function public.record_instructor_manual_download_issued(
  p_edition_id uuid,
  p_notice_version text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id bigint;
begin
  if not (public.is_approved_instructor() or public.is_portal_admin()) then
    raise exception 'Approved instructor access is required to download the manual.';
  end if;

  if p_notice_version <> 'manual-copyright-2026-07-29' then
    raise exception 'The copyright notice has changed. Review it and acknowledge it again.';
  end if;

  if not exists (
    select 1
    from public.instructor_manual_editions as edition
    where edition.id = p_edition_id
      and edition.is_current = true
  ) then
    raise exception 'The current manual PDF is unavailable.';
  end if;

  insert into public.instructor_manual_download_events (
    user_id,
    edition_id,
    notice_version
  ) values (
    auth.uid(),
    p_edition_id,
    p_notice_version
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.prepare_instructor_manual_download(uuid, text) from public;
revoke all on function public.record_instructor_manual_download_issued(uuid, text) from public;
grant execute on function public.prepare_instructor_manual_download(uuid, text) to authenticated;
grant execute on function public.record_instructor_manual_download_issued(uuid, text) to authenticated;

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
      ], null)::text[] as roles,
      coalesce(download.manual_download_count, 0::bigint) as manual_download_count,
      download.last_manual_download_issued_at
    from auth.users as account
    left join public.profiles as profile
      on profile.user_id = account.id
    left join public.instructor_applications as application
      on application.user_id = account.id
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

comment on table public.instructor_manual_download_events
is 'Records each successful issuance of a short-lived Instructor''s Manual PDF download URL.';

comment on function public.get_portal_user_directory(text, text, integer, integer)
is 'Returns the administrator-only account directory with manual download-issued summaries.';

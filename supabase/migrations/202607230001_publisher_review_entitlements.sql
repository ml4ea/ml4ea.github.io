-- Time-limited publisher review access and a dormant book-owner entitlement.

create table public.portal_access_entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entitled_email text not null,
  role text not null check (role in ('publisher_reviewer', 'book_owner')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create index portal_access_entitlements_active_role_idx
on public.portal_access_entitlements (role, status, expires_at);

create trigger portal_access_entitlements_set_updated_at
before update on public.portal_access_entitlements
for each row execute function public.set_updated_at();

alter table public.portal_access_entitlements enable row level security;
revoke all on table public.portal_access_entitlements from anon, authenticated;

create or replace function public.has_portal_entitlement(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_access_entitlements as entitlement
    join auth.users as account on account.id = entitlement.user_id
    where entitlement.user_id = auth.uid()
      and entitlement.role = p_role
      and entitlement.status = 'active'
      and (entitlement.expires_at is null or entitlement.expires_at > now())
      and account.email_confirmed_at is not null
      and lower(account.email) = entitlement.entitled_email
  );
$$;

create or replace function public.is_publisher_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_portal_entitlement('publisher_reviewer');
$$;

create or replace function public.is_verified_book_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_portal_entitlement('book_owner');
$$;

create or replace function public.can_view_instructor_manual()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_approved_instructor()
      or public.is_portal_admin()
      or public.is_publisher_reviewer();
$$;

create or replace function public.get_my_portal_entitlements()
returns table (
  entitlement_role text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select entitlement.role, entitlement.expires_at
  from public.portal_access_entitlements as entitlement
  join auth.users as account on account.id = entitlement.user_id
  where entitlement.user_id = auth.uid()
    and entitlement.status = 'active'
    and (entitlement.expires_at is null or entitlement.expires_at > now())
    and account.email_confirmed_at is not null
    and lower(account.email) = entitlement.entitled_email
  order by entitlement.role;
$$;

create or replace function public.get_portal_access_entitlements()
returns table (
  entitlement_id bigint,
  entitlement_user_id uuid,
  entitlement_email text,
  entitlement_role text,
  entitlement_status text,
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'Portal administrator access is required.';
  end if;

  return query
  select entitlement.id,
         entitlement.user_id,
         entitlement.entitled_email,
         entitlement.role,
         entitlement.status,
         entitlement.granted_at,
         entitlement.expires_at,
         entitlement.revoked_at
  from public.portal_access_entitlements as entitlement
  order by entitlement.granted_at desc, entitlement.id desc;
end;
$$;

create or replace function public.grant_portal_access_entitlement(
  p_email text,
  p_role text,
  p_expires_at timestamptz
)
returns table (
  entitlement_id bigint,
  entitlement_user_id uuid,
  entitlement_email text,
  entitlement_role text,
  entitlement_status text,
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_role text := lower(trim(p_role));
  v_user auth.users;
begin
  if not public.is_portal_admin() then
    raise exception 'Portal administrator access is required.';
  end if;
  if v_role = 'book_owner' then
    raise exception 'Book-owner activation is disabled pending written publisher permission.';
  end if;
  if v_role <> 'publisher_reviewer' then
    raise exception 'Unsupported portal entitlement.';
  end if;
  if coalesce(v_email, '') = '' then
    raise exception 'Enter the reviewer account email address.';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Publisher review access requires a future expiration date.';
  end if;
  if p_expires_at > now() + interval '180 days' then
    raise exception 'Publisher review access cannot exceed 180 days.';
  end if;

  select account.* into v_user
  from auth.users as account
  where lower(account.email) = v_email;

  if v_user.id is null then
    raise exception 'This email has not signed in to the ML4EA portal yet.';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'This account must verify its email before access can be granted.';
  end if;

  insert into public.portal_access_entitlements (
    user_id, entitled_email, role, status, granted_by, granted_at,
    expires_at, revoked_by, revoked_at
  ) values (
    v_user.id, v_email, v_role, 'active', auth.uid(), now(),
    p_expires_at, null, null
  )
  on conflict (user_id, role) do update set
    entitled_email = excluded.entitled_email,
    status = 'active',
    granted_by = excluded.granted_by,
    granted_at = now(),
    expires_at = excluded.expires_at,
    revoked_by = null,
    revoked_at = null,
    updated_at = now();

  insert into public.portal_admin_audit_log (
    actor_id, action, target_user_id, target_email, details
  ) values (
    auth.uid(), 'entitlement_granted', v_user.id, v_email,
    jsonb_build_object('role', v_role, 'expires_at', p_expires_at)
  );

  return query select * from public.get_portal_access_entitlements();
end;
$$;

create or replace function public.revoke_portal_access_entitlement(p_entitlement_id bigint)
returns table (
  entitlement_id bigint,
  entitlement_user_id uuid,
  entitlement_email text,
  entitlement_role text,
  entitlement_status text,
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entitlement public.portal_access_entitlements;
begin
  if not public.is_portal_admin() then
    raise exception 'Portal administrator access is required.';
  end if;

  update public.portal_access_entitlements
  set status = 'revoked', revoked_by = auth.uid(), revoked_at = now()
  where id = p_entitlement_id and status = 'active'
  returning * into v_entitlement;

  if v_entitlement.id is null then
    raise exception 'The active entitlement was not found.';
  end if;

  insert into public.portal_admin_audit_log (
    actor_id, action, target_user_id, target_email, details
  ) values (
    auth.uid(), 'entitlement_revoked', v_entitlement.user_id,
    v_entitlement.entitled_email,
    jsonb_build_object('role', v_entitlement.role)
  );

  return query select * from public.get_portal_access_entitlements();
end;
$$;

drop policy if exists "Approved instructors can read manual editions"
on public.instructor_manual_editions;
create policy "Authorized accounts can read manual editions"
on public.instructor_manual_editions for select to authenticated
using (public.can_view_instructor_manual());

drop policy if exists "Approved instructors can read manual sections"
on public.instructor_manual_sections;
create policy "Authorized accounts can read manual sections"
on public.instructor_manual_sections for select to authenticated
using (public.can_view_instructor_manual());

create or replace function public.search_instructor_manual(p_query text)
returns table (
  slug text,
  title text,
  chapter_number integer,
  chapter_title text,
  snippet text,
  rank real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query tsquery;
begin
  if not public.can_view_instructor_manual() then
    raise exception 'Protected manual access is required.';
  end if;
  if char_length(trim(coalesce(p_query, ''))) < 2 then
    return;
  end if;

  v_query := websearch_to_tsquery('english', trim(p_query));
  return query
  select section.slug,
         section.title,
         section.chapter_number,
         section.chapter_title,
         ts_headline(
           'english', section.search_text, v_query,
           'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=12, ShortWord=3'
         ) as snippet,
         ts_rank(
           to_tsvector('english', section.title || ' ' || section.chapter_title || ' ' || section.search_text),
           v_query
         ) as rank
  from public.instructor_manual_sections section
  join public.instructor_manual_editions edition on edition.id = section.edition_id
  where edition.is_current
    and to_tsvector('english', section.title || ' ' || section.chapter_title || ' ' || section.search_text) @@ v_query
  order by 6 desc, section.sort_order
  limit 30;
end;
$$;

revoke all on function public.has_portal_entitlement(text) from public;
revoke all on function public.is_publisher_reviewer() from public;
revoke all on function public.is_verified_book_owner() from public;
revoke all on function public.can_view_instructor_manual() from public;
revoke all on function public.get_my_portal_entitlements() from public;
revoke all on function public.get_portal_access_entitlements() from public;
revoke all on function public.grant_portal_access_entitlement(text, text, timestamptz) from public;
revoke all on function public.revoke_portal_access_entitlement(bigint) from public;

grant execute on function public.is_publisher_reviewer() to authenticated;
grant execute on function public.is_verified_book_owner() to authenticated;
grant execute on function public.can_view_instructor_manual() to authenticated;
grant execute on function public.get_my_portal_entitlements() to authenticated;
grant execute on function public.get_portal_access_entitlements() to authenticated;
grant execute on function public.grant_portal_access_entitlement(text, text, timestamptz) to authenticated;
grant execute on function public.revoke_portal_access_entitlement(bigint) to authenticated;

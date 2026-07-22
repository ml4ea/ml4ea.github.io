-- ML4EA Pass 4: verified instructor access and protected teaching resources.

create type public.instructor_application_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.instructor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  institution text not null check (char_length(institution) between 2 and 160),
  department text not null check (char_length(department) between 2 and 160),
  position_title text not null check (char_length(position_title) between 2 and 100),
  faculty_url text not null check (faculty_url ~ '^https://'),
  course_context text check (course_context is null or char_length(course_context) <= 2000),
  status public.instructor_application_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.instructor_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  storage_path text not null unique,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger instructor_applications_set_updated_at
before update on public.instructor_applications
for each row execute function public.set_updated_at();

create trigger instructor_resources_set_updated_at
before update on public.instructor_resources
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (user_id, display_name)
select id, nullif(raw_user_meta_data ->> 'full_name', '') from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.portal_admins where user_id = auth.uid());
$$;

create or replace function public.is_approved_instructor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.instructor_applications
    where user_id = auth.uid()
      and status = 'approved'
      and email = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function public.is_likely_institutional_email(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    candidate ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and lower(split_part(candidate, '@', 2)) <> all (array[
      'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
      'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com',
      'proton.me', 'protonmail.com', 'mail.com', 'gmx.com', 'gmx.net'
    ]);
$$;

create or replace function public.submit_instructor_application(
  p_institution text,
  p_department text,
  p_position_title text,
  p_faculty_url text,
  p_course_context text default null
)
returns public.instructor_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_result public.instructor_applications;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if not coalesce(public.is_likely_institutional_email(v_email), false) then
    raise exception 'Use an institutional email address. Contact the portal administrator if your institution uses another domain.';
  end if;
  if trim(p_institution) = '' or trim(p_department) = '' or trim(p_position_title) = '' then
    raise exception 'Institution, department, and position are required.';
  end if;
  if p_faculty_url !~ '^https://' then
    raise exception 'Provide a secure institutional profile URL beginning with https://.';
  end if;

  insert into public.instructor_applications (
    user_id, email, institution, department, position_title, faculty_url,
    course_context, status, reviewed_by, reviewed_at, decision_note
  ) values (
    auth.uid(), v_email, trim(p_institution), trim(p_department),
    trim(p_position_title), trim(p_faculty_url), nullif(trim(p_course_context), ''),
    'pending', null, null, null
  )
  on conflict (user_id) do update set
    email = excluded.email,
    institution = excluded.institution,
    department = excluded.department,
    position_title = excluded.position_title,
    faculty_url = excluded.faculty_url,
    course_context = excluded.course_context,
    status = 'pending',
    reviewed_by = null,
    reviewed_at = null,
    decision_note = null
  where public.instructor_applications.status <> 'approved'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Approved applications cannot be resubmitted.';
  end if;
  return v_result;
end;
$$;

create or replace function public.review_instructor_application(
  p_application_id uuid,
  p_status public.instructor_application_status,
  p_decision_note text default null
)
returns public.instructor_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.instructor_applications;
begin
  if not public.is_portal_admin() then
    raise exception 'Portal administrator access is required.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'A review decision must be approved or rejected.';
  end if;

  update public.instructor_applications
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      decision_note = nullif(trim(p_decision_note), '')
  where id = p_application_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Instructor application not found.';
  end if;
  return v_result;
end;
$$;

alter table public.profiles enable row level security;
alter table public.portal_admins enable row level security;
alter table public.instructor_applications enable row level security;
alter table public.instructor_resources enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.portal_admins from anon, authenticated;
revoke all on table public.instructor_applications from anon, authenticated;
revoke all on table public.instructor_resources from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.portal_admins to authenticated;
grant select on table public.instructor_applications to authenticated;
grant select, insert, update, delete on table public.instructor_resources to authenticated;

create policy "Users can read their own profile"
on public.profiles for select to authenticated
using (user_id = auth.uid() or public.is_portal_admin());

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Administrators can confirm their role"
on public.portal_admins for select to authenticated
using (user_id = auth.uid());

create policy "Applicants and administrators can read applications"
on public.instructor_applications for select to authenticated
using (user_id = auth.uid() or public.is_portal_admin());

create policy "Approved instructors can read published resources"
on public.instructor_resources for select to authenticated
using (published and (public.is_approved_instructor() or public.is_portal_admin()));

create policy "Administrators can manage resources"
on public.instructor_resources for all to authenticated
using (public.is_portal_admin()) with check (public.is_portal_admin());

revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.is_portal_admin() from public;
revoke all on function public.is_approved_instructor() from public;
revoke all on function public.is_likely_institutional_email(text) from public;
revoke all on function public.submit_instructor_application(text, text, text, text, text) from public;
revoke all on function public.review_instructor_application(uuid, public.instructor_application_status, text) from public;
grant execute on function public.is_portal_admin() to authenticated;
grant execute on function public.is_approved_instructor() to authenticated;
grant execute on function public.submit_instructor_application(text, text, text, text, text) to authenticated;
grant execute on function public.review_instructor_application(uuid, public.instructor_application_status, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'instructor-materials',
  'instructor-materials',
  false,
  52428800,
  array[
    'application/pdf',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Approved instructors can download protected materials"
on storage.objects for select to authenticated
using (bucket_id = 'instructor-materials' and (public.is_approved_instructor() or public.is_portal_admin()));

create policy "Administrators can upload protected materials"
on storage.objects for insert to authenticated
with check (bucket_id = 'instructor-materials' and public.is_portal_admin());

create policy "Administrators can update protected materials"
on storage.objects for update to authenticated
using (bucket_id = 'instructor-materials' and public.is_portal_admin())
with check (bucket_id = 'instructor-materials' and public.is_portal_admin());

create policy "Administrators can delete protected materials"
on storage.objects for delete to authenticated
using (bucket_id = 'instructor-materials' and public.is_portal_admin());

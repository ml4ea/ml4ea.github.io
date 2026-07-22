-- ML4EA community discussions: public reading, account posting, and a protected instructor space.

create table public.discussion_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  visibility text not null check (visibility in ('public', 'instructors')),
  posting_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discussion_threads (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.discussion_categories(id),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 60),
  title text not null check (char_length(title) between 8 and 180),
  body text not null check (char_length(body) between 20 and 10000),
  chapter_number integer check (chapter_number between 1 and 15),
  ae_number text check (ae_number is null or char_length(ae_number) between 3 and 20),
  status text not null default 'open' check (status in ('open', 'locked', 'hidden')),
  pinned boolean not null default false,
  reply_count integer not null default 0 check (reply_count >= 0),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.discussion_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 60),
  body text not null check (char_length(body) between 2 and 10000),
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  helpful boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discussion_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.discussion_threads(id) on delete cascade,
  reply_id uuid references public.discussion_replies(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'privacy', 'copyright', 'incorrect-category', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((thread_id is not null)::integer + (reply_id is not null)::integer = 1)
);

create unique index discussion_reports_one_thread_report
on public.discussion_reports (reporter_id, thread_id)
where thread_id is not null and status = 'open';

create unique index discussion_reports_one_reply_report
on public.discussion_reports (reporter_id, reply_id)
where reply_id is not null and status = 'open';

create index discussion_threads_category_activity
on public.discussion_threads (category_id, pinned desc, last_activity_at desc);

create index discussion_replies_thread_created
on public.discussion_replies (thread_id, created_at);

create trigger discussion_categories_set_updated_at
before update on public.discussion_categories
for each row execute function public.set_updated_at();

create trigger discussion_threads_set_updated_at
before update on public.discussion_threads
for each row execute function public.set_updated_at();

create trigger discussion_replies_set_updated_at
before update on public.discussion_replies
for each row execute function public.set_updated_at();

insert into public.discussion_categories (slug, name, description, visibility, posting_enabled, sort_order)
values
  ('announcements', 'Announcements', 'Portal news, releases, and community notices from ML4EA.', 'public', false, 10),
  ('learning-the-book', 'Learning the Book', 'Questions about chapters, concepts, assumptions, and engineering interpretation.', 'public', true, 20),
  ('application-examples', 'Application Examples', 'Notebook results, modeling choices, datasets, and troubleshooting.', 'public', true, 30),
  ('engineering-applications', 'Engineering Applications', 'Domain problems, practical experience, validation, and deployment.', 'public', true, 40),
  ('teaching-practice', 'Teaching Practice', 'Course design, assignments, classroom experience, and teaching insights.', 'instructors', true, 50),
  ('ideas-feedback', 'Ideas and Feedback', 'Ideas for the book, portal, resources, and community.', 'public', true, 60)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  visibility = excluded.visibility,
  posting_enabled = excluded.posting_enabled,
  sort_order = excluded.sort_order;

create or replace function public.can_read_discussion_category(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.discussion_categories category
    where category.id = p_category_id
      and (
        category.visibility = 'public'
        or (
          auth.uid() is not null
          and (public.is_approved_instructor() or public.is_portal_admin())
        )
      )
  );
$$;

alter table public.discussion_categories enable row level security;
alter table public.discussion_threads enable row level security;
alter table public.discussion_replies enable row level security;
alter table public.discussion_reports enable row level security;

revoke all on table public.discussion_categories from anon, authenticated;
revoke all on table public.discussion_threads from anon, authenticated;
revoke all on table public.discussion_replies from anon, authenticated;
revoke all on table public.discussion_reports from anon, authenticated;

grant select on table public.discussion_categories to anon, authenticated;
grant select (
  id, category_id, author_name, title, body, chapter_number, ae_number,
  status, pinned, reply_count, last_activity_at, created_at, updated_at
) on table public.discussion_threads to anon, authenticated;
grant select (
  id, thread_id, author_name, body, status, helpful, created_at, updated_at
) on table public.discussion_replies to anon, authenticated;
grant insert, update, delete on table public.discussion_categories to authenticated;
grant insert, update, delete on table public.discussion_threads to authenticated;
grant insert, update, delete on table public.discussion_replies to authenticated;
grant select, update, delete on table public.discussion_reports to authenticated;

create policy "Participants can read available discussion categories"
on public.discussion_categories for select to anon, authenticated
using (public.can_read_discussion_category(id));

create policy "Participants can read available threads"
on public.discussion_threads for select to anon, authenticated
using (status <> 'hidden' and public.can_read_discussion_category(category_id));

create policy "Participants can read visible replies"
on public.discussion_replies for select to anon, authenticated
using (
  status = 'visible'
  and exists (
    select 1 from public.discussion_threads thread
    where thread.id = thread_id
      and thread.status <> 'hidden'
      and public.can_read_discussion_category(thread.category_id)
  )
);

create policy "Administrators can manage discussion categories"
on public.discussion_categories for all to authenticated
using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy "Administrators can manage discussion threads"
on public.discussion_threads for all to authenticated
using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy "Administrators can manage discussion replies"
on public.discussion_replies for all to authenticated
using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy "Administrators can review discussion reports"
on public.discussion_reports for select to authenticated
using (public.is_portal_admin());

create policy "Administrators can update discussion reports"
on public.discussion_reports for update to authenticated
using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy "Administrators can delete discussion reports"
on public.discussion_reports for delete to authenticated
using (public.is_portal_admin());

create or replace function public.create_discussion_thread(
  p_category_slug text,
  p_title text,
  p_body text,
  p_display_name text,
  p_chapter_number integer default null,
  p_ae_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.discussion_categories;
  v_thread_id uuid;
  v_name text := trim(p_display_name);
begin
  if auth.uid() is null then
    raise exception 'Sign in to start a discussion.';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'Display name must contain 2 to 60 characters.';
  end if;
  if char_length(trim(p_title)) not between 8 and 180 then
    raise exception 'Title must contain 8 to 180 characters.';
  end if;
  if char_length(trim(p_body)) not between 20 and 10000 then
    raise exception 'Discussion text must contain 20 to 10,000 characters.';
  end if;
  if p_chapter_number is not null and p_chapter_number not between 1 and 15 then
    raise exception 'Chapter must be between 1 and 15.';
  end if;

  select * into v_category
  from public.discussion_categories
  where slug = p_category_slug;

  if v_category.id is null or not public.can_read_discussion_category(v_category.id) then
    raise exception 'This discussion category is not available to your account.';
  end if;
  if not v_category.posting_enabled and not public.is_portal_admin() then
    raise exception 'Only portal administrators can post in this category.';
  end if;
  if (
    select count(*) from public.discussion_threads
    where author_id = auth.uid() and created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Please wait before starting another discussion.';
  end if;

  update public.profiles set display_name = v_name where user_id = auth.uid();

  insert into public.discussion_threads (
    category_id, author_id, author_name, title, body, chapter_number, ae_number
  ) values (
    v_category.id, auth.uid(), v_name, trim(p_title), trim(p_body),
    p_chapter_number, nullif(trim(coalesce(p_ae_number, '')), '')
  ) returning id into v_thread_id;

  return v_thread_id;
end;
$$;

create or replace function public.create_discussion_reply(
  p_thread_id uuid,
  p_body text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.discussion_threads;
  v_reply_id uuid;
  v_name text := trim(p_display_name);
begin
  if auth.uid() is null then
    raise exception 'Sign in to reply.';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'Display name must contain 2 to 60 characters.';
  end if;
  if char_length(trim(p_body)) not between 2 and 10000 then
    raise exception 'Reply must contain 2 to 10,000 characters.';
  end if;

  select * into v_thread
  from public.discussion_threads
  where id = p_thread_id;

  if v_thread.id is null or not public.can_read_discussion_category(v_thread.category_id) then
    raise exception 'Discussion not found.';
  end if;
  if v_thread.status <> 'open' then
    raise exception 'This discussion is closed to new replies.';
  end if;
  if (
    select count(*) from public.discussion_replies
    where author_id = auth.uid() and created_at > now() - interval '10 minutes'
  ) >= 12 then
    raise exception 'Please wait before posting another reply.';
  end if;

  update public.profiles set display_name = v_name where user_id = auth.uid();

  insert into public.discussion_replies (thread_id, author_id, author_name, body)
  values (p_thread_id, auth.uid(), v_name, trim(p_body))
  returning id into v_reply_id;

  update public.discussion_threads
  set reply_count = reply_count + 1, last_activity_at = now()
  where id = p_thread_id;

  return v_reply_id;
end;
$$;

create or replace function public.report_discussion_item(
  p_thread_id uuid default null,
  p_reply_id uuid default null,
  p_reason text default 'other',
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report_id uuid;
  v_category_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to report a discussion.';
  end if;
  if (p_thread_id is not null)::integer + (p_reply_id is not null)::integer <> 1 then
    raise exception 'Choose one discussion or reply to report.';
  end if;
  if p_reason not in ('spam', 'harassment', 'privacy', 'copyright', 'incorrect-category', 'other') then
    raise exception 'Select a valid report reason.';
  end if;

  if p_thread_id is not null then
    select category_id into v_category_id from public.discussion_threads where id = p_thread_id;
  else
    select thread.category_id into v_category_id
    from public.discussion_replies reply
    join public.discussion_threads thread on thread.id = reply.thread_id
    where reply.id = p_reply_id;
  end if;

  if v_category_id is null or not public.can_read_discussion_category(v_category_id) then
    raise exception 'Discussion item not found.';
  end if;

  insert into public.discussion_reports (reporter_id, thread_id, reply_id, reason, details)
  values (auth.uid(), p_thread_id, p_reply_id, p_reason, nullif(trim(coalesce(p_details, '')), ''))
  returning id into v_report_id;

  return v_report_id;
exception
  when unique_violation then
    raise exception 'You have already reported this item.';
end;
$$;

revoke all on function public.can_read_discussion_category(uuid) from public;
revoke all on function public.create_discussion_thread(text, text, text, text, integer, text) from public;
revoke all on function public.create_discussion_reply(uuid, text, text) from public;
revoke all on function public.report_discussion_item(uuid, uuid, text, text) from public;

grant execute on function public.can_read_discussion_category(uuid) to anon, authenticated;
grant execute on function public.create_discussion_thread(text, text, text, text, integer, text) to authenticated;
grant execute on function public.create_discussion_reply(uuid, text, text) to authenticated;
grant execute on function public.report_discussion_item(uuid, uuid, text, text) to authenticated;

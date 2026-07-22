-- Protected online edition of the ML4EA instructor's manual.

create table public.instructor_manual_editions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  version_label text not null,
  published_on date not null,
  pdf_storage_path text not null,
  is_current boolean not null default false,
  usage_notice text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index instructor_manual_one_current_edition
on public.instructor_manual_editions (is_current)
where is_current;

create table public.instructor_manual_sections (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.instructor_manual_editions(id) on delete cascade,
  slug text not null,
  chapter_number integer not null check (chapter_number between 0 and 7),
  chapter_title text not null,
  title text not null,
  kind text not null check (kind in ('frontmatter', 'chapter', 'section')),
  sort_order integer not null,
  body_html text not null,
  search_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, slug),
  unique (edition_id, sort_order)
);

create index instructor_manual_sections_edition_order
on public.instructor_manual_sections (edition_id, sort_order);

create index instructor_manual_sections_search
on public.instructor_manual_sections
using gin (to_tsvector('english', title || ' ' || chapter_title || ' ' || search_text));

create trigger instructor_manual_editions_set_updated_at
before update on public.instructor_manual_editions
for each row execute function public.set_updated_at();

create trigger instructor_manual_sections_set_updated_at
before update on public.instructor_manual_sections
for each row execute function public.set_updated_at();

alter table public.instructor_manual_editions enable row level security;
alter table public.instructor_manual_sections enable row level security;

revoke all on table public.instructor_manual_editions from anon, authenticated;
revoke all on table public.instructor_manual_sections from anon, authenticated;
grant select, insert, update, delete on table public.instructor_manual_editions to authenticated;
grant select, insert, update, delete on table public.instructor_manual_sections to authenticated;

create policy "Approved instructors can read manual editions"
on public.instructor_manual_editions for select to authenticated
using (public.is_approved_instructor() or public.is_portal_admin());

create policy "Administrators can manage manual editions"
on public.instructor_manual_editions for all to authenticated
using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy "Approved instructors can read manual sections"
on public.instructor_manual_sections for select to authenticated
using (public.is_approved_instructor() or public.is_portal_admin());

create policy "Administrators can manage manual sections"
on public.instructor_manual_sections for all to authenticated
using (public.is_portal_admin()) with check (public.is_portal_admin());

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
  if not (public.is_approved_instructor() or public.is_portal_admin()) then
    raise exception 'Approved instructor access is required.';
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

revoke all on function public.search_instructor_manual(text) from public;
grant execute on function public.search_instructor_manual(text) to authenticated;

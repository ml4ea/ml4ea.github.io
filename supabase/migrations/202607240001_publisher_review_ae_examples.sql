-- Three complete AE notebook previews for time-limited publisher review.

create table public.publisher_review_ae_examples (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  ae_number text not null unique,
  title text not null,
  topic text not null check (topic in ('classification', 'deep_neural_network', 'generative_models')),
  method text not null,
  source_filename text not null,
  source_sha256 text not null,
  body_html text not null,
  sort_order integer not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger publisher_review_ae_examples_set_updated_at
before update on public.publisher_review_ae_examples
for each row execute function public.set_updated_at();

alter table public.publisher_review_ae_examples enable row level security;

revoke all on table public.publisher_review_ae_examples from anon, authenticated;
grant select on table public.publisher_review_ae_examples to authenticated;

create policy "Publisher reviewers can read selected AE examples"
on public.publisher_review_ae_examples for select to authenticated
using (public.is_publisher_reviewer() or public.is_portal_admin());

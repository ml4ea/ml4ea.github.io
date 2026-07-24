-- Dormant, permission-gated delivery of protected AE notebooks.
-- Both delivery modes remain disabled until written publisher permission exists.

create table public.ae_delivery_settings (
  singleton boolean primary key default true check (singleton),
  colab_enabled boolean not null default false,
  download_enabled boolean not null default false,
  notice_version text not null default 'prelaunch-2026-07',
  notice_text text not null default
    'These Application Example notebooks accompany Machine Learning for Engineering Applications. Access is personal and limited to your authorized account. Do not share, republish, post publicly, or redistribute the notebook or its contents.',
  permission_reference text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (
    (not colab_enabled and not download_enabled)
    or (
      nullif(trim(permission_reference), '') is not null
      and approved_at is not null
      and approved_by is not null
    )
  )
);

insert into public.ae_delivery_settings (singleton) values (true);

create trigger ae_delivery_settings_set_updated_at
before update on public.ae_delivery_settings
for each row execute function public.set_updated_at();

alter table public.ae_delivery_settings enable row level security;
revoke all on table public.ae_delivery_settings from anon, authenticated;

create table public.ae_notebook_files (
  slug text primary key,
  ae_number text not null,
  title text not null,
  source_filename text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  notebook_version text not null default '1.0',
  storage_path text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ae_notebook_files_set_updated_at
before update on public.ae_notebook_files
for each row execute function public.set_updated_at();

alter table public.ae_notebook_files enable row level security;
revoke all on table public.ae_notebook_files from anon, authenticated;

create table public.ae_delivery_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  account_email text not null,
  notebook_slug text not null references public.ae_notebook_files(slug) on delete restrict,
  ae_number text not null,
  source_filename text not null,
  source_sha256 text not null,
  notebook_version text not null,
  notice_version text not null,
  action text not null check (action in ('colab', 'download')),
  status text not null default 'authorized'
    check (status in ('authorized', 'delivered', 'failed')),
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  failure_code text
);

create index ae_delivery_audit_user_requested_idx
on public.ae_delivery_audit (user_id, requested_at desc);

alter table public.ae_delivery_audit enable row level security;
revoke all on table public.ae_delivery_audit from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ae-notebooks',
  'ae-notebooks',
  false,
  52428800,
  array['application/json', 'application/x-ipynb+json']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately create no client Storage policies. Only the delivery Edge
-- Function's service-role client may sign objects after the RPC below succeeds.

create or replace function public.get_ae_delivery_capabilities()
returns table (
  eligible boolean,
  colab_enabled boolean,
  download_enabled boolean,
  notice_version text,
  notice_text text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_verified_book_owner(),
    settings.colab_enabled and public.is_verified_book_owner(),
    settings.download_enabled and public.is_verified_book_owner(),
    settings.notice_version,
    settings.notice_text
  from public.ae_delivery_settings as settings
  where settings.singleton;
$$;

create or replace function public.prepare_ae_notebook_delivery(
  p_slug text,
  p_action text,
  p_notice_version text
)
returns table (
  audit_id uuid,
  storage_path text,
  source_filename text,
  source_sha256 text,
  notebook_version text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_settings public.ae_delivery_settings;
  v_notebook public.ae_notebook_files;
  v_user auth.users;
  v_audit_id uuid;
begin
  if not public.is_verified_book_owner() then
    raise exception 'A verified book-owner entitlement is required.';
  end if;

  if v_action not in ('colab', 'download') then
    raise exception 'Unsupported notebook delivery action.';
  end if;

  select * into v_settings
  from public.ae_delivery_settings
  where singleton;

  if v_settings.singleton is null
     or (v_action = 'colab' and not v_settings.colab_enabled)
     or (v_action = 'download' and not v_settings.download_enabled) then
    raise exception 'This notebook delivery option is not enabled.';
  end if;

  if p_notice_version is distinct from v_settings.notice_version then
    raise exception 'The access notice has changed. Review it and acknowledge it again.';
  end if;

  select * into v_notebook
  from public.ae_notebook_files
  where slug = p_slug and active;

  if v_notebook.slug is null then
    raise exception 'The protected notebook is not available.';
  end if;

  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null or v_user.email_confirmed_at is null then
    raise exception 'A verified account is required.';
  end if;

  insert into public.ae_delivery_audit (
    user_id, account_email, notebook_slug, ae_number, source_filename,
    source_sha256, notebook_version, notice_version, action
  ) values (
    v_user.id, lower(v_user.email), v_notebook.slug, v_notebook.ae_number,
    v_notebook.source_filename, v_notebook.source_sha256,
    v_notebook.notebook_version, v_settings.notice_version, v_action
  )
  returning id into v_audit_id;

  return query
  select v_audit_id, v_notebook.storage_path, v_notebook.source_filename,
         v_notebook.source_sha256, v_notebook.notebook_version;
end;
$$;

-- Activation is intentionally owner-only and requires a written-permission
-- reference. This function does not enable the still-dormant book_owner grant.
create or replace function public.configure_ae_delivery(
  p_colab_enabled boolean,
  p_download_enabled boolean,
  p_permission_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_owner() then
    raise exception 'The permanent portal owner is required.';
  end if;

  if (p_colab_enabled or p_download_enabled)
     and nullif(trim(coalesce(p_permission_reference, '')), '') is null then
    raise exception 'A written publisher-permission reference is required.';
  end if;

  update public.ae_delivery_settings
  set colab_enabled = p_colab_enabled,
      download_enabled = p_download_enabled,
      permission_reference = nullif(trim(p_permission_reference), ''),
      approved_at = case when p_colab_enabled or p_download_enabled then now() else null end,
      approved_by = case when p_colab_enabled or p_download_enabled then auth.uid() else null end;

  insert into public.portal_admin_audit_log (
    actor_id, action, target_user_id, target_email, details
  ) values (
    auth.uid(), 'ae_delivery_configured', auth.uid(),
    (select lower(account.email) from auth.users as account where account.id = auth.uid()),
    jsonb_build_object(
      'colab_enabled', p_colab_enabled,
      'download_enabled', p_download_enabled,
      'permission_reference', nullif(trim(p_permission_reference), '')
    )
  );
end;
$$;

drop policy if exists "Publisher reviewers can read selected AE examples"
on public.publisher_review_ae_examples;
create policy "Authorized accounts can read selected AE examples"
on public.publisher_review_ae_examples for select to authenticated
using (
  public.is_publisher_reviewer()
  or public.is_portal_admin()
  or public.is_verified_book_owner()
);

revoke all on function public.get_ae_delivery_capabilities() from public;
revoke all on function public.prepare_ae_notebook_delivery(text, text, text) from public;
revoke all on function public.configure_ae_delivery(boolean, boolean, text) from public;

grant execute on function public.get_ae_delivery_capabilities() to authenticated;
grant execute on function public.prepare_ae_notebook_delivery(text, text, text) to authenticated;
grant execute on function public.configure_ae_delivery(boolean, boolean, text) to authenticated;

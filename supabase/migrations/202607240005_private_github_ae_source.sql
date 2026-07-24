-- Keep protected AE notebooks in their private GitHub repository as the single
-- source of truth. Supabase retains only access, audit, and source metadata.

alter table public.ae_notebook_files
add column if not exists github_path text;

update public.ae_notebook_files
set github_path = source_filename
where github_path is null;

alter table public.ae_notebook_files
alter column github_path set not null;

create unique index if not exists ae_notebook_files_github_path_idx
on public.ae_notebook_files (github_path);

comment on column public.ae_notebook_files.github_path is
  'Repository-relative path in the private ml4ea/ae-notebooks GitHub repository.';

drop function if exists public.prepare_ae_notebook_delivery(text, text, text);

create function public.prepare_ae_notebook_delivery(
  p_slug text,
  p_action text,
  p_notice_version text
)
returns table (
  audit_id uuid,
  github_path text,
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
  v_review_tester boolean :=
    public.is_portal_owner() or public.is_publisher_reviewer();
  v_book_owner boolean := public.is_verified_book_owner();
begin
  if not v_review_tester and not v_book_owner then
    raise exception 'An active publisher-review or verified book-owner entitlement is required.';
  end if;

  if v_action not in ('colab', 'download') then
    raise exception 'Unsupported notebook delivery action.';
  end if;

  select * into v_settings
  from public.ae_delivery_settings
  where singleton;

  if v_settings.singleton is null
     or (
       v_action = 'colab'
       and not (
         (v_settings.review_test_enabled and v_review_tester)
         or (v_settings.colab_enabled and v_book_owner)
       )
     )
     or (
       v_action = 'download'
       and not (
         (v_settings.review_test_enabled and v_review_tester)
         or (v_settings.download_enabled and v_book_owner)
       )
     ) then
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
  select v_audit_id, v_notebook.github_path, v_notebook.source_filename,
         v_notebook.source_sha256, v_notebook.notebook_version;
end;
$$;

revoke all on function public.prepare_ae_notebook_delivery(text, text, text) from public;
grant execute on function public.prepare_ae_notebook_delivery(text, text, text) to authenticated;

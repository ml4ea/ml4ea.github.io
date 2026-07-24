-- Exercise the protected AE delivery workflow during publisher review without
-- enabling future book-owner distribution.

alter table public.ae_delivery_settings
add column if not exists review_test_enabled boolean not null default true;

comment on column public.ae_delivery_settings.review_test_enabled is
  'Allows only the permanent portal owner and active publisher reviewers to test both delivery modes.';

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
  with access as (
    select
      public.is_portal_owner() or public.is_publisher_reviewer() as review_tester,
      public.is_verified_book_owner() as book_owner
  )
  select
    access.review_tester or access.book_owner,
    (settings.review_test_enabled and access.review_tester)
      or (settings.colab_enabled and access.book_owner),
    (settings.review_test_enabled and access.review_tester)
      or (settings.download_enabled and access.book_owner),
    settings.notice_version,
    settings.notice_text
  from public.ae_delivery_settings as settings
  cross join access
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
  select v_audit_id, v_notebook.storage_path, v_notebook.source_filename,
         v_notebook.source_sha256, v_notebook.notebook_version;
end;
$$;

revoke all on function public.get_ae_delivery_capabilities() from public;
revoke all on function public.prepare_ae_notebook_delivery(text, text, text) from public;
grant execute on function public.get_ae_delivery_capabilities() to authenticated;
grant execute on function public.prepare_ae_notebook_delivery(text, text, text) to authenticated;

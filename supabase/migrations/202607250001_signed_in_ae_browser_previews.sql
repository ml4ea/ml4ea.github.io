-- Let verified portal accounts read the three prelaunch browser previews.
-- Notebook file delivery remains governed separately by the protected
-- delivery capability and preparation functions.

create or replace function public.has_verified_portal_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as account
    where account.id = auth.uid()
      and account.email_confirmed_at is not null
  );
$$;

revoke all on function public.has_verified_portal_account() from public;
grant execute on function public.has_verified_portal_account() to authenticated;

drop policy if exists "Publisher reviewers can read selected AE examples"
on public.publisher_review_ae_examples;
drop policy if exists "Authorized accounts can read selected AE examples"
on public.publisher_review_ae_examples;

create policy "Verified accounts can read selected AE examples"
on public.publisher_review_ae_examples
for select
to authenticated
using (public.has_verified_portal_account());

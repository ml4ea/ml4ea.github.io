-- Finalize only the caller's own authorized AE delivery record. This keeps the
-- Edge Function independent of direct table updates while preserving RLS.

create or replace function public.finalize_ae_notebook_delivery(
  p_audit_id uuid,
  p_status text,
  p_failure_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if v_status not in ('delivered', 'failed') then
    raise exception 'Unsupported delivery status.';
  end if;

  update public.ae_delivery_audit
  set status = v_status,
      delivered_at = case when v_status = 'delivered' then now() else null end,
      failure_code = case
        when v_status = 'failed' then nullif(trim(coalesce(p_failure_code, '')), '')
        else null
      end
  where id = p_audit_id
    and user_id = auth.uid()
    and status = 'authorized';

  if not found then
    raise exception 'The authorized delivery record was not found.';
  end if;
end;
$$;

revoke all on function public.finalize_ae_notebook_delivery(uuid, text, text) from public;
grant execute on function public.finalize_ae_notebook_delivery(uuid, text, text) to authenticated;

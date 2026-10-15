-- Refresh the protected-source checksum after correcting AE 7.4.4's
-- high-strength class-count column reference.

do $$
begin
  update public.ae_notebook_files
  set
    source_sha256 = '9b0abcdb14402b7e684c3b9bbbb8d548210c91e05bb104adc564fa53c9834fe4',
    updated_at = now()
  where slug = 'ae-7-4-4-classifying-concrete-strength-with-decision-trees';

  if not found then
    raise exception 'AE 7.4.4 protected notebook metadata was not found.';
  end if;
end
$$;

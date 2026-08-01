-- Refresh the protected-source checksum after clarifying AE 10.2.4 dataset provenance.

do $$
begin
  update public.ae_notebook_files
  set
    source_sha256 = '0eb4f182b6f11f0961963b89fb6796ae77d7fe74b9f82b31ce35054294afb342',
    updated_at = now()
  where slug = 'ae-10-2-4-hierarchical-clustering-for-anomaly-detection-in-oil-and-gas-chemical-plants';

  if not found then
    raise exception 'AE 10.2.4 protected notebook metadata was not found.';
  end if;
end
$$;

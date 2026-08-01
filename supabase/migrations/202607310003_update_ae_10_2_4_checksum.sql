-- Refresh the protected-source checksum after replacing AE 10.2.4's dead dataset link.

do $$
begin
  update public.ae_notebook_files
  set
    source_sha256 = '86c84421a9e5855aabef85265d10d7b4a4aa8f10ce51f2048420d6b5534061d6',
    updated_at = now()
  where slug = 'ae-10-2-4-hierarchical-clustering-for-anomaly-detection-in-oil-and-gas-chemical-plants';

  if not found then
    raise exception 'AE 10.2.4 protected notebook metadata was not found.';
  end if;
end
$$;

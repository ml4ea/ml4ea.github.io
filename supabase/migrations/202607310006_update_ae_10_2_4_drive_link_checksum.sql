-- Refresh the protected-source checksum after linking AE 10.2.4's supplied data file.

do $$
begin
  update public.ae_notebook_files
  set
    source_sha256 = '4ccdcb890b057f92a3fbccd25486e01c41de5f58f21c28833b04e656e59cb30d',
    updated_at = now()
  where slug = 'ae-10-2-4-hierarchical-clustering-for-anomaly-detection-in-oil-and-gas-chemical-plants';

  if not found then
    raise exception 'AE 10.2.4 protected notebook metadata was not found.';
  end if;
end
$$;

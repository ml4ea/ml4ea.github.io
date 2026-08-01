-- Refresh the protected-source checksum after clarifying AE 10.3.6 dataset provenance.

do $$
begin
  update public.ae_notebook_files
  set
    source_sha256 = 'c0a5c882bbd07a0ad19b248e32464dc7b634a6bc621aec1643726532facd11b9',
    updated_at = now()
  where slug = 'ae-10-3-6-autoencoder-for-structural-health-monitoring-with-sensor-arrays';

  if not found then
    raise exception 'AE 10.3.6 protected notebook metadata was not found.';
  end if;
end
$$;

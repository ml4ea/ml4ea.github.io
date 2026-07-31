-- Refresh the protected-source checksum after correcting AE 9.4.5 dataset metadata.

do $$
begin
  update public.ae_notebook_files
  set
    source_sha256 = '090eadc0c5b0517937cb8173d22b733275be2b65155ec215b782fec596c7c80d',
    updated_at = now()
  where slug = 'ae-9-4-5-predicting-the-onset-of-diabetes-based-on-diagnostic-measures';

  if not found then
    raise exception 'AE 9.4.5 protected notebook metadata was not found.';
  end if;
end
$$;

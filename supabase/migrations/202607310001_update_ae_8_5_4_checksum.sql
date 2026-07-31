-- Refresh the protected-source checksum after correcting AE 8.5.4 dataset metadata.

do $$
begin
  update public.ae_notebook_files
  set
    source_sha256 = '1db86cfc1e6f264332c7069f247a2c5959162cf699c720f5487e2ee92e9c343b',
    updated_at = now()
  where slug = 'ae-8-5-4-evaluating-and-interpreting-a-random-forest';

  if not found then
    raise exception 'AE 8.5.4 protected notebook metadata was not found.';
  end if;
end
$$;

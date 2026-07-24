-- Browsers on macOS commonly identify .ipynb files as generic binary data.
-- The bucket remains private; this only permits administrator uploads.

update storage.buckets
set allowed_mime_types = array[
  'application/json',
  'application/x-ipynb+json',
  'application/octet-stream'
]
where id = 'ae-notebooks';

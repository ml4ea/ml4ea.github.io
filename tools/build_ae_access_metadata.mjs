import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const inventoryPath = path.join(root, 'src/data/application-examples.json');
const notebookDirectory = path.join(root, 'AE-notebooks');
const outputPath = path.join(
  root,
  'supabase/migrations/202607290002_all_ae_notebook_metadata.sql',
);

const legacySlugs = {
  'Notebook-07.5.5-SVM-cwru-bearing.ipynb': 'svm-bearing-fault-classification',
  'Notebook-09.5.2-CNN-NEU-DET.ipynb': 'cnn-surface-defect-detection',
  'Notebook-12.3.5-VAE-SensorAnomaly.ipynb': 'vae-sensor-anomaly-detection',
};

const slugify = (value) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const exampleSlug = (example) =>
  legacySlugs[example.filename]
  ?? `ae-${example.ae_number.replaceAll('.', '-')}-${slugify(example.title)}`;

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;

const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const examples = inventory.notebooks;
if (!Array.isArray(examples) || examples.length !== inventory.count || examples.length === 0) {
  throw new Error('The Application Example inventory is missing or inconsistent.');
}

const slugs = new Set();
const values = examples.map((example) => {
  const notebookPath = path.join(notebookDirectory, example.filename);
  const raw = fs.readFileSync(notebookPath);
  const slug = exampleSlug(example);
  if (slugs.has(slug)) throw new Error(`Duplicate Application Example slug: ${slug}`);
  slugs.add(slug);

  const sourceSha256 = crypto.createHash('sha256').update(raw).digest('hex');
  return `  (
    ${sqlText(slug)},
    ${sqlText(example.ae_number)},
    ${sqlText(example.title)},
    ${sqlText(example.filename)},
    ${sqlText(sourceSha256)},
    ${sqlText(example.notebook_version ?? '1.0')},
    ${sqlText(`notebooks/${example.filename}`)},
    ${sqlText(example.filename)},
    true
  )`;
});

const migration = `-- Generated metadata for all validated AE notebooks.
-- Notebook contents remain exclusively in the private ml4ea/ae-notebooks repository.

insert into public.ae_notebook_files (
  slug,
  ae_number,
  title,
  source_filename,
  source_sha256,
  notebook_version,
  storage_path,
  github_path,
  active
) values
${values.join(',\n')}
on conflict (slug) do update set
  ae_number = excluded.ae_number,
  title = excluded.title,
  source_filename = excluded.source_filename,
  source_sha256 = excluded.source_sha256,
  notebook_version = excluded.notebook_version,
  storage_path = excluded.storage_path,
  github_path = excluded.github_path,
  active = excluded.active,
  updated_at = now();

comment on table public.ae_notebook_files is
  'Protected AE notebook metadata; notebook contents remain in the private GitHub repository.';
`;

fs.writeFileSync(outputPath, migration, 'utf8');
console.log(`Wrote metadata for ${examples.length} Application Examples to ${path.relative(root, outputPath)}.`);

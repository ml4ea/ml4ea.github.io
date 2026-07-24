import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import MarkdownIt from 'markdown-it';

const root = process.cwd();
const notebookDirectory = path.join(root, 'AE-notebooks');
const outputDirectory = path.join(root, '.private-build');
const outputPath = path.join(outputDirectory, 'publisher-ae-examples.sql');
const storageOutputDirectory = path.join(outputDirectory, 'ae-storage', 'notebooks');

const examples = [
  {
    filename: 'Notebook-07.5.5-SVM-cwru-bearing.ipynb',
    slug: 'svm-bearing-fault-classification',
    aeNumber: '7.5.5',
    title: 'SVMs for Rotating Equipment Fault Classification',
    topic: 'classification',
    method: 'Support vector machine classification',
    sortOrder: 10,
  },
  {
    filename: 'Notebook-09.5.2-CNN-NEU-DET.ipynb',
    slug: 'cnn-surface-defect-detection',
    aeNumber: '9.5.2',
    title: 'CNN for Surface Defect Detection',
    topic: 'deep_neural_network',
    method: 'Convolutional neural networks',
    sortOrder: 20,
  },
  {
    filename: 'Notebook-12.3.5-VAE-SensorAnomaly.ipynb',
    slug: 'vae-sensor-anomaly-detection',
    aeNumber: '12.3.5',
    title: 'VAE for Sensor Anomaly Detection',
    topic: 'generative_models',
    method: 'Variational autoencoders',
    sortOrder: 30,
  },
];

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
});

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const joinSource = (source) => Array.isArray(source) ? source.join('') : String(source ?? '');
const stripAnsi = (value) => String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');

function dollarQuoted(value) {
  const digest = crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
  const tag = `$ml4ea_${digest}$`;
  if (value.includes(tag)) throw new Error('Unexpected SQL dollar-quote collision.');
  return `${tag}${value}${tag}`;
}

function renderData(data, outputIndex) {
  if (!data || typeof data !== 'object') return '';
  const image = data['image/png'] ?? data['image/jpeg'];
  if (image) {
    const mime = data['image/png'] ? 'image/png' : 'image/jpeg';
    const encoded = joinSource(image).replace(/\s/g, '');
    return `<figure class="notebook-output-figure"><img src="data:${mime};base64,${encoded}" alt="Generated notebook output ${outputIndex}" loading="lazy"></figure>`;
  }
  if (data['text/html']) {
    return `<div class="notebook-output-html">${joinSource(data['text/html'])}</div>`;
  }
  const plain = data['text/plain'] ?? data['text/markdown'];
  return plain ? `<pre class="notebook-output-text">${escapeHtml(stripAnsi(joinSource(plain)))}</pre>` : '';
}

function renderOutput(output, index) {
  if (output.output_type === 'stream') {
    return `<pre class="notebook-output-stream">${escapeHtml(stripAnsi(joinSource(output.text)))}</pre>`;
  }
  if (output.output_type === 'error') {
    return `<pre class="notebook-output-error">${escapeHtml(stripAnsi((output.traceback ?? []).join('\n')))}</pre>`;
  }
  return renderData(output.data, index);
}

function renderNotebook(notebook) {
  return notebook.cells.map((cell, cellIndex) => {
    const source = joinSource(cell.source);
    if (cell.cell_type === 'markdown') {
      return `<section class="notebook-cell notebook-markdown" data-cell="${cellIndex + 1}">${markdown.render(source)}</section>`;
    }
    if (cell.cell_type !== 'code') return '';

    const outputs = (cell.outputs ?? []).map((output, outputIndex) => renderOutput(output, outputIndex + 1)).join('');
    return `<section class="notebook-cell notebook-code" data-cell="${cellIndex + 1}">
      <div class="notebook-cell-label">Python</div>
      <pre class="notebook-source"><code>${escapeHtml(source)}</code></pre>
      ${outputs ? `<div class="notebook-outputs"><div class="notebook-cell-label">Executed output</div>${outputs}</div>` : ''}
    </section>`;
  }).join('\n');
}

const statements = examples.map((example) => {
  const notebookPath = path.join(notebookDirectory, example.filename);
  const raw = fs.readFileSync(notebookPath, 'utf8');
  const notebook = JSON.parse(raw);
  const bodyHtml = renderNotebook(notebook);
  const sourceSha256 = crypto.createHash('sha256').update(raw).digest('hex');
  fs.mkdirSync(storageOutputDirectory, { recursive: true });
  fs.copyFileSync(notebookPath, path.join(storageOutputDirectory, example.filename));

  return `insert into public.publisher_review_ae_examples (
  slug, ae_number, title, topic, method, source_filename, source_sha256, body_html, sort_order
) values (
  ${sqlText(example.slug)},
  ${sqlText(example.aeNumber)},
  ${sqlText(example.title)},
  ${sqlText(example.topic)},
  ${sqlText(example.method)},
  ${sqlText(example.filename)},
  ${sqlText(sourceSha256)},
  ${dollarQuoted(bodyHtml)},
  ${example.sortOrder}
)
on conflict (slug) do update set
  ae_number = excluded.ae_number,
  title = excluded.title,
  topic = excluded.topic,
  method = excluded.method,
  source_filename = excluded.source_filename,
  source_sha256 = excluded.source_sha256,
  body_html = excluded.body_html,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.ae_notebook_files (
  slug, ae_number, title, source_filename, source_sha256, notebook_version, storage_path, active
) values (
  ${sqlText(example.slug)},
  ${sqlText(example.aeNumber)},
  ${sqlText(example.title)},
  ${sqlText(example.filename)},
  ${sqlText(sourceSha256)},
  '1.0',
  ${sqlText(`notebooks/${example.filename}`)},
  true
)
on conflict (slug) do update set
  ae_number = excluded.ae_number,
  title = excluded.title,
  source_filename = excluded.source_filename,
  source_sha256 = excluded.source_sha256,
  notebook_version = excluded.notebook_version,
  storage_path = excluded.storage_path,
  active = excluded.active,
  updated_at = now();`;
});

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, `-- Generated protected content. Do not commit this file.\n\nbegin;\n\n${statements.join('\n\n')}\n\ncommit;\n`, 'utf8');
console.log(`Wrote ${examples.length} protected AE examples to ${path.relative(root, outputPath)}.`);
console.log(`Staged ${examples.length} private Storage objects in ${path.relative(root, storageOutputDirectory)}.`);

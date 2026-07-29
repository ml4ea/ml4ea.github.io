import MarkdownIt from 'markdown-it';

interface NotebookOutput {
  output_type?: string;
  text?: string | string[];
  traceback?: string[];
  data?: Record<string, string | string[]>;
}

interface NotebookCell {
  cell_type?: string;
  source?: string | string[];
  outputs?: NotebookOutput[];
}

interface NotebookDocument {
  cells?: NotebookCell[];
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
});

const joinSource = (source: string | string[] | undefined) =>
  Array.isArray(source) ? source.join('') : String(source ?? '');

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');

function renderData(data: NotebookOutput['data'], outputIndex: number) {
  if (!data) return '';
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
  return plain
    ? `<pre class="notebook-output-text">${escapeHtml(stripAnsi(joinSource(plain)))}</pre>`
    : '';
}

function renderOutput(output: NotebookOutput, index: number) {
  if (output.output_type === 'stream') {
    return `<pre class="notebook-output-stream">${escapeHtml(stripAnsi(joinSource(output.text)))}</pre>`;
  }
  if (output.output_type === 'error') {
    return `<pre class="notebook-output-error">${escapeHtml(stripAnsi((output.traceback ?? []).join('\n')))}</pre>`;
  }
  return renderData(output.data, index);
}

export function renderNotebookHtml(notebook: NotebookDocument) {
  return (notebook.cells ?? []).map((cell, cellIndex) => {
    const source = joinSource(cell.source);
    if (cell.cell_type === 'markdown') {
      return `<section class="notebook-cell notebook-markdown" data-cell="${cellIndex + 1}">${markdown.render(source)}</section>`;
    }
    if (cell.cell_type !== 'code') return '';

    const outputs = (cell.outputs ?? [])
      .map((output, outputIndex) => renderOutput(output, outputIndex + 1))
      .join('');
    return `<section class="notebook-cell notebook-code" data-cell="${cellIndex + 1}">
      <div class="notebook-cell-label">Python</div>
      <pre class="notebook-source"><code>${escapeHtml(source)}</code></pre>
      ${outputs ? `<div class="notebook-outputs"><div class="notebook-cell-label">Executed output</div>${outputs}</div>` : ''}
    </section>`;
  }).join('\n');
}

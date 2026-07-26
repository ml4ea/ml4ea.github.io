import DOMPurify from 'dompurify';

const allowedTags = [
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

const allowedAttributes = [
  'alt',
  'aria-label',
  'class',
  'colspan',
  'data-cell',
  'height',
  'href',
  'id',
  'loading',
  'rel',
  'rowspan',
  'scope',
  'src',
  'title',
  'width',
];

export function sanitizeNotebookHtml(value: string) {
  if (typeof window === 'undefined') return '';

  const sanitized = String(DOMPurify.sanitize(value, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_DATA_ATTR: true,
    ADD_DATA_URI_TAGS: ['img'],
    FORBID_TAGS: ['base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'meta', 'object', 'script', 'select', 'style', 'textarea'],
  }));

  const template = document.createElement('template');
  template.innerHTML = sanitized;

  for (const row of template.content.querySelectorAll('tr')) {
    const cells = Array.from(row.children);
    if (cells.length < 2 || cells[0]?.textContent?.trim() !== 'Notebook license') continue;
    cells[0].textContent = 'Access status';
    cells[1].textContent = 'Restricted prelaunch preview';
  }

  return template.innerHTML;
}

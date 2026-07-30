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
    if (cells.length < 2) continue;
    const label = cells[0]?.textContent?.trim();
    if (label !== 'Notebook license' && label !== 'Access and use') continue;
    cells[0].textContent = 'Access and use';
    cells[1].replaceChildren();
    const termsLink = document.createElement('a');
    termsLink.href = '/application-examples/terms/';
    termsLink.textContent = 'Restricted educational use';
    cells[1].append(termsLink);
  }

  for (const link of template.content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const target = new URL(link.href, window.location.origin);
    if (target.hostname !== 'github.com' || !target.pathname.startsWith('/ml4ea/ae-notebooks')) continue;
    const container = link.closest('p');
    if (container?.textContent?.trim().startsWith('Project links:')) {
      container.remove();
    } else {
      link.replaceWith(document.createTextNode(link.textContent ?? ''));
    }
  }

  return template.innerHTML;
}

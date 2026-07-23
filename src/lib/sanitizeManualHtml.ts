import DOMPurify from 'dompurify';

const allowedTags = [
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h2',
  'h3',
  'h4',
  'hr',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
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
  'aria-label',
  'class',
  'colspan',
  'href',
  'id',
  'rel',
  'rowspan',
  'scope',
  'title',
];

export function sanitizeManualHtml(value: string) {
  if (typeof window === 'undefined') return '';

  return String(DOMPurify.sanitize(value, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'meta', 'object', 'script', 'select', 'style', 'textarea'],
  }));
}

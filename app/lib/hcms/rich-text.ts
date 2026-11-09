/**
 * Shopify `rich_text_field` JSON → a safe, normalized tree for `<RichText>`. Unknown node types
 * are dropped, link URLs are limited to http(s)/mailto/tel/relative (no `javascript:`).
 */
export type RichTextNode =
  | { type: 'root'; children: RichTextNode[] }
  | { type: 'paragraph'; children: RichTextNode[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: RichTextNode[] }
  | { type: 'list'; ordered: boolean; children: RichTextNode[] }
  | { type: 'list-item'; children: RichTextNode[] }
  | { type: 'link'; url: string; title?: string; newTab: boolean; children: RichTextNode[] }
  | { type: 'text'; value: string; bold: boolean; italic: boolean };

type Raw = Record<string, unknown>;

export function safeUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const trimmed = url.trim();
  if (/^(\/(?!\/)|#|\?)/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function children(raw: Raw): RichTextNode[] {
  return Array.isArray(raw.children)
    ? raw.children.flatMap((child) => {
        const node = normalize(child);
        return node ? [node] : [];
      })
    : [];
}

function normalize(input: unknown): RichTextNode | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Raw;
  switch (raw.type) {
    case 'root':
      return { type: 'root', children: children(raw) };
    case 'paragraph':
      return { type: 'paragraph', children: children(raw) };
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(raw.level) || 2)) as 1 | 2 | 3 | 4 | 5 | 6;
      return { type: 'heading', level, children: children(raw) };
    }
    case 'list':
      return { type: 'list', ordered: raw.listType === 'ordered', children: children(raw) };
    case 'list-item':
      return { type: 'list-item', children: children(raw) };
    case 'link': {
      const url = safeUrl(raw.url);
      const inner = children(raw);
      if (!url) return inner.length ? { type: 'paragraph', children: inner } : null;
      return {
        type: 'link',
        url,
        ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
        newTab: raw.target === '_blank',
        children: inner,
      };
    }
    case 'text':
      return {
        type: 'text',
        value: typeof raw.value === 'string' ? raw.value : '',
        bold: raw.bold === true,
        italic: raw.italic === true,
      };
    default:
      return null;
  }
}

/** Accepts the parsed object or the raw metafield string. Returns null for invalid input. */
export function parseRichText(input: unknown): RichTextNode | null {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return null;
    }
  }
  const node = normalize(value);
  return node?.type === 'root' ? node : null;
}

/** Plain text (for meta descriptions, aria labels). */
export function richTextToPlainText(node: RichTextNode | null): string {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  const sep = node.type === 'root' || node.type === 'list' ? '\n' : '';
  return node.children.map(richTextToPlainText).join(sep).trim();
}

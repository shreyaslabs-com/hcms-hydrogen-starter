/**
 * Replacements for Hydrogen's removed `parseGid` / `parseMetafield` (S-06 §4). Used by the binding
 * resolver (T-1.2.11) to turn Storefront metafield values into typed values.
 */
export type ParsedGid = { resource: string; id: string; search: string };

/** `gid://shopify/Product/123?x=1` → `{ resource: 'Product', id: '123', search: '?x=1' }`. */
export function parseGid(gid: string | null | undefined): ParsedGid | null {
  const match = gid?.match(/^gid:\/\/shopify\/([A-Za-z]+)\/([^?#/]+)(\?[^#]*)?$/);
  if (!match) return null;
  return { resource: match[1] ?? '', id: match[2] ?? '', search: match[3] ?? '' };
}

export type Money = { amount: string; currencyCode: string };
export type Measurement = { value: number; unit: string };
export type Rating = { value: number; scaleMin: number; scaleMax: number };

export type MetafieldInput = {
  type: string;
  value: string | null;
  reference?: unknown;
  references?: { nodes?: unknown[] } | null;
};

export type ParsedMetafield =
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'number'; value: number }
  | { type: 'date'; value: Date }
  | { type: 'money'; value: Money }
  | { type: 'measurement'; value: Measurement }
  | { type: 'rating'; value: Rating }
  | { type: 'json'; value: unknown }
  | { type: 'reference'; value: unknown }
  | { type: 'list'; value: unknown[] };

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseScalar(type: string, value: string): ParsedMetafield {
  switch (type) {
    case 'boolean':
      return { type: 'boolean', value: value === 'true' };
    case 'number_integer':
    case 'number_decimal':
      return { type: 'number', value: Number(value) };
    case 'date':
    case 'date_time':
      return { type: 'date', value: new Date(value) };
    case 'money': {
      const money = safeJson(value) as { amount?: string; currency_code?: string } | null;
      return {
        type: 'money',
        value: { amount: money?.amount ?? '0', currencyCode: money?.currency_code ?? '' },
      };
    }
    case 'weight':
    case 'volume':
    case 'dimension': {
      const m = safeJson(value) as { value?: number; unit?: string } | null;
      return { type: 'measurement', value: { value: Number(m?.value ?? 0), unit: m?.unit ?? '' } };
    }
    case 'rating': {
      const r = safeJson(value) as {
        value?: string;
        scale_min?: string;
        scale_max?: string;
      } | null;
      return {
        type: 'rating',
        value: {
          value: Number(r?.value ?? 0),
          scaleMin: Number(r?.scale_min ?? 0),
          scaleMax: Number(r?.scale_max ?? 5),
        },
      };
    }
    case 'json':
    case 'rich_text_field':
    case 'link':
      return { type: 'json', value: safeJson(value) };
    default:
      return { type: 'string', value };
  }
}

/**
 * Typed metafield value. References come from `reference` / `references.nodes` (already expanded
 * by the query); `list.*` scalars are parsed element by element.
 */
export function parseMetafield(field: MetafieldInput | null | undefined): ParsedMetafield | null {
  if (!field || field.value === null) return null;
  const { type, value } = field;

  if (type.startsWith('list.')) {
    const inner = type.slice(5);
    if (inner.endsWith('_reference')) {
      return { type: 'list', value: field.references?.nodes ?? [] };
    }
    const items = safeJson(value);
    const list = Array.isArray(items) ? items : [];
    return {
      type: 'list',
      value: list.map((item) =>
        typeof item === 'string'
          ? parseScalar(inner, item).value
          : parseScalar(inner, JSON.stringify(item)).value,
      ),
    };
  }
  if (type.endsWith('_reference')) return { type: 'reference', value: field.reference ?? null };
  return parseScalar(type, value);
}

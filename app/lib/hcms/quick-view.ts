/**
 * `/__hcms/quick-view` request helpers (T-2.77; pure for `node:test`): `handle` + the selection as
 * option params, like a product page URL (`?handle=shirt&Color=Red&Size=M`). At most 3 options
 * (Shopify's limit), names/values capped at 255 chars; the reserved `variant` param is ignored.
 */
export const QUICK_VIEW_HANDLE = /^[a-z0-9][a-z0-9-]{0,254}$/i;

export type QuickViewQuery = {
  handle: string;
  selectedOptions: { name: string; value: string }[];
};

export function parseQuickViewQuery(params: URLSearchParams): QuickViewQuery | null {
  const handle = params.get('handle')?.trim() ?? '';
  if (!QUICK_VIEW_HANDLE.test(handle)) return null;
  const selectedOptions: QuickViewQuery['selectedOptions'] = [];
  const seen = new Set<string>();
  for (const [name, value] of params) {
    if (name === 'handle' || name === 'variant' || seen.has(name)) continue;
    if (!name || name.length > 255 || !value || value.length > 255) continue;
    seen.add(name);
    selectedOptions.push({ name, value });
    if (selectedOptions.length === 3) break;
  }
  return { handle, selectedOptions };
}

/**
 * The section query with the market context the page batch adds (`$country/$language` +
 * `@inContext`); the storefront client fills both variables for the request's market.
 */
export function withMarketContext(query: string): string {
  return query.replace(
    /^(\s*query\s+\w+\s*\()([^)]*)\)/,
    '$1$2, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language)',
  );
}

/** Public catalog data (market prices per URL); short shared cache. */
export const QUICK_VIEW_CACHE = 'public, max-age=60, stale-while-revalidate=300';

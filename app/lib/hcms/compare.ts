/**
 * `/__hcms/compare` and `/__hcms/siblings` request helpers (T-2.79 / T-2.93; pure for `node:test`).
 * `handles=a,b` (at most 4) + `specs=namespace.key,…` (at most 8, same character rules as the
 * section's metafield settings); `tag=group:name` for siblings.
 */
const HANDLE = /^[a-z0-9][a-z0-9-]{0,254}$/i;
const SPEC = /^([A-Za-z0-9_-]{2,64})\.([A-Za-z0-9_-]{2,64})$/;

export const COMPARE_HANDLES_MAX = 4;
export const COMPARE_SPECS_MAX = 8;

export type CompareQuery = {
  handles: string[];
  specs: { namespace: string; key: string }[];
};

export function parseCompareQuery(params: URLSearchParams): CompareQuery | null {
  const handles = [
    ...new Set(
      (params.get('handles') ?? '')
        .split(',')
        .map((h) => h.trim())
        .filter((h) => HANDLE.test(h)),
    ),
  ].slice(0, COMPARE_HANDLES_MAX);
  if (handles.length === 0) return null;
  const specs: CompareQuery['specs'] = [];
  const seen = new Set<string>();
  for (const raw of (params.get('specs') ?? '').split(',')) {
    const m = SPEC.exec(raw.trim());
    if (!m || seen.has(raw.trim())) continue;
    seen.add(raw.trim());
    specs.push({ namespace: m[1] as string, key: m[2] as string });
    if (specs.length >= COMPARE_SPECS_MAX) break;
  }
  return { handles, specs };
}

/** Public catalog data (market prices per URL); short shared cache. */
export const COMPARE_CACHE = 'public, max-age=60, stale-while-revalidate=300';

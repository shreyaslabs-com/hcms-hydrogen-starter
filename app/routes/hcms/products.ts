import { PRODUCT_CARD_FRAGMENT } from '@hcms/sections';

import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/products';

const HANDLE = /^[a-z0-9][a-z0-9-]*$/i;
/** Wishlist (T-2.8) shows up to 24; recently viewed 12. */
const MAX = 24;

/**
 * `/{market?}/__hcms/products?handles=a,b` (T-1.3.7): product cards for client-only sections
 * (recently viewed, wishlist). Public catalog data only, handles validated, one aliased query, market
 * prices via the request's `@inContext`; short public cache.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const handles = [
    ...new Set(
      (new URL(request.url).searchParams.get('handles') ?? '')
        .split(',')
        .map((h) => h.trim())
        .filter((h) => HANDLE.test(h)),
    ),
  ].slice(0, MAX);
  if (handles.length === 0) return Response.json({ products: [] });

  const vars = handles.map((_, i) => `$h${i}: String!`).join(', ');
  const fields = handles
    .map((_, i) => `p${i}: product(handle: $h${i}) { ...HcmsProductCard }`)
    .join(' ');
  const query = `query HcmsProductCards(${vars}, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) { ${fields} } ${PRODUCT_CARD_FRAGMENT}`;
  const variables = Object.fromEntries(handles.map((h, i) => [`h${i}`, h]));
  const { data } = (await context
    .get(storefrontClientContext)
    .graphql(query as never, { variables } as never)) as { data?: Record<string, unknown> | null };
  const products = handles.map((_, i) => data?.[`p${i}`]).filter(Boolean);
  return Response.json(
    { products },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}

import { QUICK_ADD_FIELDS } from '@hcms/sections';

/**
 * `/__hcms/search-popular?handle=` (replica P1-8): the products of the merchant's "popular
 * products" collection for the search panel's empty state. One small query, fetched when the
 * panel opens (never in a page's batched query). Quick add fields = the cards' (`Q`).
 */
export const POPULAR_MAX = 6;
export const POPULAR_HANDLE = /^[a-z0-9][a-z0-9-]{0,254}$/i;
export const POPULAR_CACHE = 'public, max-age=60, stale-while-revalidate=300';

export function parsePopularHandle(params: URLSearchParams): string | null {
  const handle = params.get('handle')?.trim() ?? '';
  return POPULAR_HANDLE.test(handle) ? handle : null;
}

export const POPULAR_QUERY = `query HcmsSearchPopular($handle: String!) {
  collection(handle: $handle) {
    products(first: ${POPULAR_MAX}) {
      nodes {
        id handle title availableForSale
        featuredImage { url altText width height }
        priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
        ${QUICK_ADD_FIELDS}
      }
    }
  }
}`;

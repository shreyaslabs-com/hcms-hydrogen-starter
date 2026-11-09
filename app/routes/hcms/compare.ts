import { compareProducts, compareRequest } from '@hcms/sections';

import { COMPARE_CACHE, parseCompareQuery } from '~/lib/hcms/compare';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/compare';

/**
 * `/{market?}/__hcms/compare?handles=a,b&specs=custom.material` (T-2.79): data for the compare
 * dialog, fetched when a shopper opens it (never in a page's batched query). ONE aliased
 * Storefront query for the products and the merchant's spec metafields; market prices via
 * `@inContext`; short public cache.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const parsed = parseCompareQuery(new URL(request.url).searchParams);
  const req = parsed ? compareRequest(parsed.handles, parsed.specs) : null;
  if (!parsed || !req)
    return Response.json(
      { products: [] },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const { data } = (await context
      .get(storefrontClientContext)
      .graphql(req.query as never, { variables: req.variables } as never)) as {
      data?: Record<string, unknown> | null;
    };
    return Response.json(
      { products: compareProducts(data, parsed.handles, parsed.specs.length) },
      { headers: { 'Cache-Control': COMPARE_CACHE } },
    );
  } catch {
    return Response.json(
      { products: [] },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

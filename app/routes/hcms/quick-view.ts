import { quickViewRequest } from '@hcms/sections';

import { parseQuickViewQuery, QUICK_VIEW_CACHE, withMarketContext } from '~/lib/hcms/quick-view';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/quick-view';

/**
 * `/{market?}/__hcms/quick-view?handle=<product>&<Option>=<value>` (T-2.77): data for the product
 * card quick view, fetched by the client when the dialog opens (never in a page's batched query).
 * The official `main-product` query (`quickViewRequest` → `MainProductData`), so the adapter's
 * product form works unchanged; market prices via `@inContext`.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const parsed = parseQuickViewQuery(new URL(request.url).searchParams);
  const productQuery = parsed ? quickViewRequest(parsed.handle, parsed.selectedOptions) : null;
  if (!productQuery) {
    return Response.json(
      { product: null },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  try {
    const { data } = (await context
      .get(storefrontClientContext)
      .graphql(
        withMarketContext(productQuery.query) as never,
        { variables: productQuery.variables } as never,
      )) as { data?: { product?: unknown } | null };
    const product = data?.product ?? null;
    return Response.json(
      { product },
      {
        status: product ? 200 : 404,
        headers: { 'Cache-Control': product ? QUICK_VIEW_CACHE : 'no-store' },
      },
    );
  } catch {
    return Response.json(
      { product: null },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

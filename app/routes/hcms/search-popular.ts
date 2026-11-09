import { withMarketContext } from '~/lib/hcms/quick-view';
import { POPULAR_CACHE, POPULAR_QUERY, parsePopularHandle } from '~/lib/hcms/search-popular';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/search-popular';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** `/{market?}/__hcms/search-popular?handle=<collection>`: popular products for the search panel. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const handle = parsePopularHandle(new URL(request.url).searchParams);
  if (!handle) return Response.json({ products: [] }, { status: 400, headers: NO_STORE });
  try {
    const { data } = (await context
      .get(storefrontClientContext)
      .graphql(withMarketContext(POPULAR_QUERY) as never, { variables: { handle } } as never)) as {
      data?: { collection?: { products?: { nodes?: unknown[] } } | null } | null;
    };
    const products = data?.collection?.products?.nodes ?? [];
    return Response.json({ products }, { headers: { 'Cache-Control': POPULAR_CACHE } });
  } catch {
    return Response.json({ products: [] }, { status: 502, headers: NO_STORE });
  }
}

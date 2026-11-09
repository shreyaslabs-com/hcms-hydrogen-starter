import { siblingsByTagRequest } from '@hcms/sections';

import { COMPARE_CACHE } from '~/lib/hcms/compare';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/siblings';

/**
 * `/{market?}/__hcms/siblings?tag=group:summer-tee` (T-2.93): products sharing a tag, for the
 * `linked_products` block's tag-group mode (a query by tag needs the tag value, so it can't ride
 * the page's batch; metafield groups do). Public catalog data, one query, short cache.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const req = siblingsByTagRequest(new URL(request.url).searchParams.get('tag') ?? '');
  if (!req)
    return Response.json(
      { products: [] },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const { data } = (await context
      .get(storefrontClientContext)
      .graphql(req.query as never, { variables: req.variables } as never)) as {
      data?: { products?: { nodes?: unknown[] } | null } | null;
    };
    return Response.json(
      { products: data?.products?.nodes ?? [] },
      { headers: { 'Cache-Control': COMPARE_CACHE } },
    );
  } catch {
    return Response.json(
      { products: [] },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

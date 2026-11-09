import { gql } from '@shopify/hydrogen';

import { GIFT_WRAP_VARIANT } from '~/lib/hcms/cart-gifts';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/gift-wrap';

const GIFT_WRAP_QUERY = gql(`
  query HcmsGiftWrapPrice($id: ID!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    node(id: $id) {
      ... on ProductVariant {
        availableForSale
        price { amount currencyCode }
      }
    }
  }
`);

/**
 * `/{market?}/__hcms/gift-wrap?variant=<gid>` (T-2.80, App Store 1.1.9): the gift-wrap price,
 * fetched by the client when the gift-wrap option shows, so shoppers see the cost before they tick
 * the box. Like the upsell route it stays off the page's one batched query. Market prices via
 * `@inContext`; short public cache.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const id = new URL(request.url).searchParams.get('variant')?.trim() ?? '';
  if (!GIFT_WRAP_VARIANT.test(id)) return Response.json({ price: null }, { status: 400 });
  try {
    const { data } = await context
      .get(storefrontClientContext)
      .graphql(GIFT_WRAP_QUERY, { variables: { id } });
    const node = data?.node as
      | { availableForSale?: boolean; price?: { amount: string; currencyCode: string } }
      | null
      | undefined;
    return Response.json(
      { price: node?.price ?? null, available: node?.availableForSale ?? false },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } },
    );
  } catch {
    return Response.json({ price: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

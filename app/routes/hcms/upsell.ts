import { gql } from '@shopify/hydrogen';

import { parseUpsellRequest, UPSELL_RAIL_ITEMS } from '~/lib/hcms/upsell';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/upsell';

/**
 * ONE query for every rail (P1-7): automatic (COMPLEMENTARY + RELATED for the seed product), up to
 * two collections and up to two hand-picked product lists. `@include` skips what isn't asked for.
 */
const UPSELL_QUERY = gql(`
  query HcmsCartUpsell(
    $handle: String!
    $auto: Boolean!
    $c0: String!
    $hasC0: Boolean!
    $c1: String!
    $hasC1: Boolean!
    $ids0: [ID!]!
    $hasIds0: Boolean!
    $ids1: [ID!]!
    $hasIds1: Boolean!
    $first: Int!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    complementary: productRecommendations(productHandle: $handle, intent: COMPLEMENTARY)
      @include(if: $auto) {
      ...HcmsUpsellProduct
    }
    related: productRecommendations(productHandle: $handle, intent: RELATED)
      @include(if: $auto) {
      ...HcmsUpsellProduct
    }
    col0: collection(handle: $c0) @include(if: $hasC0) {
      products(first: $first) {
        nodes {
          ...HcmsUpsellProduct
        }
      }
    }
    col1: collection(handle: $c1) @include(if: $hasC1) {
      products(first: $first) {
        nodes {
          ...HcmsUpsellProduct
        }
      }
    }
    ids0: nodes(ids: $ids0) @include(if: $hasIds0) {
      ...HcmsUpsellProduct
    }
    ids1: nodes(ids: $ids1) @include(if: $hasIds1) {
      ...HcmsUpsellProduct
    }
  }
  fragment HcmsUpsellProduct on Product {
    id
    handle
    title
    availableForSale
    featuredImage { url altText width height }
    variantsCount { count }
    selectedOrFirstAvailableVariant {
      id
      title
      availableForSale
      price { amount currencyCode }
      image { url altText width height }
    }
  }
`);

const EMPTY = { complementary: [], related: [], rails: [[], []] };

/**
 * `/{market?}/__hcms/upsell?handle=&c0=&c1=&p0=&p1=` (T-2.43, P1-7): "You may also like" rails for the
 * cart drawer and cart page, fetched by the client after the cart is shown, so page JS and the
 * page's one batched query stay untouched. Public catalog data only; market prices via
 * `@inContext`; short public cache. Response: `{ complementary, related, rails: [products, products] }`
 * (`rails[i]` = the i-th configured rail's collection / product-list result).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const req = parseUpsellRequest(new URL(request.url).searchParams);
  const [c0, c1] = req.collections;
  if (!req.handle && !c0 && !c1 && !req.ids[0].length && !req.ids[1].length) {
    return Response.json(EMPTY, { status: 400 });
  }
  try {
    const { data } = await context.get(storefrontClientContext).graphql(UPSELL_QUERY, {
      variables: {
        handle: req.handle ?? '',
        auto: Boolean(req.handle),
        c0: c0 ?? '',
        hasC0: Boolean(c0),
        c1: c1 ?? '',
        hasC1: Boolean(c1),
        ids0: req.ids[0],
        hasIds0: req.ids[0].length > 0,
        ids1: req.ids[1],
        hasIds1: req.ids[1].length > 0,
        first: UPSELL_RAIL_ITEMS,
      },
    });
    const nodes = (list: ReadonlyArray<unknown> | null | undefined) => (list ?? []).filter(Boolean);
    return Response.json(
      {
        complementary: data?.complementary ?? [],
        related: data?.related ?? [],
        rails: [
          nodes(data?.col0?.products.nodes ?? data?.ids0),
          nodes(data?.col1?.products.nodes ?? data?.ids1),
        ],
      },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } },
    );
  } catch {
    // Recommendations are optional: the cart never breaks because of them.
    return Response.json(EMPTY, { headers: { 'Cache-Control': 'no-store' } });
  }
}

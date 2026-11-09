import { gql, parseCollectionParams, type StorefrontApi } from '@shopify/hydrogen';
import type { StorefrontClient } from '@shopify/hydrogen';
import type { ProductFilter as StorefrontApiProductFilter } from '@shopify/hydrogen/storefront-api-types';

import { PRODUCT_CARD_FRAGMENT } from '~/components/ProductCard';
import {
  ALL_CURSOR_PREFIX,
  ALL_PRODUCTS_HANDLE,
  ALL_SEARCH_CURSOR_PREFIX,
  allListingCursor,
  allProductsMode,
  allProductsSortKey,
  allProductsSource,
  allSearchSortKey,
} from '@hcms/sections';
import type { ProductSortKeys } from '@shopify/hydrogen/storefront-api-types';
import { syntheticAllCollection } from '~/lib/hcms/all-products';

export const COLLECTION_PAGE_SIZE = 9;

export const COLLECTION_QUERY = gql(
  `
    query CollectionPage(
      $handle: String!
      $first: Int!
      $after: String
      $sortKey: ProductCollectionSortKeys
      $reverse: Boolean
      $filters: [ProductFilter!],
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      shop {
        paymentSettings {
          currencyCode
        }
      }
      collection(handle: $handle) {
        id
        handle
        title
        description
        image {
          url
          altText
          width
          height
        }
        products(
          first: $first
          after: $after
          sortKey: $sortKey
          reverse: $reverse
          filters: $filters
        ) {
          filters {
            id
            label
            type
            presentation
            values {
              id
              label
              count
              input
              swatch {
                color
                image {
                  previewImage {
                    url
                    altText
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ...ProductCard
          }
        }
      }
    }
  `,
  [PRODUCT_CARD_FRAGMENT],
);

type CollectionQueryVariables = StorefrontApi.VariablesOf<typeof COLLECTION_QUERY>;

/**
 * `/collections/all` without a theme template: the merchant's `all` collection and/or the
 * synthesized listing in ONE query (same rules as the official grid, `@hcms/sections`
 * `allProductsSource`): `search(query: "")` = every product with facets (filters, price sort),
 * or root `products` for title/best-selling/date sorts (facets from a 1-item search).
 */
export const ALL_PRODUCTS_QUERY = gql(
  `
    query AllProductsPage(
      $handle: String!
      $first: Int!
      $after: String
      $sortKey: ProductCollectionSortKeys
      $reverse: Boolean
      $filters: [ProductFilter!]
      $allAfter: String
      $allSortKey: ProductSortKeys
      $allSearchSort: SearchSortKeys
      $allSearchReverse: Boolean
      $withCollection: Boolean!
      $withAll: Boolean!
      $withSearch: Boolean!
      $withFacets: Boolean!
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      shop {
        paymentSettings {
          currencyCode
        }
      }
      collection(handle: $handle) @include(if: $withCollection) {
        id
        handle
        title
        description
        image {
          url
          altText
          width
          height
        }
        products(
          first: $first
          after: $after
          sortKey: $sortKey
          reverse: $reverse
          filters: $filters
        ) {
          filters {
            id
            label
            type
            presentation
            values {
              id
              label
              count
              input
              swatch {
                color
                image {
                  previewImage {
                    url
                    altText
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ...ProductCard
          }
        }
      }
      allProducts: products(
        first: $first
        after: $allAfter
        sortKey: $allSortKey
        reverse: $reverse
      ) @include(if: $withAll) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ...ProductCard
        }
      }
      allFacets: search(query: "", types: [PRODUCT], first: 1) @include(if: $withFacets) {
        productFilters {
          id
          label
          type
          presentation
          values {
            id
            label
            count
            input
            swatch {
              color
              image {
                previewImage {
                  url
                  altText
                }
              }
            }
          }
        }
      }
      allSearch: search(
        query: ""
        types: [PRODUCT]
        first: $first
        after: $allAfter
        productFilters: $filters
        sortKey: $allSearchSort
        reverse: $allSearchReverse
      ) @include(if: $withSearch) {
        productFilters {
          id
          label
          type
          presentation
          values {
            id
            label
            count
            input
            swatch {
              color
              image {
                previewImage {
                  url
                  altText
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ... on Product {
            ...ProductCard
          }
        }
      }
    }
  `,
  [PRODUCT_CARD_FRAGMENT],
);

export async function loadCollectionPage({
  storefrontClient,
  handle,
  request,
  catalogSearch = true,
}: {
  storefrontClient: StorefrontClient;
  handle: string;
  request: Request;
  /** False when the store's search has no catalogue index (mock.shop): `/collections/all` = root `products`. */
  catalogSearch?: boolean;
}) {
  const url = new URL(request.url);
  const browse = parseCollectionParams(url.searchParams);
  const after = url.searchParams.get('after') || undefined;

  const variables: CollectionQueryVariables = {
    handle,
    first: COLLECTION_PAGE_SIZE,
    after,
    filters:
      browse.filters.length > 0 ? (browse.filters as StorefrontApiProductFilter[]) : undefined,
    sortKey: browse.sortKey,
    reverse: browse.reverse || undefined,
  };

  if (handle === ALL_PRODUCTS_HANDLE) {
    return loadAllProductsPage(storefrontClient, variables, url, catalogSearch);
  }

  const { data } = await storefrontClient.graphql(COLLECTION_QUERY, { variables });

  if (!data?.collection) throw new Response('Collection not found', { status: 404 });

  return {
    collection: data.collection,
    products: data.collection.products.nodes,
    availableFilters: data.collection.products.filters,
    pageInfo: data.collection.products.pageInfo,
    currencyCode: data.shop.paymentSettings.currencyCode,
    dataSearch: url.searchParams.toString(),
    origin: url.origin,
  };
}

async function loadAllProductsPage(
  storefrontClient: StorefrontClient,
  variables: CollectionQueryVariables,
  url: URL,
  catalogSearch: boolean,
) {
  const mode = allProductsMode({ after: variables.after ?? '' });
  const source = allProductsSource({ ...variables, catalogSearch });
  const searchSort = allSearchSortKey(variables.sortKey) ?? 'RELEVANCE';
  const { data } = await storefrontClient.graphql(ALL_PRODUCTS_QUERY, {
    variables: {
      ...variables,
      after: mode === 'collection' ? variables.after : undefined,
      allAfter: mode === 'all' ? allListingCursor(variables.after, source) : undefined,
      allSortKey: (allProductsSortKey(variables.sortKey) as ProductSortKeys | null) ?? undefined,
      allSearchSort: searchSort,
      allSearchReverse: searchSort === 'PRICE' ? variables.reverse : undefined,
      withCollection: mode !== 'all',
      withAll: mode !== 'collection' && source === 'products',
      withFacets: mode !== 'collection' && source === 'products' && catalogSearch,
      withSearch: mode !== 'collection' && source === 'search',
    },
  });
  const currencyCode = data?.shop.paymentSettings.currencyCode ?? 'USD';
  const common = { currencyCode, dataSearch: url.searchParams.toString(), origin: url.origin };
  if (data?.collection) {
    return {
      collection: data.collection,
      products: data.collection.products.nodes,
      availableFilters: data.collection.products.filters,
      pageInfo: data.collection.products.pageInfo,
      ...common,
    };
  }
  const search = data?.allSearch;
  if (search) {
    return {
      collection: syntheticAllCollection(),
      products: search.nodes.filter((node) => 'handle' in node),
      availableFilters: search.productFilters,
      pageInfo: {
        hasNextPage: search.pageInfo.hasNextPage,
        endCursor: search.pageInfo.endCursor
          ? `${ALL_SEARCH_CURSOR_PREFIX}${search.pageInfo.endCursor}`
          : null,
      },
      ...common,
    };
  }
  const all = data?.allProducts;
  if (!all) throw new Response('Collection not found', { status: 404 });
  return {
    collection: syntheticAllCollection(),
    products: all.nodes,
    // Root `products` has no Storefront filters: facets come from a 1-item catalogue search.
    availableFilters: data?.allFacets?.productFilters ?? [],
    pageInfo: {
      hasNextPage: all.pageInfo.hasNextPage,
      endCursor: all.pageInfo.endCursor ? `${ALL_CURSOR_PREFIX}${all.pageInfo.endCursor}` : null,
    },
    ...common,
  };
}

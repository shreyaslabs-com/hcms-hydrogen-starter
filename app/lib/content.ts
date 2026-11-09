/**
 * Online Store content routes the 2026-10 template lacks (S-06 §3): pages, blogs, articles,
 * policies and metaobject pages. Shopify stays the source of truth for this content (D-10).
 */
import { gql } from '@shopify/hydrogen';
import type { StorefrontClient } from '@shopify/hydrogen';

import { getCursorVariables, paginationLinks } from './hcms/pagination.ts';

export const BLOG_PAGE_SIZE = 12;

const IMAGE_FRAGMENT = gql(`
  fragment ContentImage on Image {
    url
    altText
    width
    height
  }
`);

export const PAGE_QUERY = gql(`
  query Page($handle: String!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
    page(handle: $handle) {
      id
      title
      body
      seo {
        title
        description
      }
    }
  }
`);

export const BLOG_QUERY = gql(
  `
    query Blog($handle: String!, $first: Int, $after: String, $last: Int, $before: String, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
      blog(handle: $handle) {
        id
        title
        handle
        seo {
          title
          description
        }
        articles(
          first: $first
          after: $after
          last: $last
          before: $before
          sortKey: PUBLISHED_AT
          reverse: true
        ) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          nodes {
            id
            handle
            title
            excerpt
            publishedAt
            authorV2 {
              name
            }
            image {
              ...ContentImage
            }
          }
        }
      }
    }
  `,
  [IMAGE_FRAGMENT],
);

export const ARTICLE_QUERY = gql(
  `
    query Article($blogHandle: String!, $articleHandle: String!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
      blog(handle: $blogHandle) {
        title
        handle
        articleByHandle(handle: $articleHandle) {
          id
          title
          contentHtml
          excerpt
          publishedAt
          tags
          authorV2 {
            name
          }
          image {
            ...ContentImage
          }
          seo {
            title
            description
          }
        }
      }
    }
  `,
  [IMAGE_FRAGMENT],
);

const POLICY_FRAGMENT = gql(`
  fragment PolicyItem on ShopPolicy {
    id
    title
    handle
    body
  }
`);

export const POLICIES_QUERY = gql(
  `
    query Policies($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
      shop {
        privacyPolicy {
          ...PolicyItem
        }
        shippingPolicy {
          ...PolicyItem
        }
        termsOfService {
          ...PolicyItem
        }
        refundPolicy {
          ...PolicyItem
        }
        subscriptionPolicy {
          id
          title
          handle
          body
        }
      }
    }
  `,
  [POLICY_FRAGMENT],
);

export const METAOBJECT_PAGE_QUERY = gql(
  `
    query MetaobjectPage($type: String!, $handle: String!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
      metaobject(handle: { type: $type, handle: $handle }) {
        id
        type
        handle
        updatedAt
        seo {
          title {
            type
            value
          }
          description {
            type
            value
          }
        }
        fields {
          key
          type
          value
          reference {
            __typename
            ... on MediaImage {
              image {
                ...ContentImage
              }
            }
          }
        }
      }
    }
  `,
  [IMAGE_FRAGMENT],
);

/** GraphQL errors without data mean Shopify failed, not that the resource is missing. */
function assertResponse(result: { data?: unknown; errors?: unknown }): void {
  if (!result.data && result.errors) {
    throw new Response('Storefront API error', { status: 502 });
  }
}

function notFound(): never {
  throw new Response('Not Found', { status: 404 });
}

export async function loadPage(storefrontClient: StorefrontClient, handle: string) {
  const result = await storefrontClient.graphql(PAGE_QUERY, { variables: { handle } });
  assertResponse(result);
  return result.data?.page ?? notFound();
}

export async function loadBlog(
  storefrontClient: StorefrontClient,
  handle: string,
  request: Request,
) {
  const result = await storefrontClient.graphql(BLOG_QUERY, {
    variables: { handle, ...getCursorVariables(request, BLOG_PAGE_SIZE) },
  });
  assertResponse(result);
  const blog = result.data?.blog ?? notFound();
  return { blog, pagination: paginationLinks(request, blog.articles.pageInfo) };
}

export async function loadArticle(
  storefrontClient: StorefrontClient,
  blogHandle: string,
  articleHandle: string,
) {
  const result = await storefrontClient.graphql(ARTICLE_QUERY, {
    variables: { blogHandle, articleHandle },
  });
  assertResponse(result);
  const blog = result.data?.blog;
  const article = blog?.articleByHandle;
  if (!blog || !article) notFound();
  return { blog: { title: blog.title, handle: blog.handle }, article };
}

export type Policy = { id: string; title: string; handle: string; body: string };

export async function loadPolicies(storefrontClient: StorefrontClient): Promise<Policy[]> {
  const result = await storefrontClient.graphql(POLICIES_QUERY, {});
  assertResponse(result);
  const shop = result.data?.shop;
  if (!shop) return [];
  return [
    shop.privacyPolicy,
    shop.refundPolicy,
    shop.shippingPolicy,
    shop.termsOfService,
    shop.subscriptionPolicy,
  ].filter((policy): policy is Policy => Boolean(policy?.body));
}

export async function loadPolicy(storefrontClient: StorefrontClient, handle: string) {
  const policies = await loadPolicies(storefrontClient);
  return policies.find((policy) => policy.handle === handle) ?? notFound();
}

/**
 * Metaobject web pages (docs/11 §4): `/pages/:type/:handle`. The URL segment is the metaobject
 * type; entries need a definition with Storefront access and the `renderable`/`onlineStore`
 * capability to be published.
 */
export async function loadMetaobjectPage(
  storefrontClient: StorefrontClient,
  type: string,
  handle: string,
) {
  const result = await storefrontClient.graphql(METAOBJECT_PAGE_QUERY, {
    variables: { type, handle },
  });
  assertResponse(result);
  return result.data?.metaobject ?? notFound();
}

/** Readable label from a metaobject field key or type: `store_location` → `Store location`. */
export function humanize(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

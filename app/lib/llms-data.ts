/**
 * Storefront data for `/llms.txt`: ONE query (shop, policies, capped collections/pages/blogs).
 * Primary market (no `@inContext`): llms.txt lists root URLs. The route caches by HTTP.
 */
import { gql } from '@shopify/hydrogen';

import { withBudget } from '~/lib/hcms/budget';
import { LLMS_LIMITS, type LlmsData } from '~/lib/hcms/llms';
import type { RequestStorefrontClient } from '~/lib/storefront';

export const LLMS_QUERY = gql(`
  query LlmsTxt($collections: Int!, $pages: Int!, $blogs: Int!) {
    shop {
      name
      description
      privacyPolicy {
        title
        handle
      }
      refundPolicy {
        title
        handle
      }
      shippingPolicy {
        title
        handle
      }
      termsOfService {
        title
        handle
      }
      subscriptionPolicy {
        title
        handle
      }
    }
    collections(first: $collections, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        handle
        title
        description
        seo {
          description
        }
        hidden: metafield(namespace: "seo", key: "hidden") {
          value
        }
      }
    }
    pages(first: $pages, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        handle
        title
        bodySummary
        seo {
          description
        }
        hidden: metafield(namespace: "seo", key: "hidden") {
          value
        }
      }
    }
    blogs(first: $blogs) {
      nodes {
        handle
        title
        seo {
          description
        }
        hidden: metafield(namespace: "seo", key: "hidden") {
          value
        }
      }
    }
  }
`);

/** `null` when the Storefront API fails or takes over 3 s (the file still answers). */
export async function loadLlmsData(
  storefrontClient: RequestStorefrontClient,
): Promise<LlmsData | null> {
  return withBudget(
    storefrontClient
      .graphql(LLMS_QUERY, {
        variables: {
          collections: LLMS_LIMITS.collections,
          pages: LLMS_LIMITS.pages,
          blogs: LLMS_LIMITS.blogs,
        },
      })
      .then(({ data }) => data ?? null),
    3_000,
    () => null,
    'llms.txt data',
  );
}

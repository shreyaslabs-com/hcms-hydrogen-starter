/** Loads a blog's Atom feed (T-2.41); see `lib/hcms/atom.ts`. Answered by the root middleware. */
import { gql } from '@shopify/hydrogen';

import { atomBlogHandle, atomFeed, atomResponse, type FeedBlog } from '~/lib/hcms/atom';
import type { RequestStorefrontClient } from '~/lib/storefront';

export const BLOG_FEED_QUERY = gql(`
  query HcmsBlogFeed($handle: String!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    shop {
      name
    }
    blog(handle: $handle) {
      handle
      title
      seo {
        description
      }
      articles(first: 25, sortKey: PUBLISHED_AT, reverse: true) {
        nodes {
          id
          handle
          title
          publishedAt
          contentHtml
          excerptHtml
          authorV2 {
            name
          }
          tags
          image {
            url
          }
        }
      }
    }
  }
`);

/** The feed for `/blogs/<handle>.atom`, a 404 for an unknown blog, or null for other URLs. */
export async function blogFeedResponse(
  request: Request,
  storefrontClient: RequestStorefrontClient,
  prefix: string,
): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const handle = atomBlogHandle(url.pathname);
  if (!handle) return null;
  const { data } = await storefrontClient.graphql(BLOG_FEED_QUERY, {
    variables: { handle },
  });
  const blog = data?.blog as FeedBlog | null | undefined;
  if (!blog) return new Response('Not Found', { status: 404 });
  return atomResponse(
    atomFeed({ origin: url.origin, prefix, shopName: data?.shop.name ?? '', blog }),
  );
}

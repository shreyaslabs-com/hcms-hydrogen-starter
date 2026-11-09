/**
 * Storefront data for sitemaps (T-1.1.6). Responses are cached by HTTP (`xmlResponse`), so the
 * queries themselves are uncached. Articles use the `articles` connection because sitemap
 * article handles don't include the blog handle.
 */
import { gql, type StorefrontApi } from '@shopify/hydrogen';

import {
  SITEMAP_MAX_URLS,
  SITEMAP_TYPES,
  sitemapResourcePath,
  type SitemapEntry,
  type SitemapTypeSlug,
} from '~/lib/hcms/sitemap';
import type { RequestStorefrontClient } from '~/lib/storefront';

export const SITEMAP_INDEX_QUERY = gql(`
  query SitemapIndex {
    products: sitemap(type: PRODUCT) {
      pagesCount {
        count
      }
    }
    collections: sitemap(type: COLLECTION) {
      pagesCount {
        count
      }
    }
    pages: sitemap(type: PAGE) {
      pagesCount {
        count
      }
    }
    blogs: sitemap(type: BLOG) {
      pagesCount {
        count
      }
    }
    metaobjects: sitemap(type: METAOBJECT) {
      pagesCount {
        count
      }
    }
    articles(first: 1) {
      nodes {
        id
      }
    }
  }
`);

export const SITEMAP_PAGE_QUERY = gql(`
  query SitemapPage($type: SitemapType!, $page: Int!) {
    sitemap(type: $type) {
      resources(page: $page) {
        hasNextPage
        items {
          handle
          updatedAt
          ... on SitemapResourceMetaobject {
            type
            onlineStoreUrlHandle
          }
        }
      }
    }
  }
`);

export const SITEMAP_ARTICLES_QUERY = gql(`
  query SitemapArticles($after: String) {
    articles(first: 250, after: $after, sortKey: UPDATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        handle
        publishedAt
        blog {
          handle
        }
        image {
          url
          altText
        }
      }
    }
  }
`);

type ArticlesData = StorefrontApi.ResultOf<typeof SITEMAP_ARTICLES_QUERY>;

/** Article pages fetched for the single article sitemap (250 each → 5,000 articles). */
const MAX_ARTICLE_PAGES = 20;

/** `{ products: 2, collections: 1, ... articles: 1 }` — number of sitemap files per type. */
export async function loadSitemapCounts(
  storefrontClient: RequestStorefrontClient,
): Promise<Partial<Record<SitemapTypeSlug, number>>> {
  const { data } = await storefrontClient.graphql(SITEMAP_INDEX_QUERY);
  if (!data) throw new Response('Storefront API error', { status: 502 });
  return {
    products: data.products.pagesCount?.count ?? 0,
    collections: data.collections.pagesCount?.count ?? 0,
    pages: data.pages.pagesCount?.count ?? 0,
    blogs: data.blogs.pagesCount?.count ?? 0,
    metaobjects: data.metaobjects.pagesCount?.count ?? 0,
    articles: data.articles.nodes.length > 0 ? 1 : 0,
  };
}

/** Entries for one sitemap file; paths are app paths (the route adds origin + market prefix). */
export async function loadSitemapEntries(
  storefrontClient: RequestStorefrontClient,
  type: SitemapTypeSlug,
  page: number,
): Promise<(Omit<SitemapEntry, 'loc'> & { path: string })[]> {
  if (type === 'articles') {
    if (page !== 1) return [];
    const entries: (Omit<SitemapEntry, 'loc'> & { path: string })[] = [];
    let after: string | null = null;
    for (let i = 0; i < MAX_ARTICLE_PAGES && entries.length < SITEMAP_MAX_URLS; i++) {
      const result: { data?: ArticlesData | null } = await storefrontClient.graphql(
        SITEMAP_ARTICLES_QUERY,
        {
          variables: { after },
        },
      );
      const connection: ArticlesData['articles'] | undefined = result.data?.articles;
      if (!connection) break;
      for (const node of connection.nodes) {
        const path = sitemapResourcePath('articles', {
          handle: node.handle,
          blogHandle: node.blog.handle,
        });
        if (!path) continue;
        entries.push({
          path,
          lastmod: node.publishedAt,
          ...(node.image ? { images: [{ loc: node.image.url, title: node.image.altText }] } : {}),
        });
      }
      if (!connection.pageInfo.hasNextPage) break;
      after = connection.pageInfo.endCursor ?? null;
    }
    return entries;
  }

  const { data } = await storefrontClient.graphql(SITEMAP_PAGE_QUERY, {
    variables: { type: SITEMAP_TYPES[type], page },
  });
  const items = data?.sitemap.resources?.items ?? [];
  return items.flatMap((item) => {
    const path = sitemapResourcePath(type, {
      handle: item.handle,
      type: 'type' in item ? item.type : null,
    });
    if (!path) return [];
    // `SitemapImage.filepath` isn't a full URL and its CDN mapping isn't documented: no images.
    return [{ path, lastmod: item.updatedAt }];
  });
}

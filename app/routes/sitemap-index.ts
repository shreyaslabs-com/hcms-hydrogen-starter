import { SITEMAP_MAX_URLS, sitemapIndexXml, xmlResponse } from '~/lib/hcms/sitemap';
import { marketContext } from '~/lib/localization';
import { allMarketPrefixes } from '~/lib/markets';
import { loadSitemapCounts } from '~/lib/sitemap-data';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/sitemap-index';

/** `/sitemap.xml` → `/{market?}/sitemap/{type}-{n}.xml` files: one index covering every type in every market subfolder (T-1.1.6). */
export async function loader({ context, request }: Route.LoaderArgs) {
  const { localization } = context.get(marketContext);
  const counts = await loadSitemapCounts(context.get(storefrontClientContext));
  const origin = new URL(request.url).origin;

  const sitemaps: { loc: string }[] = [];
  for (const prefix of allMarketPrefixes(localization)) {
    for (const [type, count] of Object.entries(counts)) {
      for (let page = 1; page <= (count ?? 0); page++) {
        sitemaps.push({ loc: `${origin}${prefix}/sitemap/${type}-${page}.xml` });
      }
    }
  }
  return xmlResponse(sitemapIndexXml(sitemaps.slice(0, SITEMAP_MAX_URLS)));
}

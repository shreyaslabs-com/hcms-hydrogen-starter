import { isSitemapType, urlsetXml, xmlResponse } from '~/lib/hcms/sitemap';
import { marketContext } from '~/lib/localization';
import { localizePath, sitemapAlternates } from '~/lib/markets';
import { loadSitemapEntries } from '~/lib/sitemap-data';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/sitemap-page';

/** `/{market?}/sitemap/{type}-{n}.xml`: URLs in that market's subfolder. */
export async function loader({ context, request, params }: Route.LoaderArgs) {
  const { market, valid, localization } = context.get(marketContext);
  const [, type = '', pageText] = params.file.match(/^([a-z]+)-(\d+)\.xml$/) ?? [];
  const page = Number(pageText);
  const localeMatches =
    params.locale === undefined
      ? market.pathPrefix === ''
      : `/${params.locale}` === market.pathPrefix;
  // The primary market lives unprefixed; `/en-us/sitemap/...` would duplicate it.
  const primaryPrefixed =
    market.pathPrefix !== '' &&
    market.country === localization.country.isoCode &&
    market.language === localization.language.isoCode;
  if (
    !valid ||
    !localeMatches ||
    primaryPrefixed ||
    !isSitemapType(type) ||
    !Number.isInteger(page) ||
    page < 1
  ) {
    throw new Response('Not Found', { status: 404 });
  }

  const entries = await loadSitemapEntries(context.get(storefrontClientContext), type, page);
  if (entries.length === 0 && page > 1) throw new Response('Not Found', { status: 404 });

  const origin = new URL(request.url).origin;
  return xmlResponse(
    urlsetXml(
      entries.map(({ path, ...rest }) => ({
        ...rest,
        loc: `${origin}${localizePath(path, market.pathPrefix)}`,
        // hreflang for every market subfolder + x-default (T-2.7).
        alternates: sitemapAlternates(localization, origin, path),
      })),
    ),
  );
}

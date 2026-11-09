/**
 * Sitemap XML builders (replaces Hydrogen's removed `getSitemap`/`getSitemapIndex`, S-06 §4).
 * Routes and Storefront queries come in T-1.1.6.
 */
export type SitemapEntry = {
  loc: string;
  lastmod?: string | null;
  /** hreflang alternates: locale → absolute URL. */
  alternates?: Record<string, string>;
  images?: { loc: string; title?: string | null }[];
};

/** Max URLs per sitemap file (protocol limit). */
export const SITEMAP_MAX_URLS = 50_000;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function sitemapIndexXml(sitemaps: { loc: string; lastmod?: string | null }[]): string {
  const items = sitemaps
    .map(
      ({ loc, lastmod }) =>
        `  <sitemap><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

export function urlsetXml(entries: SitemapEntry[]): string {
  if (entries.length > SITEMAP_MAX_URLS) {
    throw new Error(`A sitemap can hold at most ${SITEMAP_MAX_URLS} URLs`);
  }
  const items = entries
    .map(({ loc, lastmod, alternates, images }) => {
      const parts = [`<loc>${escapeXml(loc)}</loc>`];
      if (lastmod) parts.push(`<lastmod>${escapeXml(lastmod)}</lastmod>`);
      for (const [lang, href] of Object.entries(alternates ?? {})) {
        parts.push(
          `<xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}"/>`,
        );
      }
      for (const image of images ?? []) {
        parts.push(
          `<image:image><image:loc>${escapeXml(image.loc)}</image:loc>${image.title ? `<image:title>${escapeXml(image.title)}</image:title>` : ''}</image:image>`,
        );
      }
      return `  <url>${parts.join('')}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${items}\n</urlset>\n`;
}

export function xmlResponse(xml: string, { maxAge = 3600 } = {}): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 24}`,
    },
  });
}

/** URL segment in `/sitemap/:type/:page.xml` → Storefront `SitemapType`. Articles are separate. */
export const SITEMAP_TYPES = {
  products: 'PRODUCT',
  collections: 'COLLECTION',
  pages: 'PAGE',
  blogs: 'BLOG',
  metaobjects: 'METAOBJECT',
} as const;
export type SitemapTypeSlug = keyof typeof SITEMAP_TYPES | 'articles';

export function isSitemapType(value: string): value is SitemapTypeSlug {
  return value === 'articles' || value in SITEMAP_TYPES;
}

/** App path for a sitemap resource (matches the starter's routes). */
export function sitemapResourcePath(
  type: SitemapTypeSlug,
  item: { handle: string; type?: string | null; blogHandle?: string | null },
): string | null {
  switch (type) {
    case 'products':
      return `/products/${item.handle}`;
    case 'collections':
      return `/collections/${item.handle}`;
    case 'pages':
      return `/pages/${item.handle}`;
    case 'blogs':
      return `/blogs/${item.handle}`;
    case 'articles':
      return item.blogHandle ? `/blogs/${item.blogHandle}/${item.handle}` : null;
    case 'metaobjects':
      return item.type ? `/pages/${item.type}/${item.handle}` : null;
  }
}

const ROBOTS_LINE =
  /^(user-agent|allow|disallow|crawl-delay|sitemap|host|clean-param)\s*:\s*\S.*$/i;

/**
 * Merchant robots.txt rules (T-1.7.3, document `seo.robots`): only robots directives and comments
 * survive (no HTML, no control characters), ≤ 200 lines / 10 KB. Like Online Store's
 * robots.txt.liquid customisations, they are added after our default group.
 */
export function customRobotsRules(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const out: string[] = [];
  for (const line of raw.slice(0, 10_000).split(/\r?\n/)) {
    const clean = [...line]
      .filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
      .join('')
      .trim();
    if (!clean) {
      if (out.length && out[out.length - 1] !== '') out.push('');
    } else if (clean.startsWith('#') || ROBOTS_LINE.test(clean)) out.push(clean.slice(0, 500));
    if (out.length >= 200) break;
  }
  while (out[out.length - 1] === '') out.pop();
  return out;
}

/** robots.txt: keep crawlers out of cart/account/search/API in every market; list the index. */
export function robotsTxt(
  origin: string,
  { allowIndexing = true, custom }: { allowIndexing?: boolean; custom?: unknown } = {},
): string {
  if (!allowIndexing) return 'User-agent: *\nDisallow: /\n';
  const blocked = ['/cart', '/account', '/search', '/api/'];
  const lines = ['User-agent: *'];
  for (const path of blocked) lines.push(`Disallow: ${path}`, `Disallow: /*${path}`);
  const rules = customRobotsRules(custom);
  if (rules.length) {
    // A rule block that doesn't start a new group extends the default `User-agent: *` group.
    if (!/^user-agent\s*:/i.test(rules[0] as string) && !(rules[0] as string).startsWith('#')) {
      lines.push(...rules);
    } else lines.push('', ...rules);
  }
  lines.push('', `Sitemap: ${origin}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

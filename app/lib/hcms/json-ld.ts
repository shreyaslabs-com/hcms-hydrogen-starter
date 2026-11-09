/**
 * schema.org JSON-LD builders (T-1.7.2). Product/ProductGroup + Offer live in `routes/product.tsx`;
 * BreadcrumbList in `components/ContentPage.tsx` and the browse routes. All markup goes through
 * `serializeJsonLd` so Storefront text can never close the `<script>` element.
 */
import type { JsonLd } from './json-ld-script.ts';

// The serializer has its own module: `components/JsonLd` (root chunk) must not pull these
// builders (home/article only) into every page (JS budget).
export { serializeJsonLd, type JsonLd } from './json-ld-script.ts';

export type OrganizationInput = {
  name: string;
  origin: string;
  logo?: { url: string; width?: number | null; height?: number | null } | null;
  sameAs?: readonly string[];
};

export function organizationJsonLd({ name, origin, logo, sameAs = [] }: OrganizationInput): JsonLd {
  const links = sameAs.filter((u) => /^https:\/\//.test(u));
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name,
    url: `${origin}/`,
    ...(logo
      ? {
          logo: {
            '@type': 'ImageObject',
            url: logo.url,
            ...(logo.width ? { width: logo.width } : {}),
            ...(logo.height ? { height: logo.height } : {}),
          },
        }
      : {}),
    ...(links.length ? { sameAs: links } : {}),
  };
}

/** WebSite + sitelinks search box (Online Store themes ship the same SearchAction). */
export function websiteJsonLd({ name, origin }: { name: string; origin: string }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name,
    url: `${origin}/`,
    publisher: { '@id': `${origin}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export type ArticleInput = {
  title: string;
  url: string;
  publishedAt: string;
  excerpt?: string | null;
  author?: string | null;
  image?: { url: string; width?: number | null; height?: number | null } | null;
  shopName: string;
  origin: string;
};

export function articleJsonLd(a: ArticleInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title.slice(0, 110),
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
    url: a.url,
    datePublished: a.publishedAt,
    ...(a.excerpt ? { description: a.excerpt } : {}),
    ...(a.author ? { author: { '@type': 'Person', name: a.author } } : {}),
    ...(a.image
      ? {
          image: {
            '@type': 'ImageObject',
            url: a.image.url,
            ...(a.image.width ? { width: a.image.width } : {}),
            ...(a.image.height ? { height: a.image.height } : {}),
          },
        }
      : {}),
    publisher: { '@type': 'Organization', name: a.shopName, url: `${a.origin}/` },
  };
}

/**
 * Embeds Manager helpers the browser needs (T-2.9): template/path targeting and consent checks.
 * Kept apart from `./embeds.ts` (parsing, CSP, vendor config) so `HcmsEmbeds` in the root chunk
 * doesn't pull the vendor integration table into every page (JS budget, ADR 005).
 */
import type { ClientEmbed, ConsentCategory, ConsentState, EmbedType } from './embeds.ts';

/** Tags that receive ecommerce events from the analytics bus (T-2.66). */
export const AD_EMBED_TYPES: readonly EmbedType[] = [
  'ga4',
  'gtm',
  'meta_pixel',
  'tiktok_pixel',
  'pinterest_tag',
  'google_ads',
];

const LOCALE = /^\/[a-z]{2,3}-[a-z]{2}(?=\/|$)/i;

/** Template type for a storefront path (Online Store names), market prefix ignored. */
export function templateTypeForPath(pathname: string): string {
  const path = pathname.replace(LOCALE, '') || '/';
  const [first = '', second, third, fourth] = path.split('/').filter(Boolean);
  switch (first) {
    case '':
      return 'index';
    case 'products':
      return second ? 'product' : '404';
    case 'collections':
      return second ? 'collection' : 'list_collections';
    case 'pages':
      return third ? 'metaobject' : 'page';
    case 'blogs':
      return !third || third === 'tagged' ? 'blog' : fourth ? '404' : 'article';
    case 'search':
      return 'search';
    case 'cart':
      return 'cart';
    case 'account':
      return 'customers';
    case 'policies':
      return 'policy';
    case 'password':
      return 'password';
    default:
      return '404';
  }
}

/** Shopify Inbox embeds for this market (root loader → `ShopifyScripts` `inbox`). */
export const inboxEmbeds = (embeds: readonly ClientEmbed[]) =>
  embeds.filter((e) => e.type === 'shopify_inbox');

/** Template + path targeting (country was applied on the server). */
export function embedTargets(embed: ClientEmbed, pathname: string): boolean {
  if (embed.templates.length && !embed.templates.includes(templateTypeForPath(pathname)))
    return false;
  if (embed.paths.length) {
    const path = pathname.replace(LOCALE, '') || '/';
    return embed.paths.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`));
  }
  return true;
}

export function consentAllows(category: ConsentCategory, consent: ConsentState): boolean {
  if (category === 'none') return true;
  return consent.ready && consent[category];
}

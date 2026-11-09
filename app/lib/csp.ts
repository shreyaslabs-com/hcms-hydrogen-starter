/**
 * App-owned Content Security Policy + nonce (T-1.1.13). Hydrogen 2026-10 removed
 * `createContentSecurityPolicy`/`useNonce`, so the starter owns both:
 * - `entry.server.tsx` makes a nonce per response, passes it to React (`renderToReadableStream`
 *   + `NonceContext`) and sets the header; `root.tsx` puts it on every inline script.
 * - `frame-ancestors` is left to the SDK's `applyPreviewHeaders` (root middleware): `'self'`
 *   normally, admin + shop + editor origin in a verified preview (S-03 §Findings 2).
 * A dropped nonce still renders the page but kills hydration (cart, variant picker, analytics),
 * so check the console for CSP violations after changing scripts.
 */
import { createContext, useContext } from 'react';

import { MODEL_VIEWER_SRC } from '../components/hcms/model-viewer-src.ts';

export const NonceContext = createContext<string | undefined>(undefined);
export const useNonce = () => useContext(NonceContext);

/** 128-bit random nonce, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export type CspOptions = {
  nonce: string;
  /** `PUBLIC_STORE_DOMAIN` (`x.myshopify.com`). */
  shopDomain?: string | undefined;
  /** `PUBLIC_CHECKOUT_DOMAIN` (checkout subdomain). */
  checkoutDomain?: string | undefined;
  /** Vite dev server: HMR websocket + localhost. */
  dev?: boolean;
  /** Hosts of enabled Embeds Manager tags (T-2.9, `embedCspSources`). Validated origins only. */
  embeds?: {
    script: string[];
    connect: string[];
    /** App integrations (T-2.8): vendor stylesheets, fonts, iframes. */
    style?: string[];
    font?: string[];
    frame?: string[];
  };
  /** Hosts of Theme Document `<link rel=manifest>` tags (T-2.75, `headTagManifestHosts`). */
  manifest?: string[];
  /**
   * Adobe Fonts project set in theme settings (T-2.73): its stylesheet (`use.typekit.net`, which
   * `@import`s a page-view ping from `p.typekit.net`) and font files (`use.typekit.net`).
   */
  adobeFonts?: boolean;
};

/** Adobe Fonts hosts (style + font), added only when the theme has a project. */
const TYPEKIT = ['https://use.typekit.net', 'https://p.typekit.net'];

/** Defence in depth: only `https://host[:port]` / `https://*.host` reach the header. */
const SAFE_SOURCE = /^https:\/\/(\*\.)?[a-z0-9.-]+(:\d{1,5})?$/i;
const safeSources = (list: string[] | undefined) => (list ?? []).filter((s) => SAFE_SOURCE.test(s));

const SHOPIFY = ['https://cdn.shopify.com', 'https://shopify.com'];
const SHOPIFY_SCRIPTS = [
  'https://cdn.shopify.com/shopifycloud/',
  'https://cdn.shopify.com/storefront/',
  'https://shopify.com',
];
/** Video embeds (HcmsVideo) and the iframe hosts Custom HTML may keep (sections `sanitize.ts`). */
const FRAMES = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://youtube.com',
  'https://player.vimeo.com',
  'https://www.google.com',
  'https://maps.google.com',
  'https://shop.app',
  'https://*.shopify.com',
];

const host = (domain: string | undefined) =>
  domain && /^[a-z0-9.-]+$/i.test(domain) ? [`https://${domain}`] : [];

export function contentSecurityPolicy({
  nonce,
  shopDomain,
  checkoutDomain,
  dev = false,
  embeds,
  manifest,
  adobeFonts = false,
}: CspOptions): string {
  const local = dev ? ['http://localhost:*', 'ws://localhost:*', 'ws://127.0.0.1:*'] : [];
  const shop = [...host(shopDomain), ...host(checkoutDomain)];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'", ...SHOPIFY, ...local],
    // Scripts: only Shopify's runtime paths (never merchant Files under /s/files/) and the exact
    // model-viewer file (3D media), not all of ajax.googleapis.com (AngularJS = CSP bypass).
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      ...SHOPIFY_SCRIPTS,
      MODEL_VIEWER_SRC,
      ...safeSources(embeds?.script),
      ...local,
    ],
    // Inline style attributes (Shop Pay sizing, focal points) need 'unsafe-inline'.
    'style-src': [
      "'self'",
      "'unsafe-inline'",
      ...SHOPIFY,
      'https://fonts.googleapis.com',
      ...safeSources(embeds?.style),
      ...(adobeFonts ? TYPEKIT : []),
      ...local,
    ],
    'font-src': [
      "'self'",
      'data:',
      ...SHOPIFY,
      'https://fonts.gstatic.com',
      ...safeSources(embeds?.font),
      ...(adobeFonts ? TYPEKIT : []),
    ],
    // Merchant images (Files, metafield URLs, video posters) and hosted video can live anywhere.
    'img-src': ["'self'", 'data:', 'blob:', 'https:', ...local],
    'media-src': ["'self'", 'blob:', 'https:'],
    'connect-src': [
      "'self'",
      ...SHOPIFY,
      'https://monorail-edge.shopifysvc.com',
      'https://*.shopifysvc.com',
      ...shop,
      ...safeSources(embeds?.connect),
      ...local,
    ],
    'frame-src': ["'self'", ...FRAMES, ...shop, ...safeSources(embeds?.frame)],
    // Cart checkout posts to us, then redirects to Shopify checkout (form-action covers redirects).
    'form-action': [
      "'self'",
      'https://shopify.com',
      'https://*.shopify.com',
      'https://*.myshopify.com',
      'https://shop.app',
      ...shop,
    ],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
  // Custom head tags (T-2.75): only an external web app manifest needs a source. Our own
  // `/manifest.webmanifest` (T-2.83) is same-origin, covered by `default-src 'self'`.
  if (safeSources(manifest).length)
    directives['manifest-src'] = ["'self'", ...SHOPIFY, ...safeSources(manifest)];
  const policy = Object.entries(directives).map(
    ([name, sources]) => `${name} ${[...new Set(sources)].join(' ')}`,
  );
  if (!dev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

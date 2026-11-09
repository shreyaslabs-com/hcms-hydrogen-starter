/**
 * Embeds Manager runtime (T-2.9). Pure (node:test-importable). The theme document's `embeds`
 * (schema `EmbedSchema`: `{ id, type, enabled, …}`) are edited in the editor's Embeds panel and
 * ship with the published snapshot, so they follow draft → publish → rollback like everything
 * else and keep working when the HCMS API is down.
 *
 * Embed fields (unknown types/fields are ignored, so adapters can add their own types):
 * - `type`: `script` (`src`: https URL), `html` (`html`: Custom HTML, sanitized; no scripts),
 *   `ga4` (`tagId` G-/AW-/DC-…), `gtm` (`tagId` GTM-…), `meta_pixel` (`tagId`: digits),
 *   `tiktok_pixel` (`tagId`: TikTok pixel code), `pinterest_tag` (`tagId`: digits) (T-2.66),
 *   `google_ads` (`tagId` AW-…; optional `addToCartLabel`/`beginCheckoutLabel` conversion labels,
 *   `remarketing: false` = no remarketing page/product views). `google_search_console` has no
 *   runtime: it edits `seo.verification` (served by `head.ts`), so it's ignored here.
 * - Ad/analytics tags also get ecommerce events from the analytics bus (T-2.66,
 *   `./ad-events.ts`): `checkoutEvent: false` skips begin checkout (when a Shopify channel app
 *   already tracks checkout); ga4/gtm `feedCountry` (`US`, `ZZ`…) = the Merchant Center feed
 *   country in item ids (default: the market's country).
 * - `consent`: `analytics` | `marketing` | `preferences` | `none` (Customer Privacy API).
 * - `targeting`: `{ templates?: string[], countries?: string[], paths?: string[] }` (empty = all).
 * - `placement` (html only): `body_start` | `body_end` (default).
 * - `hosts`: extra https origins the tag loads from or talks to (CSP), e.g. for GTM tags.
 * - App integrations (T-2.8): `judgeme`, `klaviyo`, `yotpo`, `okendo`, `rebuy` with the vendor's
 *   public config fields (`./integrations.ts` `VENDOR_CONFIG`), sent to the client as `config`.
 * - `shopify_inbox` (T-2.54, S-09): no fields. Hydrogen's `ShopifyScripts` loads Inbox (`inbox`)
 *   and `<shopify-chat>` renders the chat; Shopify's scripts handle consent, so `consent` is
 *   always `none` here. Shopify Forms has no headless runtime (theme app extension only).
 */
import {
  VENDOR_CONFIG,
  isVendor,
  vendorConfig,
  type Vendor,
  type VendorHosts,
} from './integrations.ts';
import { AD_EMBED_TYPES } from './embed-targeting.ts';
import { GOOGLE_ADS_ID, GOOGLE_ADS_LABEL } from '@hcms/schema';

// Browser helpers live in `./embed-targeting.ts` so the client bundle never reaches this module
// (and, through it, the vendor table in `./integrations.ts`); re-exported for server code + tests.
export {
  AD_EMBED_TYPES,
  consentAllows,
  embedTargets,
  inboxEmbeds,
  templateTypeForPath,
} from './embed-targeting.ts';

// Literals (not derived from VENDOR_CONFIG) so the client bundle can drop the vendor table.
export const EMBED_TYPES = [
  'script',
  'html',
  'ga4',
  'gtm',
  'meta_pixel',
  'tiktok_pixel',
  'pinterest_tag',
  'google_ads',
  'judgeme',
  'klaviyo',
  'yotpo',
  'okendo',
  'rebuy',
  'shopify_inbox',
] as const;
export type EmbedType = (typeof EMBED_TYPES)[number];
export const CONSENT_CATEGORIES = ['analytics', 'marketing', 'preferences', 'none'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

export type EmbedTargeting = { templates: string[]; countries: string[]; paths: string[] };

/** What the root loader sends to the browser (already country-filtered, HTML sanitized). */
export type ClientEmbed = {
  id: string;
  type: EmbedType;
  consent: ConsentCategory;
  templates: string[];
  paths: string[];
  /** script: URL; ga4/gtm/meta_pixel: tag id; html: sanitized markup. */
  value: string;
  placement: 'body_start' | 'body_end';
  /** App integrations: validated public vendor config (keys, shop domain). */
  config?: Record<string, string>;
  /** Ad tags (T-2.66): Merchant Center feed country for Google item ids. */
  feedCountry?: string;
  /** Ad tags (T-2.66): false = don't send begin checkout from the storefront. */
  checkoutEvent?: false;
  /** Google Ads: conversion labels per event; `remarketing: false` = conversions only. */
  ads?: GoogleAdsOptions;
};

export type GoogleAdsOptions = { addToCart?: string; beginCheckout?: string; remarketing?: false };

/** Default consent per type: pixels are marketing, measurement is analytics. */
export const DEFAULT_CONSENT: Record<EmbedType, ConsentCategory> = {
  script: 'marketing',
  html: 'marketing',
  ga4: 'analytics',
  gtm: 'analytics',
  meta_pixel: 'marketing',
  tiktok_pixel: 'marketing',
  pinterest_tag: 'marketing',
  google_ads: 'marketing',
  // App integrations (T-2.8): same as `VENDOR_CONFIG[vendor].consent` (tested).
  judgeme: 'preferences',
  klaviyo: 'marketing',
  yotpo: 'preferences',
  okendo: 'preferences',
  rebuy: 'marketing',
  shopify_inbox: 'none',
};

/**
 * Consent floors (T-2.105): ad pixels always wait for marketing consent, measurement tags for at
 * least analytics. A stored value outside the allowed list (`none`, `preferences`…) is raised to
 * the type's default when parsed, so a document can't load a pixel without consent.
 */
export const ALLOWED_CONSENT: Partial<Record<EmbedType, readonly ConsentCategory[]>> = {
  meta_pixel: ['marketing'],
  tiktok_pixel: ['marketing'],
  pinterest_tag: ['marketing'],
  google_ads: ['marketing'],
  ga4: ['analytics', 'marketing'],
  gtm: ['analytics', 'marketing'],
};

/** The stored consent for `type`, raised to the type's floor; Shopify Inbox is always `none`. */
export function embedConsent(type: EmbedType, stored: unknown): ConsentCategory {
  if (type === 'shopify_inbox') return DEFAULT_CONSENT[type];
  const allowed = ALLOWED_CONSENT[type] ?? CONSENT_CATEGORIES;
  return allowed.includes(stored as ConsentCategory)
    ? (stored as ConsentCategory)
    : DEFAULT_CONSENT[type];
}

const TAG_ID: Partial<Record<EmbedType, RegExp>> = {
  ga4: /^(G|AW|DC)-[A-Z0-9]{4,20}$/,
  gtm: /^GTM-[A-Z0-9]{4,12}$/,
  meta_pixel: /^\d{5,20}$/,
  // No published format; pixel codes seen are ~20 uppercase letters/digits (C4…).
  tiktok_pixel: /^[A-Z0-9]{15,30}$/,
  // Tag ID from Pinterest Ads › Conversions (usually 13 digits; not the ad account ID).
  pinterest_tag: /^\d{9,16}$/,
  google_ads: GOOGLE_ADS_ID,
};

/** Hosts each preset needs: `script` → script-src, `connect` → connect-src (img-src is https:). */
const PRESET_HOSTS: Partial<Record<EmbedType, VendorHosts>> = {
  ga4: {
    script: ['https://www.googletagmanager.com'],
    connect: [
      'https://www.googletagmanager.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
    ],
  },
  gtm: {
    script: ['https://www.googletagmanager.com'],
    connect: ['https://www.googletagmanager.com', 'https://*.google-analytics.com'],
  },
  meta_pixel: {
    script: ['https://connect.facebook.net'],
    connect: ['https://www.facebook.com', 'https://connect.facebook.net'],
  },
  // TikTok: events.js + its chunks load from analytics.tiktok.com and post events there
  // (pixel images are covered by img-src https:). Verify against the browser console.
  tiktok_pixel: {
    script: ['https://analytics.tiktok.com'],
    connect: ['https://analytics.tiktok.com', 'https://analytics-ipv6.tiktokw.us'],
  },
  // Pinterest base code: s.pinimg.com/ct/core.js; events go to ct.pinterest.com
  // (help.pinterest.com/en/business/article/add-event-codes); core.js also frames
  // ct.pinterest.com/ct.html (seen in the browser, T-2.66).
  pinterest_tag: {
    script: ['https://s.pinimg.com'],
    connect: ['https://ct.pinterest.com', 'https://s.pinimg.com'],
    frame: ['https://ct.pinterest.com'],
  },
  // Google Ads conversions + remarketing (developers.google.com/tag-platform/security/guides/csp):
  // gtag.js, the conversion/remarketing endpoints and their iframes (img-src is https:).
  google_ads: {
    script: [
      'https://www.googletagmanager.com',
      'https://www.googleadservices.com',
      'https://www.google.com',
      'https://googleads.g.doubleclick.net',
    ],
    connect: [
      'https://www.googletagmanager.com',
      'https://www.googleadservices.com',
      'https://www.google.com',
      'https://google.com',
      'https://googleads.g.doubleclick.net',
      'https://td.doubleclick.net',
    ],
    frame: [
      'https://td.doubleclick.net',
      'https://bid.g.doubleclick.net',
      'https://www.googletagmanager.com',
    ],
  },
};

const ORIGIN =
  /^https:\/\/(\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d{1,5})?$/i;

/** `https://cdn.x.com/a.js` → `https://cdn.x.com`; null for anything but a clean https URL. */
export function httpsOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return ORIGIN.test(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}

/** A CSP source from the `hosts` list: `https://x.com`, `https://*.x.com` or bare `x.com`. */
export function cspHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().replace(/\/+$/, '');
  const withScheme = /^https:\/\//i.test(value) ? value : `https://${value}`;
  return ORIGIN.test(withScheme) ? withScheme.toLowerCase() : null;
}

const strings = (v: unknown, max: number, item: (s: string) => string | null) =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((s): s is string => typeof s === 'string')
            .map(item)
            .filter((s): s is string => Boolean(s)),
        ),
      ].slice(0, max)
    : [];

export type ParsedEmbed = {
  id: string;
  type: EmbedType;
  consent: ConsentCategory;
  targeting: EmbedTargeting;
  value: string;
  placement: 'body_start' | 'body_end';
  hosts: string[];
  config?: Record<string, string>;
  feedCountry?: string;
  checkoutEvent?: false;
  ads?: GoogleAdsOptions;
};

/**
 * Validates one raw document embed; null = skip (disabled, unknown type, bad value).
 * `shopDomain` (`PUBLIC_STORE_DOMAIN`) fills integrations' empty shop domain fields.
 */
export function parseEmbed(raw: unknown, shopDomain?: string): ParsedEmbed | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (e.enabled !== true || typeof e.id !== 'string') return null;
  const type = e.type as EmbedType;
  if (!EMBED_TYPES.includes(type)) return null;
  const tagId = typeof e.tagId === 'string' ? e.tagId.trim().toUpperCase() : '';
  let value: string | null;
  let config: Record<string, string> | null = null;
  if (isVendor(type)) {
    config = vendorConfig(type, e, shopDomain);
    value = config ? type : null;
  } else if (type === 'script') value = httpsOrigin(e.src) ? (e.src as string).trim() : null;
  else if (type === 'shopify_inbox') value = type;
  else if (type === 'html')
    value = typeof e.html === 'string' && e.html.trim() ? e.html.slice(0, 20_000) : null;
  else value = TAG_ID[type]?.test(tagId) ? tagId : null;
  if (!value) return null;
  const consent = embedConsent(type, e.consent);
  const t = (e.targeting ?? {}) as Record<string, unknown>;
  return {
    id: e.id,
    type,
    consent,
    targeting: {
      templates: strings(t.templates, 30, (s) => (/^[a-z_]+$/.test(s) ? s : null)),
      countries: strings(t.countries, 250, (s) => (/^[A-Z]{2}$/i.test(s) ? s.toUpperCase() : null)),
      paths: strings(t.paths, 50, (s) =>
        s.startsWith('/') && s.length <= 200 && !/\s/.test(s) ? s : null,
      ),
    },
    value,
    placement: e.placement === 'body_start' ? 'body_start' : 'body_end',
    hosts: strings(e.hosts, 20, cspHost),
    ...(config ? { config } : {}),
    ...adOptions(type, e),
  };
}

/** Ad tag options (T-2.66); empty for other types. */
function adOptions(
  type: EmbedType,
  e: Record<string, unknown>,
): { feedCountry?: string; checkoutEvent?: false; ads?: GoogleAdsOptions } {
  if (!AD_EMBED_TYPES.includes(type)) return {};
  const country = typeof e.feedCountry === 'string' ? e.feedCountry.trim().toUpperCase() : '';
  return {
    ...((type === 'ga4' || type === 'gtm') && /^[A-Z]{2}$/.test(country)
      ? { feedCountry: country }
      : {}),
    ...(e.checkoutEvent === false ? { checkoutEvent: false as const } : {}),
    ...(type === 'google_ads' ? { ads: googleAdsOptions(e) } : {}),
  };
}

/** Google Ads labels (case-sensitive, invalid ones dropped) + remarketing switch. */
function googleAdsOptions(e: Record<string, unknown>): GoogleAdsOptions {
  const label = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return GOOGLE_ADS_LABEL.test(s) ? s : undefined;
  };
  const addToCart = label(e.addToCartLabel);
  const beginCheckout = label(e.beginCheckoutLabel);
  return {
    ...(addToCart ? { addToCart } : {}),
    ...(beginCheckout ? { beginCheckout } : {}),
    ...(e.remarketing === false ? { remarketing: false as const } : {}),
  };
}

export function parseEmbeds(raw: unknown, shopDomain?: string): ParsedEmbed[] {
  return Array.isArray(raw)
    ? raw.slice(0, 50).flatMap((e) => {
        const parsed = parseEmbed(e, shopDomain);
        return parsed ? [parsed] : [];
      })
    : [];
}

/**
 * Root loader: embeds for this market's country, HTML sanitized with `sanitize` (sections
 * `sanitizeHtml`). In the editor preview only HTML embeds render (no third-party tags).
 */
export function clientEmbeds(
  raw: unknown,
  {
    country,
    preview = false,
    sanitize,
    shopDomain,
  }: {
    country: string;
    preview?: boolean;
    sanitize: (html: string) => string;
    shopDomain?: string | undefined;
  },
): ClientEmbed[] {
  return parseEmbeds(raw, shopDomain)
    .filter((e) => !e.targeting.countries.length || e.targeting.countries.includes(country))
    .filter((e) => !preview || e.type === 'html')
    .flatMap((e) => {
      const value = e.type === 'html' ? sanitize(e.value) : e.value;
      if (!value.trim()) return [];
      return [
        {
          id: e.id,
          type: e.type,
          consent: e.consent,
          templates: e.targeting.templates,
          paths: e.targeting.paths,
          value,
          placement: e.placement,
          ...(e.config ? { config: e.config } : {}),
          ...(e.feedCountry ? { feedCountry: e.feedCountry } : {}),
          ...(e.checkoutEvent === false ? { checkoutEvent: false as const } : {}),
          ...(e.ads ? { ads: e.ads } : {}),
        },
      ];
    });
}

/**
 * Vendors switched on for this market (adapter `integrations`): vendor blocks render their
 * containers only for these. Consent and template targeting still decide if the script loads.
 */
export function enabledIntegrations(
  raw: unknown,
  { country, shopDomain }: { country: string; shopDomain?: string | undefined },
): Vendor[] {
  return [
    ...new Set(
      parseEmbeds(raw, shopDomain)
        .filter((e) => !e.targeting.countries.length || e.targeting.countries.includes(country))
        .flatMap((e) => (isVendor(e.type) ? [e.type] : [])),
    ),
  ];
}

export type ConsentState = {
  ready: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
};

export type EmbedCspSources = {
  script: string[];
  connect: string[];
  style: string[];
  font: string[];
  frame: string[];
};

/** CSP sources for every enabled embed (merged into the starter policy by `csp.ts`). */
export function embedCspSources(raw: unknown, shopDomain?: string): EmbedCspSources {
  const script = new Set<string>();
  const connect = new Set<string>();
  const style = new Set<string>();
  const font = new Set<string>();
  const frame = new Set<string>();
  for (const e of parseEmbeds(raw, shopDomain)) {
    const preset: VendorHosts | undefined = isVendor(e.type)
      ? VENDOR_CONFIG[e.type].hosts
      : PRESET_HOSTS[e.type];
    preset?.script.forEach((h) => script.add(h));
    preset?.connect.forEach((h) => connect.add(h));
    preset?.style?.forEach((h) => style.add(h));
    preset?.font?.forEach((h) => font.add(h));
    preset?.frame?.forEach((h) => frame.add(h));
    if (e.type === 'script') {
      const origin = httpsOrigin(e.value);
      if (origin) {
        script.add(origin);
        connect.add(origin);
      }
    }
    for (const h of e.hosts) {
      script.add(h);
      connect.add(h);
    }
  }
  return {
    script: [...script],
    connect: [...connect],
    style: [...style],
    font: [...font],
    frame: [...frame],
  };
}

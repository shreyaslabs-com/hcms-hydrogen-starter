/**
 * App integrations (T-2.8): ONE table of every vendor's public storefront config, script URLs
 * and CSP hosts, so a wrong URL or host is a one-line fix. Pure (node:test-importable).
 *
 * An integration is an Embeds Manager entry (`embeds[]`, type = vendor id) holding the vendor's
 * PUBLIC keys only (never private API keys). It follows embeds rules: enabled flag, consent
 * category, template/country/path targeting, versioned with publish. Vendor scripts are started
 * by `~/lib/integrations-client.ts` (lazy chunk, after consent); the official sections' vendor
 * blocks (`@hcms/sections` `apps.tsx`) render the vendor's placeholder markup.
 *
 * Sources (checked Nov 2026; anything marked `verify` was not confirmed in vendor docs):
 * - Judge.me: help "Platform-independent widgets", "Retrieving cached widgets from the Judge.me
 *   cache server", OpenAPI `judge.me/api/docs.yaml`, and Judge.me's own `widget_preloader.js` /
 *   `loader.js` (T-2.103: server-rendered widgets, see `./judgeme.ts`).
 * - Klaviyo: developers.klaviyo.com (platform without a pre-built integration; Client API
 *   back-in-stock subscriptions), help.klaviyo.com (embedded forms).
 * - Yotpo: support.yotpo.com (Reviews 3.0 widgets, SPA re-init).
 * - Okendo: docs.okendo.io (widget markup, `okeWidgetApi`) + `@okendo/shopify-hydrogen` source.
 * - Rebuy: developers.rebuyengine.com (manual installation, rebuy.js widgets).
 * - Recharge: NOT an integration here. Subscriptions need `sellingPlanId` on the cart line;
 *   Hydrogen 2026-10's product form store has no selling-plan support (see T-2.44).
 */

export const VENDORS = ['judgeme', 'klaviyo', 'yotpo', 'okendo', 'rebuy'] as const;
export type Vendor = (typeof VENDORS)[number];

export const isVendor = (type: unknown): type is Vendor => VENDORS.includes(type as Vendor);

const MYSHOPIFY = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export type VendorField = {
  key: string;
  pattern: RegExp;
  /** Falls back to the store's `PUBLIC_STORE_DOMAIN` when the embed leaves it empty. */
  shopDomain?: boolean;
  /** Lower-case the value before checking (domains). */
  lower?: boolean;
};

export type VendorHosts = {
  script: string[];
  connect: string[];
  style?: string[];
  font?: string[];
  frame?: string[];
};

export type VendorConfig = {
  name: string;
  /** Customer Privacy category the vendor waits for (merchants can change it per embed). */
  consent: 'analytics' | 'marketing' | 'preferences';
  fields: VendorField[];
  hosts: VendorHosts;
};

export const VENDOR_CONFIG: Record<Vendor, VendorConfig> = {
  judgeme: {
    name: 'Judge.me',
    // Reviews are content shoppers ask for; Judge.me still sets cookies → preferences.
    consent: 'preferences',
    fields: [
      { key: 'shopDomain', pattern: MYSHOPIFY, shopDomain: true, lower: true },
      // Public widget token from Judge.me › Settings › Integrations (verify format).
      { key: 'publicToken', pattern: /^[A-Za-z0-9_-]{8,64}$/ },
    ],
    hosts: {
      // cdnwidget = widget code + CSS (`loader.js` and the files it loads); cache.judge.me /
      // api.judge.me = widget data and review submissions (both under *.judge.me).
      script: ['https://cdn.judge.me', 'https://cdnwidget.judge.me'],
      connect: ['https://judge.me', 'https://*.judge.me'],
      style: ['https://cdn.judge.me', 'https://cdnwidget.judge.me'],
      font: ['https://cdn.judge.me', 'https://cdnwidget.judge.me'],
    },
  },
  klaviyo: {
    name: 'Klaviyo',
    consent: 'marketing',
    // Public API key / site id = 6 characters.
    fields: [{ key: 'companyId', pattern: /^[A-Za-z0-9]{6}$/ }],
    hosts: {
      script: ['https://static.klaviyo.com', 'https://static-tracking.klaviyo.com'],
      connect: [
        'https://a.klaviyo.com',
        'https://fast.a.klaviyo.com',
        'https://static.klaviyo.com',
        'https://static-forms.klaviyo.com',
      ],
      style: ['https://static.klaviyo.com', 'https://static-forms.klaviyo.com'],
      font: ['https://static.klaviyo.com', 'https://static-forms.klaviyo.com'],
      // Forms CAPTCHA (verify).
      frame: ['https://www.google.com', 'https://www.recaptcha.net'],
    },
  },
  yotpo: {
    name: 'Yotpo',
    consent: 'preferences',
    fields: [{ key: 'appKey', pattern: /^[A-Za-z0-9]{10,64}$/ }],
    hosts: {
      script: ['https://cdn-widgetsrepository.yotpo.com', 'https://*.yotpo.com'],
      connect: ['https://*.yotpo.com'],
      style: ['https://*.yotpo.com'],
      font: ['https://*.yotpo.com'],
    },
  },
  okendo: {
    name: 'Okendo',
    consent: 'preferences',
    fields: [
      {
        key: 'subscriberId',
        pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        lower: true,
      },
    ],
    hosts: {
      script: ['https://cdn-static.okendo.io'],
      connect: [
        'https://api.okendo.io',
        'https://surveys.okendo.io',
        'https://cdn-static.okendo.io',
      ],
      style: ['https://cdn-static.okendo.io'],
      font: ['https://cdn-static.okendo.io'],
    },
  },
  rebuy: {
    name: 'Rebuy',
    consent: 'marketing',
    fields: [{ key: 'shopDomain', pattern: MYSHOPIFY, shopDomain: true, lower: true }],
    hosts: {
      script: ['https://cdn.rebuyengine.com', 'https://rebuyengine.com'],
      connect: ['https://rebuyengine.com', 'https://*.rebuyengine.com'],
      style: ['https://cdn.rebuyengine.com'],
    },
  },
};

/** Script URLs the client loads for a vendor, in order (config already validated). */
export function vendorScripts(vendor: Vendor, config: Record<string, string>): string[] {
  const q = encodeURIComponent;
  switch (vendor) {
    case 'judgeme':
      // T-2.103: started by `integrations-client.ts` `startJudgeme` (settings + `loader.js` /
      // `judgeme_widget_v2.js` by widget version), never Judge.me's preloader (it `eval`s).
      return [];
    case 'klaviyo':
      return [
        `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${q(config.companyId ?? '')}`,
      ];
    case 'yotpo':
      return [`https://cdn-widgetsrepository.yotpo.com/v1/loader/${q(config.appKey ?? '')}`];
    case 'okendo':
      return ['https://cdn-static.okendo.io/reviews-widget-plus/js/okendo-reviews.js'];
    case 'rebuy':
      return [`https://cdn.rebuyengine.com/onsite/js/rebuy.js?shop=${q(config.shopDomain ?? '')}`];
  }
}

/** Okendo widget settings (fetched before the script; verify response shape). */
export const okendoSettingsUrl = (subscriberId: string) =>
  `https://api.okendo.io/v1/stores/${encodeURIComponent(subscriberId)}/widget_plus_settings`;

/** Validated public config for one integration embed; null when a required field is bad. */
export function vendorConfig(
  vendor: Vendor,
  embed: Record<string, unknown>,
  shopDomain?: string,
): Record<string, string> | null {
  const config: Record<string, string> = {};
  for (const field of VENDOR_CONFIG[vendor].fields) {
    let value = typeof embed[field.key] === 'string' ? (embed[field.key] as string).trim() : '';
    if (!value && field.shopDomain) value = shopDomain ?? '';
    if (field.lower) value = value.toLowerCase();
    if (!field.pattern.test(value)) return null;
    config[field.key] = value;
  }
  return config;
}

// --- Klaviyo -----------------------------------------------------------------------------------

/** Klaviyo Client API revision (back-in-stock subscriptions). */
export const KLAVIYO_REVISION = '2026-10-15';

/** Client API back-in-stock request (public key; no private key on the storefront). */
export function klaviyoBackInStockRequest(
  companyId: string,
  email: string,
  variantId: string,
): { url: string; init: RequestInit } {
  return {
    url: `https://a.klaviyo.com/client/back-in-stock-subscriptions?company_id=${encodeURIComponent(companyId)}`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify({
        data: {
          type: 'back-in-stock-subscription',
          attributes: {
            channels: ['EMAIL'],
            profile: { data: { type: 'profile', attributes: { email } } },
          },
          relationships: {
            variant: {
              data: { type: 'catalog-variant', id: `$shopify:::$default:::${variantId}` },
            },
          },
        },
      }),
    },
  };
}

const numeric = (gid: unknown) => (typeof gid === 'string' ? (/(\d+)$/.exec(gid)?.[1] ?? gid) : '');
const amount = (price: unknown): number => {
  const raw = price && typeof price === 'object' ? (price as { amount?: unknown }).amount : price;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

type AnalyticsProduct = {
  id?: string;
  title?: string;
  vendor?: string;
  price?: unknown;
  sku?: string | null;
  variantId?: string;
};

/** Hydrogen `product_viewed` → Klaviyo "Viewed Product" + `trackViewedItem` (Klaviyo names). */
export function klaviyoViewedProduct(
  payload: unknown,
  url: string,
): [string, Record<string, unknown>][] {
  const product = (payload as { products?: AnalyticsProduct[] } | null)?.products?.[0];
  if (!product?.id) return [];
  const price = amount(product.price);
  const id = numeric(product.id);
  return [
    [
      'Viewed Product',
      {
        ProductName: product.title ?? '',
        ProductID: id,
        SKU: product.sku ?? '',
        URL: url,
        Brand: product.vendor ?? '',
        Price: price,
      },
    ],
    [
      'trackViewedItem',
      {
        Title: product.title ?? '',
        ItemId: id,
        Url: url,
        Metadata: { Brand: product.vendor ?? '', Price: price },
      },
    ],
  ];
}

type CartLine = {
  quantity?: number;
  merchandise?: {
    id?: string;
    title?: string;
    sku?: string | null;
    price?: unknown;
    product?: { id?: string; title?: string; handle?: string };
  };
};

/** Hydrogen `product_added_to_cart` → Klaviyo "Added to Cart" (null when nothing was added). */
export function klaviyoAddedToCart(
  payload: unknown,
  origin: string,
): Record<string, unknown> | null {
  const p = payload as {
    cart?: { lines?: { nodes?: CartLine[] } } | null;
    currentLine?: CartLine | null;
    prevLine?: CartLine | null;
  } | null;
  const line = p?.currentLine;
  const product = line?.merchandise?.product;
  if (!line?.merchandise || !product?.id) return null;
  const added = (line.quantity ?? 0) - (p?.prevLine?.quantity ?? 0);
  if (added <= 0) return null;
  const items = (p?.cart?.lines?.nodes ?? []).filter((l) => l.merchandise?.product);
  const url = (handle?: string) => (handle ? `${origin}/products/${handle}` : '');
  return {
    $value: items.reduce((sum, l) => sum + amount(l.merchandise?.price) * (l.quantity ?? 0), 0),
    AddedItemProductName: product.title ?? '',
    AddedItemProductID: numeric(product.id),
    AddedItemSKU: line.merchandise.sku ?? '',
    AddedItemPrice: amount(line.merchandise.price),
    AddedItemQuantity: added,
    AddedItemURL: url(product.handle),
    ItemNames: items.map((l) => l.merchandise?.product?.title ?? ''),
    CheckoutURL: `${origin}/cart`,
    Items: items.map((l) => ({
      ProductID: numeric(l.merchandise?.product?.id),
      SKU: l.merchandise?.sku ?? '',
      ProductName: l.merchandise?.product?.title ?? '',
      Quantity: l.quantity ?? 0,
      ItemPrice: amount(l.merchandise?.price),
      RowTotal: amount(l.merchandise?.price) * (l.quantity ?? 0),
      ProductURL: url(l.merchandise?.product?.handle),
    })),
  };
}

/**
 * Ecommerce events for ad/analytics tags (T-2.66). Pure (node:test-importable): Hydrogen
 * analytics bus payloads → one normalized `CommerceEvent` → each vendor's call. The browser glue
 * (`lib/ad-events-client.ts`, lazy) only checks consent/targeting and calls the vendor globals.
 *
 * Bus events (Hydrogen 2026-10 `AnalyticsEvent`, shopify.dev/docs/api/hydrogen/2026-10/analytics/
 * analytics-event): `product_viewed`, `collection_viewed`, `search_viewed`, `cart_viewed`,
 * `product_added_to_cart`; plus our own `checkout_started` (checkout link clicks in the cart
 * drawer / page / notification, sent as the `hcms:checkout_started` window event).
 *
 * Vendor references:
 * - GA4 ecommerce (gtag): developers.google.com/analytics/devguides/collection/ga4/reference/
 *   events?client_type=gtag — view_item, view_item_list, search (search_term), add_to_cart,
 *   view_cart, begin_checkout; `items[]` item_id/item_name/item_brand/item_variant/price/quantity.
 * - Google Ads dynamic remarketing: support.google.com/google-ads/answer/7305793 — item `id` must
 *   match the Merchant Center feed id; Shopify's Google & YouTube app submits
 *   `shopify_<CC>_<productId>_<variantId>` (newer multi-country products: `ZZ`), so we send that as
 *   both `id` (Ads) and `item_id` (GA4) with `google_business_vertical: 'retail'`.
 * - Meta Pixel: developers.facebook.com/docs/meta-pixel/reference (ViewContent, AddToCart,
 *   InitiateCheckout, Search; content_ids/content_type/contents/value/currency/num_items/
 *   search_string); `eventID` (4th fbq arg) dedups with the Conversions API:
 *   developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events.
 *   The Facebook & Instagram channel catalog uses the variant id as content id (content_type
 *   `product`; Shopify community threads, verify per catalog).
 * - TikTok Pixel: ads.tiktok.com/help/article/standard-events-parameters (ViewContent,
 *   AddToCart, InitiateCheckout, Search), ads.tiktok.com/help/article/about-parameters
 *   (contents, content_type, value, currency, search_string), event_id for Events API dedup:
 *   ads.tiktok.com/help/article/event-deduplication (passed as `ttq.track(name, params,
 *   { event_id })`).
 * - Pinterest Tag: help.pinterest.com/en/business/article/add-event-codes — viewcategory, search
 *   (search_query), addtocart, initiatecheckout (`checkout` = completed purchase, so not used
 *   here); `line_items[]` product_id/product_name/product_price/product_quantity/
 *   product_variant_id, value, currency, order_quantity, event_id (Conversions API dedup).
 */

export type CommerceItem = {
  productId: string;
  variantId: string;
  name: string;
  variant: string;
  brand: string;
  sku: string;
  price: number;
  quantity: number;
};

export type CommerceEvent = {
  kind: 'view_item' | 'view_item_list' | 'search' | 'add_to_cart' | 'view_cart' | 'begin_checkout';
  /** Dedup key: the same key never fires twice within its scope. */
  key: string;
  /** `page`: views (reset per page view); `global`: cart events (cart id + updatedAt unique). */
  scope: 'page' | 'global';
  items: CommerceItem[];
  value: number;
  currency: string;
  listId?: string;
  listName?: string;
  searchTerm?: string;
};

/** Bus events the glue subscribes to. */
export const COMMERCE_BUS_EVENTS = [
  'product_viewed',
  'collection_viewed',
  'search_viewed',
  'cart_viewed',
  'product_added_to_cart',
  'checkout_started',
] as const;
export type CommerceBusEvent = (typeof COMMERCE_BUS_EVENTS)[number];

/**
 * Window event for checkout link clicks (`detail` = `{ cart }`, Hydrogen `AnalyticsCart`),
 * mapped as the `checkout_started` bus event.
 */
export const CHECKOUT_STARTED = 'hcms:checkout_started';

/** `gid://shopify/ProductVariant/123` → `123`. */
export const numericId = (gid: unknown): string =>
  typeof gid === 'string' ? (/(\d+)$/.exec(gid)?.[1] ?? '') : '';

type Money = { amount?: unknown; currencyCode?: unknown } | null | undefined;
const amount = (m: unknown): number => {
  const raw = m && typeof m === 'object' ? (m as { amount?: unknown }).amount : m;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};
const currencyOf = (m: unknown): string => {
  const c = m && typeof m === 'object' ? (m as { currencyCode?: unknown }).currencyCode : null;
  return typeof c === 'string' && /^[A-Z]{3}$/.test(c) ? c : '';
};
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const round = (n: number) => Math.round(n * 100) / 100;

type BusProduct = {
  id?: string;
  title?: string;
  vendor?: string;
  price?: Money | string;
  variantId?: string;
  variantTitle?: string;
  sku?: string | null;
  quantity?: number;
};

type BusLine = {
  quantity?: number;
  merchandise?: {
    id?: string;
    title?: string;
    sku?: string | null;
    price?: Money;
    product?: { id?: string; title?: string; vendor?: string };
  };
};

type BusCart = { id?: string; updatedAt?: string; lines?: { nodes?: BusLine[] } } | null;

function lineItem(line: BusLine, quantity = line.quantity ?? 1): CommerceItem | null {
  const m = line.merchandise;
  const productId = numericId(m?.product?.id);
  const variantId = numericId(m?.id);
  if (!productId || !variantId) return null;
  return {
    productId,
    variantId,
    name: str(m?.product?.title),
    variant: str(m?.title) === 'Default Title' ? '' : str(m?.title),
    brand: str(m?.product?.vendor),
    sku: str(m?.sku),
    price: amount(m?.price),
    quantity,
  };
}

function cartEvent(
  kind: 'view_cart' | 'begin_checkout',
  cart: BusCart,
  fallbackCurrency: string,
): CommerceEvent | null {
  const lines = cart?.lines?.nodes ?? [];
  const items = lines.flatMap((l) => {
    const item = lineItem(l);
    return item ? [item] : [];
  });
  if (!cart?.id || !items.length) return null;
  return {
    kind,
    key: `${kind}:${cart.id}:${cart.updatedAt ?? ''}`,
    // Opening the drawer again on another page is another view; checkout once per cart state.
    scope: kind === 'view_cart' ? 'page' : 'global',
    items,
    value: round(items.reduce((sum, i) => sum + i.price * i.quantity, 0)),
    currency:
      currencyOf(lines.find((l) => currencyOf(l.merchandise?.price))?.merchandise?.price) ||
      fallbackCurrency,
  };
}

/**
 * Bus event → normalized commerce event (null = nothing to send). `currency` = the market's
 * currency, used when the payload carries no prices (collection/search views).
 */
export function commerceEvent(
  event: string,
  payload: unknown,
  currency: string,
): CommerceEvent | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (event) {
    case 'product_viewed': {
      const product = (p.products as BusProduct[] | undefined)?.[0];
      const productId = numericId(product?.id);
      if (!product || !productId) return null;
      const variantId = numericId(product.variantId) || productId;
      const price = amount(product.price);
      const title = str(product.variantTitle);
      return {
        kind: 'view_item',
        key: `view_item:${productId}`,
        scope: 'page',
        items: [
          {
            productId,
            variantId,
            name: str(product.title),
            variant: title === 'Default Title' || title === product.title ? '' : title,
            brand: str(product.vendor),
            sku: str(product.sku),
            price,
            quantity: 1,
          },
        ],
        value: price,
        currency: currencyOf(product.price) || currency,
      };
    }
    case 'collection_viewed': {
      const c = p.collection as { id?: string; handle?: string; title?: string } | undefined;
      if (!c?.handle) return null;
      return {
        kind: 'view_item_list',
        key: `view_item_list:${c.handle}`,
        scope: 'page',
        items: [],
        value: 0,
        currency,
        listId: c.handle,
        listName: str(c.title) || c.handle,
      };
    }
    case 'search_viewed': {
      const term = str(p.searchTerm).trim().slice(0, 200);
      if (!term) return null;
      return {
        kind: 'search',
        key: `search:${term.toLowerCase()}`,
        scope: 'page',
        items: [],
        value: 0,
        currency,
        searchTerm: term,
      };
    }
    case 'cart_viewed':
      return cartEvent('view_cart', p.cart as BusCart, currency);
    case 'checkout_started':
      return cartEvent('begin_checkout', p.cart as BusCart, currency);
    case 'product_added_to_cart': {
      const current = p.currentLine as BusLine | undefined;
      const added = (current?.quantity ?? 0) - ((p.prevLine as BusLine | undefined)?.quantity ?? 0);
      const item = current && added > 0 ? lineItem(current, added) : null;
      if (!item) return null;
      const cart = p.cart as BusCart;
      return {
        kind: 'add_to_cart',
        // Hydrogen publishes once per confirmed cart change (`updatedAt`); replays share the key.
        key: `add_to_cart:${cart?.updatedAt ?? ''}:${item.variantId}:${current?.quantity ?? 0}`,
        scope: 'global',
        items: [item],
        value: round(item.price * added),
        currency: currencyOf(current?.merchandise?.price) || currency,
      };
    }
    default:
      return null;
  }
}

/** FNV-1a 32-bit → base36 (stable, tiny; not crypto). */
export function hashKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Deterministic event id (Meta `eventID`, TikTok/Pinterest `event_id`): the same event (same key
 * in the same page view) always gets the same id, so a later server-side Conversions API call
 * sent with it is deduplicated. `pageView` is the page view's id (views only).
 */
export const eventId = (e: CommerceEvent, pageView: string) =>
  `hcms.${e.kind}.${hashKey(e.scope === 'page' ? `${pageView}|${e.key}` : e.key)}`;

/**
 * Fires each key once per scope: page-scoped keys reset when the page view changes (client
 * navigation), global keys (cart events) never repeat — so re-renders, loader revalidations and
 * bus replays don't double-count.
 */
export function createDeduper() {
  const global = new Set<string>();
  let page = new Set<string>();
  let pageView = '';
  return (e: CommerceEvent, currentPageView: string): boolean => {
    if (currentPageView !== pageView) {
      pageView = currentPageView;
      page = new Set();
    }
    const seen = e.scope === 'page' ? page : global;
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    return true;
  };
}

/** Merchant Center offer id as Shopify's Google & YouTube app submits it. */
export const googleItemId = (item: CommerceItem, feedCountry: string) =>
  `shopify_${feedCountry}_${item.productId}_${item.variantId}`;

const GA4_NAMES: Record<CommerceEvent['kind'], string> = {
  view_item: 'view_item',
  view_item_list: 'view_item_list',
  search: 'search',
  add_to_cart: 'add_to_cart',
  view_cart: 'view_cart',
  begin_checkout: 'begin_checkout',
};

/** GA4 ecommerce `items[]` (+ Ads remarketing `id`). */
export function ga4Items(e: CommerceEvent, feedCountry: string) {
  return e.items.map((item) => {
    const id = googleItemId(item, feedCountry);
    return {
      item_id: id,
      id,
      item_name: item.name,
      ...(item.brand ? { item_brand: item.brand } : {}),
      ...(item.variant ? { item_variant: item.variant } : {}),
      price: item.price,
      quantity: item.quantity,
      google_business_vertical: 'retail',
    };
  });
}

/** `gtag('event', name, params)` for GA4 + Google Ads (every configured G-/AW- tag). */
export function gtagEvent(
  e: CommerceEvent,
  feedCountry: string,
): [string, Record<string, unknown>] {
  const name = GA4_NAMES[e.kind];
  if (e.kind === 'search') return [name, { search_term: e.searchTerm }];
  if (e.kind === 'view_item_list')
    return [name, { item_list_id: e.listId, item_list_name: e.listName, items: [] }];
  return [name, { currency: e.currency, value: e.value, items: ga4Items(e, feedCountry) }];
}

/**
 * GTM data layer (Google's GA4 ecommerce pattern: clear `ecommerce`, then push the event);
 * `search_term` is an event parameter, not ecommerce data.
 */
export function dataLayerEvent(e: CommerceEvent, feedCountry: string): Record<string, unknown> {
  const [event, params] = gtagEvent(e, feedCountry);
  return e.kind === 'search' ? { event, ...params } : { event, ecommerce: params };
}

const contentIds = (e: CommerceEvent) => e.items.map((i) => i.variantId);
const numItems = (e: CommerceEvent) => e.items.reduce((n, i) => n + i.quantity, 0);

/** Meta Pixel `fbq('track', name, params, { eventID })`; null = no Meta standard event. */
export function metaEvent(
  e: CommerceEvent,
  id: string,
): [string, Record<string, unknown>, { eventID: string }] | null {
  const contents = e.items.map((i) => ({
    id: i.variantId,
    quantity: i.quantity,
    item_price: i.price,
  }));
  const products = {
    content_ids: contentIds(e),
    content_type: 'product',
    contents,
    value: e.value,
    currency: e.currency,
  };
  switch (e.kind) {
    case 'view_item':
      return [
        'ViewContent',
        { ...products, content_name: e.items[0]?.name ?? '' },
        { eventID: id },
      ];
    case 'add_to_cart':
      return ['AddToCart', { ...products, content_name: e.items[0]?.name ?? '' }, { eventID: id }];
    case 'begin_checkout':
      return ['InitiateCheckout', { ...products, num_items: numItems(e) }, { eventID: id }];
    case 'search':
      return ['Search', { search_string: e.searchTerm }, { eventID: id }];
    default:
      return null;
  }
}

/** TikTok `ttq.track(name, params, { event_id })`; null = no TikTok standard event. */
export function tiktokEvent(
  e: CommerceEvent,
  id: string,
): [string, Record<string, unknown>, { event_id: string }] | null {
  const products = {
    contents: e.items.map((i) => ({
      content_id: i.variantId,
      content_type: 'product',
      content_name: i.name,
      quantity: i.quantity,
      price: i.price,
    })),
    content_type: 'product',
    value: e.value,
    currency: e.currency,
  };
  const name = {
    view_item: 'ViewContent',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
  }[e.kind as string];
  if (name) return [name, products, { event_id: id }];
  if (e.kind === 'search') return ['Search', { search_string: e.searchTerm }, { event_id: id }];
  return null;
}

/** Pinterest `pintrk('track', name, params)`; null = no Pinterest event. */
export function pinterestEvent(
  e: CommerceEvent,
  id: string,
): [string, Record<string, unknown>] | null {
  const products = {
    value: e.value,
    currency: e.currency,
    order_quantity: numItems(e),
    line_items: e.items.map((i) => ({
      product_id: i.productId,
      product_variant_id: i.variantId,
      product_name: i.name,
      product_price: i.price,
      product_quantity: i.quantity,
      ...(i.brand ? { product_brand: i.brand } : {}),
    })),
    event_id: id,
  };
  switch (e.kind) {
    case 'view_item_list':
      return ['viewcategory', { event_id: id }];
    case 'search':
      return ['search', { search_query: e.searchTerm, event_id: id }];
    case 'add_to_cart':
      return ['addtocart', products];
    case 'begin_checkout':
      return ['initiatecheckout', products];
    default:
      return null;
  }
}

/** Google Ads tag options (`ClientEmbed.ads` + its AW- id): conversion labels, remarketing. */
export type GoogleAdsTag = {
  id: string;
  addToCart?: string;
  beginCheckout?: string;
  remarketing?: false;
};

/**
 * Google Ads calls for one commerce event (dynamic remarketing:
 * support.google.com/google-ads/answer/7305793; conversion event snippet
 * `gtag('event', 'conversion', { send_to: 'AW-…/label', value, currency })`). Every call carries
 * `send_to`, so it reaches only this Ads tag, never GA4. view_item, add_to_cart and
 * begin_checkout feed remarketing (off with `remarketing: false`); add_to_cart and begin_checkout
 * also fire the conversion when a label is set. Purchases happen on Shopify's checkout, so they
 * are never sent from the storefront.
 */
export function googleAdsEvents(
  e: CommerceEvent,
  tag: GoogleAdsTag,
  feedCountry: string,
): [string, Record<string, unknown>][] {
  if (e.kind !== 'view_item' && e.kind !== 'add_to_cart' && e.kind !== 'begin_checkout') return [];
  const calls: [string, Record<string, unknown>][] = [];
  if (tag.remarketing !== false)
    calls.push([
      e.kind,
      { send_to: tag.id, value: e.value, currency: e.currency, items: ga4Items(e, feedCountry) },
    ]);
  const label =
    e.kind === 'add_to_cart'
      ? tag.addToCart
      : e.kind === 'begin_checkout'
        ? tag.beginCheckout
        : undefined;
  if (label)
    calls.push([
      'conversion',
      { send_to: `${tag.id}/${label}`, value: e.value, currency: e.currency },
    ]);
  return calls;
}

/**
 * `gtag('config', id, params)` for a Google Ads tag. Page views are sent per navigation by the ad
 * chunk (`send_page_view: false`); remarketing off also turns off ad personalization signals.
 */
export function googleAdsConfig(tag: GoogleAdsTag): Record<string, unknown> {
  return tag.remarketing === false
    ? { send_page_view: false, allow_ad_personalization_signals: false }
    : { send_page_view: false };
}

/** GA4 events' `send_to` when Google Ads shares gtag: only the GA4 tags (else none = all). */
export function ga4SendTo(ga4Ids: readonly string[], hasAds: boolean): { send_to?: string[] } {
  return hasAds && ga4Ids.length ? { send_to: [...ga4Ids] } : {};
}

/**
 * Consent Mode v2 defaults from Shopify's Customer Privacy API state, sent once before the first
 * `config` (each tag starts only after its own consent; this tells gtag what else is allowed).
 */
export function googleConsentDefault(consent: { analytics: boolean; marketing: boolean }) {
  const ads = consent.marketing ? 'granted' : 'denied';
  return {
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  };
}

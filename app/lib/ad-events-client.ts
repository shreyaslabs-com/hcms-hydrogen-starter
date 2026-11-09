/**
 * Ad tags in the browser (T-2.66). Lazy chunk: `HcmsEmbeds` imports it only after an ad tag
 * (ga4/gtm/meta_pixel/tiktok_pixel/pinterest_tag/google_ads) passed targeting + consent, so pages
 * without such tags never download it. Here: the shared gtag.js loader for GA4 + Google Ads
 * (`./hcms/gtag.ts`), TikTok/Pinterest base code (GTM/Meta start in `HcmsEmbedScripts`), and ecommerce events from the analytics bus — mapping is pure
 * (`./hcms/ad-events.ts`); we check each tag's consent + page targeting at send time and call the
 * vendor globals (stubs queue until the vendor script loads). Nothing from `./hcms/embeds` is
 * imported (only types), so no shared chunk is split off the root bundle.
 */
import {
  CHECKOUT_STARTED,
  COMMERCE_BUS_EVENTS,
  commerceEvent,
  createDeduper,
  dataLayerEvent,
  eventId,
  ga4SendTo,
  googleAdsConfig,
  googleAdsEvents,
  gtagEvent,
  metaEvent,
  pinterestEvent,
  tiktokEvent,
  type CommerceEvent,
} from './hcms/ad-events';
import type { ClientEmbed } from './hcms/embeds';
import { startGoogleTag } from './hcms/gtag';

type Call = (...args: unknown[]) => void;
type Win = Window & {
  dataLayer?: unknown[];
  gtag?: Call;
  fbq?: Call;
  ttq?: unknown[] & Record<string, unknown>;
  TiktokAnalyticsObject?: string;
  pintrk?: Call & { queue?: unknown[]; version?: string };
};

export type AdEventsContext = {
  /** Consent + page targeting allow this tag right now. */
  allowed: (tag: ClientEmbed) => boolean;
  /** Shopify Customer Privacy API state now (Google Consent Mode v2 defaults). */
  consent: () => { analytics: boolean; marketing: boolean };
  country: string;
  currency: string;
};

const tags = new Map<string, ClientEmbed>();
const dedupe = createDeduper();
let page = { path: '', id: '' };
let started = false;

/** One id per page view (client navigations included); views dedup within it. */
function pageView(): string {
  const path = window.location.pathname;
  if (page.path !== path)
    page = { path, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` };
  return page.id;
}

const pagesSent = new Map<string, string>();

/**
 * TikTok/Pinterest page views from the bus `page_viewed` (published per navigation; replayed for
 * the first page): one call per vendor and path reaches every pixel of that vendor.
 */
function sendPageView(ctx: AdEventsContext) {
  const path = window.location.pathname;
  const w = window as Win;
  for (const tag of tags.values()) {
    const key = tag.type === 'google_ads' ? tag.value : tag.type;
    if (pagesSent.get(key) === path || !ctx.allowed(tag)) continue;
    if (tag.type === 'tiktok_pixel') (w.ttq?.page as Call | undefined)?.();
    else if (tag.type === 'pinterest_tag') w.pintrk?.('page');
    // Google Ads remarketing page view (config has send_page_view: false; SPA navigations too).
    else if (tag.type === 'google_ads' && tag.ads?.remarketing !== false)
      w.gtag?.('event', 'page_view', { send_to: tag.value });
    else continue;
    pagesSent.set(key, path);
  }
}

function send(e: CommerceEvent, ctx: AdEventsContext) {
  const view = pageView();
  if (!dedupe(e, view)) return;
  const id = eventId(e, view);
  const w = window as Win;
  // A vendor call reaches every pixel of that vendor on the page (all gtag G-/AW- targets, all
  // fbq inits…): send once per vendor.
  const sent = new Set<string>();
  const allowedTags = [...tags.values()].filter((t) => ctx.allowed(t));
  const hasAds = allowedTags.some((t) => t.type === 'google_ads');
  const ga4Ids = allowedTags.filter((t) => t.type === 'ga4').map((t) => t.value);
  for (const tag of tags.values()) {
    if (!ctx.allowed(tag)) continue;
    if (e.kind === 'begin_checkout' && tag.checkoutEvent === false) continue;
    const feedCountry = tag.feedCountry ?? ctx.country;
    // Each Google Ads tag is its own destination (send_to); other vendors once per page.
    const key = tag.type === 'google_ads' ? tag.value : tag.type;
    if (sent.has(key)) continue;
    sent.add(key);
    switch (tag.type) {
      case 'ga4': {
        const [name, params] = gtagEvent(e, feedCountry);
        // begin_checkout leaves the page right away: beacon transport survives the unload.
        w.gtag?.('event', name, {
          ...params,
          ...ga4SendTo(ga4Ids, hasAds),
          ...(e.kind === 'begin_checkout' ? { transport_type: 'beacon' } : {}),
        });
        break;
      }
      case 'google_ads': {
        for (const [name, params] of googleAdsEvents(e, { id: tag.value, ...tag.ads }, feedCountry))
          w.gtag?.(
            'event',
            name,
            e.kind === 'begin_checkout' ? { ...params, transport_type: 'beacon' } : params,
          );
        break;
      }
      case 'gtm': {
        const dataLayer = (w.dataLayer = w.dataLayer ?? []);
        dataLayer.push({ ecommerce: null });
        dataLayer.push({ ...dataLayerEvent(e, feedCountry), event_id: id });
        break;
      }
      case 'meta_pixel': {
        const call = metaEvent(e, id);
        if (call) w.fbq?.('track', ...call);
        break;
      }
      case 'tiktok_pixel': {
        const call = tiktokEvent(e, id);
        if (call) (w.ttq?.track as Call | undefined)?.(...call);
        break;
      }
      case 'pinterest_tag': {
        const call = pinterestEvent(e, id);
        if (call) w.pintrk?.('track', ...call);
        break;
      }
      default:
        break;
    }
  }
}

function addScript(src: string, id: string) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  script.dataset.hcmsEmbed = id;
  document.head.appendChild(script);
}

/**
 * TikTok's base code (stub queues calls until events.js loads; `_i`/`_t`/`_o` are what events.js
 * reads), trimmed to the methods we call. Script: analytics.tiktok.com/i18n/pixel/events.js
 * ?sdkid=<code>&lib=ttq (TikTok Events Manager base code; verify on vendor changes).
 */
function startTikTok(w: Win, code: string) {
  if (!w.ttq) {
    const ttq = [] as unknown as NonNullable<Win['ttq']>;
    for (const m of [
      'page',
      'track',
      'identify',
      'instances',
      'debug',
      'on',
      'off',
      'once',
      'ready',
      // Cookie consent API (T-2.105): queued until the pixel loads.
      'holdConsent',
      'revokeConsent',
      'grantConsent',
    ])
      ttq[m] = (...args: unknown[]) => void ttq.push([m, ...args]);
    w.TiktokAnalyticsObject = 'ttq';
    w.ttq = ttq;
  }
  const ttq = w.ttq;
  const url = 'https://analytics.tiktok.com/i18n/pixel/events.js';
  ttq._i = { ...(ttq._i as object), [code]: Object.assign([], { _u: url }) };
  ttq._t = { ...(ttq._t as object), [code]: Date.now() };
  ttq._o = { ...(ttq._o as object), [code]: {} };
  addScript(`${url}?sdkid=${encodeURIComponent(code)}&lib=ttq`, code);
}

/** Pinterest base code (help.pinterest.com/en/business/article/add-event-codes). */
function startPinterest(w: Win, tagId: string, id: string) {
  if (!w.pintrk) {
    const queue: unknown[] = [];
    w.pintrk = Object.assign((...args: unknown[]) => void queue.push(args), {
      queue,
      version: '3.0',
    });
    addScript('https://s.pinimg.com/ct/core.js', id);
  }
  w.pintrk('load', tagId);
}

type Bus = {
  addDestination?: (destination: {
    name: string;
    setup: (api: {
      subscribe: (event: never, handler: (payload: unknown) => void) => unknown;
    }) => unknown;
  }) => unknown;
};

/**
 * Our own Shopify bus destination, registered once per page: the bus replays up to 500 retained
 * events to a new destination (shopify.dev/docs/storefronts/hydrogen/analytics, "Add analytics
 * destinations"), so view events published before this lazy chunk arrived still count, and it
 * delivers only when consent allows analytics. Checkout clicks come as a window event.
 */
function subscribe(ctx: AdEventsContext, tries = 20) {
  const bus = (window as { Shopify?: { analytics?: Bus } }).Shopify?.analytics;
  const handle = (event: string) => (payload: unknown) => {
    const e = commerceEvent(event, payload, ctx.currency);
    if (e) send(e, ctx);
  };
  if (!bus?.addDestination) {
    // ShopifyScripts creates the bus after hydration; retry briefly.
    if (tries > 0) setTimeout(() => subscribe(ctx, tries - 1), 250);
    return;
  }
  bus.addDestination({
    name: 'hcms-ad-tags',
    setup: ({ subscribe: on }) => {
      for (const event of COMMERCE_BUS_EVENTS)
        if (event !== 'checkout_started') on(event as never, handle(event));
      on('page_viewed' as never, () => sendPageView(ctx));
    },
  });
  window.addEventListener(CHECKOUT_STARTED, (event) =>
    handle('checkout_started')((event as CustomEvent).detail),
  );
}

/**
 * Starts one ad tag (TikTok/Pinterest base code) and its events (the first call subscribes).
 */
export function startAdTag(embed: ClientEmbed, ctx: AdEventsContext) {
  const w = window as Win;
  // GA4 + Google Ads share ONE gtag.js (Consent Mode v2 defaults first).
  if (embed.type === 'ga4' || embed.type === 'google_ads')
    startGoogleTag(
      w,
      embed.value,
      embed.type === 'google_ads' ? googleAdsConfig({ id: embed.value, ...embed.ads }) : undefined,
      ctx.consent(),
      (src) => addScript(src, embed.id),
    );
  if (embed.type === 'tiktok_pixel') startTikTok(w, embed.value);
  if (embed.type === 'pinterest_tag') startPinterest(w, embed.value, embed.id);
  tags.set(embed.id, embed);
  if (started) return;
  started = true;
  subscribe(ctx);
}

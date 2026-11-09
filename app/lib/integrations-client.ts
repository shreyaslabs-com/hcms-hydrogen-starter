/**
 * App integrations in the browser (T-2.8). Lazy chunk: `HcmsEmbeds` imports it only when an
 * integration embed passes targeting + consent, so pages without vendors never download it.
 * Vendor scripts are injected from here (no inline scripts; hosts are in the CSP via
 * `embedCspSources`). URLs and hosts live in `lib/hcms/integrations.ts`.
 *
 * Client-side navigations: vendor blocks fire `hcms:app-widgets` when they mount; we re-run the
 * vendor's widget scan (debounced) once its script is in.
 */
import type { HcmsAnalytics } from '@hcms/hydrogen';
import { sanitizeReviewsHtml } from '@hcms/sections';

import {
  JUDGEME_CDN_HOST,
  JUDGEME_CACHE_HOST,
  JUDGEME_UNAVAILABLE_META,
  judgemeCacheUrl,
  parseJudgemeResponse,
  type JudgemeTargets,
} from './hcms/judgeme';
import {
  klaviyoAddedToCart,
  klaviyoViewedProduct,
  okendoSettingsUrl,
  vendorScripts,
  type Vendor,
} from './hcms/integrations';

/** Same name as `@hcms/sections` `APP_WIDGETS_EVENT` (not imported: keeps sections out of this chunk). */
const APP_WIDGETS_EVENT = 'hcms:app-widgets';

type Win = Window & {
  jdgm?: Record<string, unknown> & {
    initializeWidgets?: () => void;
    customizeBadges?: () => void;
    initializeCarousel?: () => void;
  };
  jdgmSettings?: Record<string, unknown>;
  _learnq?: unknown[];
  yotpoWidgetsContainer?: { initWidgets?: () => void };
  okeWidgetApi?: { initAllWidgets?: () => void };
};

const started = new Set<Vendor>();
const timers = new Map<Vendor, ReturnType<typeof setTimeout>>();
let listening = false;

function addScript(src: string, vendor: Vendor) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  script.dataset.hcmsIntegration = vendor;
  document.head.appendChild(script);
}

function addMeta(name: string, content: string) {
  if (document.head.querySelector(`meta[name="${name}"]`)) return;
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

/** Re-scan for containers added after the script loaded (verify each vendor API). */
function refresh(vendor: Vendor) {
  const w = window as Win;
  switch (vendor) {
    case 'judgeme':
      void refreshJudgeme();
      break;
    case 'yotpo':
      w.yotpoWidgetsContainer?.initWidgets?.();
      break;
    case 'okendo':
      w.okeWidgetApi?.initAllWidgets?.();
      break;
    // Klaviyo embedded forms and Rebuy widgets have no documented re-scan call (verify).
    default:
      break;
  }
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener(APP_WIDGETS_EVENT, (event) => {
    const vendor = (event as CustomEvent<{ vendor?: Vendor }>).detail?.vendor;
    if (!vendor || !started.has(vendor)) return;
    clearTimeout(timers.get(vendor));
    timers.set(
      vendor,
      setTimeout(() => refresh(vendor), 300),
    );
  });
}

// --- Judge.me (T-2.103) ---------------------------------------------------------------------
//
// Widgets arrive server-rendered (sanitized, `data-hcms-ssr="judgeme"`). Here we do what Judge.me's
// `widget_preloader.js` does on its first request, minus refilling server-rendered widgets and
// minus `eval` (blocked by our CSP): run the settings script (nonce'd), add the settings styles,
// then Judge.me's core (`loader.js` for widget v3, else `judgeme_widget_v2.js`), which wires up
// writing a review, photos, pagination and the carousel on the existing markup. Containers that
// came without HTML (Judge.me slow/down at render time) are filled from the same request.

let judgeme: { shop: string; token: string } | null = null;

const SSR = '[data-hcms-ssr="judgeme"]';

/** Empty Judge.me containers on the page (no server HTML, nothing filled yet). */
function emptyJudgeme(): { targets: JudgemeTargets; nodes: Map<string, Element[]> } {
  const nodes = new Map<string, Element[]>();
  const add = (key: string, el: Element) => nodes.set(key, [...(nodes.get(key) ?? []), el]);
  const empty = (selector: string) =>
    Array.from(document.querySelectorAll(selector)).filter(
      (el) => !el.matches(SSR) && !el.hasAttribute('data-hcms-filled') && !el.textContent?.trim(),
    );
  const ids = (selector: string, kind: string) =>
    empty(selector).flatMap((el) => {
      const id = el.getAttribute('data-id') ?? '';
      if (!/^\d{1,20}$/.test(id)) return [];
      add(`judgeme:${kind}:${id}`, el);
      return [id];
    });
  const reviews = [...new Set(ids('.jdgm-review-widget', 'reviews'))];
  const stars = [...new Set(ids('.jdgm-preview-badge', 'stars'))];
  const carousel = empty('.jdgm-carousel-wrapper');
  carousel.forEach((el) => add('judgeme:carousel', el));
  const all = empty('.jdgm-all-reviews-widget');
  all.forEach((el) => add('judgeme:all_reviews', el));
  return {
    targets: { reviews, stars, carousel: carousel.length > 0, allReviews: all.length > 0 },
    nodes,
  };
}

// S2-3: a shop that isn't on Judge.me gets a 404 from the cache server, which the browser logs on
// every page. Skip the request when the server already saw that (page meta) or this tab did.
const unavailableKey = (shop: string) => `hcms:judgeme-unavailable:${shop}`;

function judgemeUnavailable(shop: string): boolean {
  if (document.querySelector(`meta[name="${JUDGEME_UNAVAILABLE_META}"]`)) {
    rememberJudgemeUnavailable(shop);
    return true;
  }
  try {
    return sessionStorage.getItem(unavailableKey(shop)) === '1';
  } catch {
    return false;
  }
}

function rememberJudgemeUnavailable(shop: string) {
  try {
    sessionStorage.setItem(unavailableKey(shop), '1');
  } catch {
    // storage blocked: the page meta still applies
  }
}

/** One cache-server request: fills empty containers (sanitized) and returns the raw answer. */
async function fetchJudgeme(): Promise<Record<string, unknown> | null> {
  if (!judgeme || judgemeUnavailable(judgeme.shop)) return null;
  const { targets, nodes } = emptyJudgeme();
  try {
    const response = await fetch(judgemeCacheUrl(judgeme.shop, judgeme.token, targets), {
      mode: 'cors',
    });
    if (response.status === 404) rememberJudgemeUnavailable(judgeme.shop);
    const json = response.ok ? ((await response.json()) as Record<string, unknown>) : null;
    const widgets = json ? parseJudgemeResponse(json, targets, sanitizeReviewsHtml) : null;
    for (const [key, elements] of nodes) {
      const html = widgets?.html[key];
      if (!html) continue;
      for (const el of elements) {
        el.innerHTML = html;
        el.setAttribute('data-hcms-filled', '');
      }
    }
    return json;
  } catch {
    return null; // server-rendered widgets stay as they are
  }
}

/** Judge.me's settings HTML: settings script (nonce'd, not eval), styles, script tags. */
function applyJudgemeSettings(settings: unknown, miracle: unknown) {
  const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? '';
  for (const chunk of [settings, miracle]) {
    if (typeof chunk !== 'string') continue;
    const template = document.createElement('template');
    template.innerHTML = chunk; // inert: scripts in a template never run
    for (const el of Array.from(template.content.children)) {
      if (el instanceof HTMLScriptElement) {
        if (chunk === miracle) continue;
        const script = document.createElement('script');
        if (el.src) {
          if (!el.src.startsWith(JUDGEME_CDN_HOST) && !el.src.startsWith('https://cdn.judge.me/'))
            continue;
          script.src = el.src;
        } else {
          script.textContent = el.textContent;
          script.nonce = nonce;
        }
        if (el.id) script.id = el.id;
        script.dataset.hcmsIntegration = 'judgeme';
        document.head.appendChild(script);
      } else if (el.tagName === 'STYLE') {
        document.head.appendChild(el.cloneNode(true));
      }
    }
  }
}

async function startJudgeme(config: Record<string, string>) {
  const w = window as Win;
  judgeme = { shop: config.shopDomain ?? '', token: config.publicToken ?? '' };
  // Judge.me's documented globals (same values its preloader sets).
  w.jdgm = Object.assign(w.jdgm ?? {}, {
    SHOP_DOMAIN: judgeme.shop,
    PLATFORM: 'shopify',
    PUBLIC_TOKEN: judgeme.token,
    CACHE_SERVER_HOST: JUDGEME_CACHE_HOST,
    HTTPS_HOST: 'https://judge.me',
    CDN_HOST: JUDGEME_CDN_HOST,
    API_HOST: 'https://api.judge.me',
  });
  const json = await fetchJudgeme();
  if (!json) return;
  applyJudgemeSettings(json.settings, json.html_miracle);
  if (!w.jdgmSettings) return; // settings script blocked or missing: keep the static widgets
  w.jdgmSettings.widget_advanced_speed_features ??= 5;
  const v3 = Number.parseFloat(String(w.jdgmSettings.widget_version ?? '')) >= 3;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = `${JUDGEME_CDN_HOST}${v3 ? 'widget_v3/base.css' : 'judgeme_widget_v2.css'}`;
  document.head.appendChild(css);
  addScript(`${JUDGEME_CDN_HOST}${v3 ? 'loader.js' : 'judgeme_widget_v2.js'}`, 'judgeme');
}

/** After a client-side navigation: fill new empty containers, then let Judge.me set them up. */
async function refreshJudgeme() {
  const { targets } = emptyJudgeme();
  if (targets.reviews.length || targets.stars.length || targets.carousel || targets.allReviews)
    await fetchJudgeme();
  const jdgm = (window as Win).jdgm;
  jdgm?.initializeWidgets?.();
  jdgm?.customizeBadges?.();
  if (document.querySelector('.jdgm-carousel-wrapper')) jdgm?.initializeCarousel?.();
}

/** Klaviyo: forward viewed product / added to cart from the HCMS analytics bus. */
function forwardKlaviyoEvents(analytics: HcmsAnalytics) {
  const learnq = ((window as Win)._learnq = (window as Win)._learnq ?? []);
  analytics.subscribe('product_viewed', (payload) => {
    for (const [name, props] of klaviyoViewedProduct(payload, window.location.href))
      learnq.push(name === 'trackViewedItem' ? [name, props] : ['track', name, props]);
  });
  analytics.subscribe('product_added_to_cart', (payload) => {
    const props = klaviyoAddedToCart(payload, window.location.origin);
    if (props) learnq.push(['track', 'Added to Cart', props]);
  });
}

async function startOkendo(subscriberId: string) {
  addMeta('oke:subscriber_id', subscriberId);
  if (!document.getElementById('oke-reviews-settings')) {
    try {
      const res = await fetch(okendoSettingsUrl(subscriberId), { mode: 'cors' });
      const settings = res.ok ? ((await res.json()) as Record<string, unknown>) : null;
      if (settings) {
        // JSON data block (never executed), read by okendo-reviews.js.
        const data = document.createElement('script');
        data.type = 'application/json';
        data.id = 'oke-reviews-settings';
        data.textContent = JSON.stringify(settings).replace(/</g, '\\u003c');
        document.head.appendChild(data);
        const css = [settings.cssVariables, settings.customCss].filter(
          (v): v is string => typeof v === 'string',
        );
        if (css.length) {
          const style = document.createElement('style');
          style.dataset.hcmsIntegration = 'okendo';
          style.textContent = css.join('\n');
          document.head.appendChild(style);
        }
      }
    } catch {
      // settings unavailable: the widget falls back to its defaults (verify)
    }
  }
}

/**
 * Starts one vendor (once per page load). `config` was validated on the server; `analytics` is
 * passed in (not imported) so the bus stays in the root chunk.
 */
export async function startIntegration(
  vendor: Vendor,
  config: Record<string, string>,
  analytics: HcmsAnalytics,
) {
  if (started.has(vendor)) return;
  started.add(vendor);
  listen();
  switch (vendor) {
    case 'judgeme':
      await startJudgeme(config);
      return;
    case 'klaviyo':
      forwardKlaviyoEvents(analytics);
      break;
    case 'okendo':
      await startOkendo(config.subscriberId ?? '');
      break;
    default:
      break;
  }
  for (const src of vendorScripts(vendor, config)) addScript(src, vendor);
}

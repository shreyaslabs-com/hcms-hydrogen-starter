/**
 * Embeds Manager (T-2.9) + app integrations (T-2.8): script-type tags (ga4/gtm/pixels/script and
 * vendor integrations). Tags are injected only after hydration and consent, from bundled code (no
 * inline scripts, so the CSP nonce stays strict); their hosts are in the CSP header. A tag that
 * already ran can't be unloaded if consent is later withdrawn: ad/measurement tags get the
 * vendor's revoke call instead (`lib/hcms/consent-revoke.ts`, T-2.105) and the next full page load
 * doesn't start them. Its own chunk, loaded after hydration only on pages with embeds (the root
 * renders it through `Deferred`), since it renders nothing (JS budget).
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useConsent } from '@hcms/hydrogen';

import { hcmsAnalytics } from '~/lib/analytics';
import { syncVendorConsent } from '~/lib/hcms/consent-revoke';
import { AD_EMBED_TYPES, consentAllows, embedTargets } from '~/lib/hcms/embed-targeting';
import type { ClientEmbed } from '~/lib/hcms/embeds';

type Win = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string };
  _fbq?: unknown;
};

type Market = { country: string; currency: string };

const loaded = new Set<string>();
const pageViews = new Map<string, string>();
/** Last consent sent to each started ad tag's vendor (T-2.105). */
const vendorConsent = new Map<string, boolean>();

function addScript(src: string, id: string) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  script.dataset.hcmsEmbed = id;
  document.head.appendChild(script);
}

/** Runs one tag (once per page load). */
function start(embed: ClientEmbed) {
  if (loaded.has(embed.id)) return;
  loaded.add(embed.id);
  const w = window as Win;
  if (embed.config) {
    // App integrations (T-2.8): vendor code is a lazy chunk, fetched only now.
    const { type, config } = embed;
    void import('~/lib/integrations-client')
      .then((m) =>
        m.startIntegration(type as Parameters<typeof m.startIntegration>[0], config, hcmsAnalytics),
      )
      .catch((error: unknown) => console.error('[hcms] integration failed to start', error));
    return;
  }
  switch (embed.type) {
    case 'script':
      addScript(embed.value, embed.id);
      break;
    // ga4 / google_ads: the shared gtag.js loader lives in the lazy ad chunk.
    case 'gtm':
      w.dataLayer = w.dataLayer ?? [];
      w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      addScript(
        `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(embed.value)}`,
        embed.id,
      );
      break;
    case 'meta_pixel': {
      if (!w.fbq) {
        // Meta's standard stub: queue calls until fbevents.js installs `callMethod`.
        type Fbq = NonNullable<Win['fbq']> & { callMethod?: (...args: unknown[]) => void };
        const queue: unknown[] = [];
        const fbq: Fbq = Object.assign(
          (...args: unknown[]) => {
            if (fbq.callMethod) fbq.callMethod(...args);
            else queue.push(args);
          },
          { queue, loaded: true, version: '2.0' },
        );
        (fbq as Fbq & { push: Fbq }).push = fbq;
        w.fbq = fbq;
        w._fbq = fbq;
        addScript('https://connect.facebook.net/en_US/fbevents.js', embed.id);
      }
      w.fbq('init', embed.value);
      break;
    }
    // tiktok_pixel / pinterest_tag: base code + page views live in the lazy ad chunk.
    default:
      break;
  }
}

/**
 * Meta page view on load and per client navigation (GA4/GTM track history changes themselves;
 * TikTok/Pinterest page views come from the ad chunk). `fbq` reaches every Meta pixel on the
 * page, so it runs once per path.
 */
const metaPageView = (w: Win) => w.fbq?.('track', 'PageView');

/** Ecommerce events (T-2.66): lazy chunk, loaded once the first ad tag runs. */
function startAdTag(
  embed: ClientEmbed,
  allowed: (tag: ClientEmbed) => boolean,
  consent: () => { analytics: boolean; marketing: boolean },
  market: Market,
) {
  void import('~/lib/ad-events-client')
    .then((m) => m.startAdTag(embed, { allowed, consent, ...market }))
    .catch((error: unknown) => console.error('[hcms] ad tag failed to start', error));
}

/** Consent + targeting for a tag right now (read at send time by the ad chunk). */
const allowedNow =
  (consent: { current: Parameters<typeof consentAllows>[1] }) => (tag: ClientEmbed) =>
    consentAllows(tag.consent, consent.current) && embedTargets(tag, window.location.pathname);

/** Script-type embeds (ga4/gtm/pixels/script): rendered once in the root layout. */
export function HcmsEmbedScripts({
  embeds,
  country,
  currency,
}: {
  embeds: ClientEmbed[];
  country: string;
  currency: string;
}) {
  const consent = useConsent();
  const { pathname } = useLocation();
  // Read at send time, so withdrawn consent stops ecommerce events right away.
  const consentRef = useRef(consent);
  consentRef.current = consent;
  useEffect(() => {
    // Withdrawn (or restored) consent for tags that already ran → vendor consent APIs.
    syncVendorConsent(
      window as Win,
      embeds.filter((e) => loaded.has(e.id) && AD_EMBED_TYPES.includes(e.type)),
      (e) => consentAllows(e.consent, consent),
      consent,
      vendorConsent,
    );
    for (const embed of embeds) {
      // Inbox is loaded by ShopifyScripts (`inbox`), see HcmsInbox.
      if (embed.type === 'html' || embed.type === 'shopify_inbox') continue;
      if (!embedTargets(embed, pathname) || !consentAllows(embed.consent, consent)) continue;
      const first = !loaded.has(embed.id);
      start(embed);
      if (first && AD_EMBED_TYPES.includes(embed.type))
        startAdTag(embed, allowedNow(consentRef), () => consentRef.current, {
          country,
          currency,
        });
      // Client navigations: Meta needs an explicit PageView (once per path).
      if (embed.type === 'meta_pixel' && pageViews.get(embed.type) !== pathname) {
        pageViews.set(embed.type, pathname);
        metaPageView(window as Win);
      }
    }
  }, [embeds, pathname, consent, country, currency]);
  return null;
}

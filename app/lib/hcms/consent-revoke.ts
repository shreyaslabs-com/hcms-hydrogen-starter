/**
 * Consent withdrawn after a tag already ran (T-2.105). A loaded vendor script can't be unloaded,
 * so tell each vendor through its own consent API to stop storing/sending:
 *   - Google (ga4, gtm): `gtag('consent', 'update', {…: 'denied'})` (Consent Mode v2; for GTM the
 *     same command is pushed to `dataLayer`, which is all `gtag()` does);
 *   - Meta: `fbq('consent', 'revoke')` / `'grant'`;
 *   - TikTok: `ttq.revokeConsent()` / `ttq.grantConsent()` (cookie consent API; the stub queues them);
 *   - Pinterest: no revoke API — the ad chunk stops sending page views/events (`allowed` is read at
 *     send time) and the next full page load doesn't start the tag.
 * Pure (no `~/` imports) so it's unit-tested with fake globals.
 */
import type { ClientEmbed, ConsentState } from './embeds.ts';

type Call = (...args: unknown[]) => void;
export type ConsentWin = {
  dataLayer?: unknown[];
  gtag?: Call;
  fbq?: Call;
  ttq?: { revokeConsent?: Call; grantConsent?: Call };
};

const GOOGLE_DENIED = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
} as const;

function gtag(w: ConsentWin): Call {
  if (w.gtag) return w.gtag;
  const dataLayer = (w.dataLayer = w.dataLayer ?? []);
  return function gtagShim() {
    // gtag.js / GTM expect the `arguments` object itself.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
}

/** Sends the vendor's consent update for a started tag: `granted` false = revoke. */
export function updateVendorConsent(
  w: ConsentWin,
  type: ClientEmbed['type'],
  granted: boolean,
  consent: ConsentState,
): void {
  switch (type) {
    case 'ga4':
    case 'gtm':
      gtag(w)(
        'consent',
        'update',
        granted
          ? {
              analytics_storage: consent.analytics ? 'granted' : 'denied',
              ad_storage: consent.marketing ? 'granted' : 'denied',
              ad_user_data: consent.marketing ? 'granted' : 'denied',
              ad_personalization: consent.marketing ? 'granted' : 'denied',
            }
          : GOOGLE_DENIED,
      );
      break;
    case 'google_ads':
      // Ads only touches ad_* (GA4 keeps its own analytics_storage state).
      gtag(w)(
        'consent',
        'update',
        granted
          ? {
              analytics_storage: consent.analytics ? 'granted' : 'denied',
              ad_storage: consent.marketing ? 'granted' : 'denied',
              ad_user_data: consent.marketing ? 'granted' : 'denied',
              ad_personalization: consent.marketing ? 'granted' : 'denied',
            }
          : { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
      );
      break;
    case 'meta_pixel':
      w.fbq?.('consent', granted ? 'grant' : 'revoke');
      break;
    case 'tiktok_pixel':
      if (granted) w.ttq?.grantConsent?.();
      else w.ttq?.revokeConsent?.();
      break;
    // pinterest_tag: no consent API (see above); others aren't ad tags.
    default:
      break;
  }
}

/**
 * Per started tag, sends a vendor update when its consent flips (`state` = last sent value per
 * embed id; a tag that just started counts as granted). Never throws.
 */
export function syncVendorConsent(
  w: ConsentWin,
  started: readonly ClientEmbed[],
  allows: (embed: ClientEmbed) => boolean,
  consent: ConsentState,
  state: Map<string, boolean>,
): void {
  for (const embed of started) {
    const granted = allows(embed);
    if ((state.get(embed.id) ?? true) === granted) continue;
    state.set(embed.id, granted);
    try {
      updateVendorConsent(w, embed.type, granted, consent);
    } catch {
      // A vendor stub that misbehaves must not break the page.
    }
  }
}

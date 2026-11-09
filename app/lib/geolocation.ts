/**
 * Geolocation market suggestion (T-2.45, like Shopify's Geolocation app): when the shopper's
 * country (Oxygen `oxygen-buyer-country`) differs from the market they're browsing and the
 * merchant sells there, suggest that market's subfolder. Decided on the server (HTML is never
 * full-page cached, D-19), so the banner never shifts layout after load. Opt-in per theme:
 * `settings.markets.geolocation_banner`. Pure module so `node:test` can load it.
 */
import { prefixForCountry, stripLocalePrefix, type Localization, type Market } from './markets.ts';

export const GEO_DISMISS_COOKIE = 'hcms_geo';
/** Seconds the "stay here" choice is remembered. */
export const GEO_DISMISS_MAX_AGE = 60 * 60 * 24 * 30;

export type MarketSuggestion = {
  countryName: string;
  currency: string;
  /** Same page in the suggested market: `/fr-ca/products/x` (or unprefixed for primary). */
  href: string;
};

export function geolocationEnabled(settings: unknown): boolean {
  const markets = (settings as { markets?: { geolocation_banner?: unknown } } | null)?.markets;
  return markets?.geolocation_banner === true;
}

function dismissed(cookieHeader: string | null): boolean {
  return (cookieHeader ?? '')
    .split(';')
    .some((part) => part.trim() === `${GEO_DISMISS_COOKIE}=dismissed`);
}

/** The buyer-country header Oxygen sets (Cloudflare's as a fallback for other hosts). */
export function buyerCountry(headers: Headers): string | null {
  const raw = headers.get('oxygen-buyer-country') ?? headers.get('cf-ipcountry');
  return raw && /^[A-Z]{2}$/i.test(raw) ? raw.toUpperCase() : null;
}

export function marketSuggestion({
  request,
  market,
  localization,
}: {
  request: Request;
  market: Market;
  localization: Localization;
}): MarketSuggestion | null {
  const country = buyerCountry(request.headers);
  if (!country || country === market.country) return null;
  if (dismissed(request.headers.get('Cookie'))) return null;
  const target = localization.availableCountries.find((c) => c.isoCode === country);
  if (!target) return null;
  const url = new URL(request.url);
  const path = stripLocalePrefix(url.pathname);
  const prefix = prefixForCountry(localization, country, market.language);
  return {
    countryName: target.name,
    currency: target.currency.isoCode,
    href: `${prefix}${path === '/' && prefix ? '' : path}${url.search}`,
  };
}

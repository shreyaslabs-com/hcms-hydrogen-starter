/**
 * Shopify Markets, data-driven (T-1.1.4): available countries/languages come from the merchant's
 * Markets setup via Storefront `localization`, never from code. URLs use Online Store-style
 * subfolders: `/{language}-{country}` (e.g. `/fr-ca`); unprefixed URLs are the primary market.
 * Pure module (no `~/` imports) so `node:test` can load it.
 */
import type { I18nConfig } from '@shopify/hydrogen';

export type CountryCode = I18nConfig['country'];
export type LanguageCode = I18nConfig['language'];

export type Market = {
  country: CountryCode;
  language: LanguageCode;
  /** `""` for the primary market, otherwise `/fr-ca`. */
  pathPrefix: string;
};

export type LocalizationCountry = {
  isoCode: string;
  name: string;
  currency: { isoCode: string; symbol: string };
  availableLanguages: { isoCode: string; endonymName: string }[];
};

export type Localization = {
  /** Primary market (unprefixed URLs). */
  country: { isoCode: string };
  language: { isoCode: string };
  availableCountries: LocalizationCountry[];
};

const PREFIX = /^([a-z]{2,3})-([a-z]{2})$/i;

/** `fr-ca` → `{ language: 'FR', country: 'CA' }`; anything else → null. */
export function parseLocaleSegment(
  segment: string | undefined,
): { language: string; country: string } | null {
  const match = segment?.match(PREFIX);
  if (!match?.[1] || !match[2]) return null;
  return { language: match[1].toUpperCase(), country: match[2].toUpperCase() };
}

export function primaryMarket(localization: Localization): Market {
  return {
    country: localization.country.isoCode as CountryCode,
    language: localization.language.isoCode as LanguageCode,
    pathPrefix: '',
  };
}

export function marketPrefix(country: string, language: string): string {
  return `/${language.toLowerCase()}-${country.toLowerCase()}`;
}

/** True when `country` sells in `language` according to Shopify Markets. */
export function isAvailable(
  localization: Localization,
  country: string,
  language: string,
): boolean {
  const entry = localization.availableCountries.find((c) => c.isoCode === country);
  return Boolean(entry?.availableLanguages.some((l) => l.isoCode === language));
}

export type MarketResolution =
  | { market: Market; valid: true }
  /** The first path segment looks like a locale but the store doesn't sell there. */
  | { market: Market; valid: false };

/**
 * Market for a request path. The primary market's own prefix (e.g. `/en-us` when US/EN is
 * primary) is accepted but canonicalizes to unprefixed URLs via `canonicalPath`.
 */
export function resolveMarket(pathname: string, localization: Localization): MarketResolution {
  const primary = primaryMarket(localization);
  const parsed = parseLocaleSegment(pathname.split('/').filter(Boolean)[0]);
  if (!parsed) return { market: primary, valid: true };
  if (!isAvailable(localization, parsed.country, parsed.language)) {
    return { market: primary, valid: false };
  }
  return {
    market: {
      // Validated against the shop's own country/language codes above.
      country: parsed.country as CountryCode,
      language: parsed.language as LanguageCode,
      pathPrefix: marketPrefix(parsed.country, parsed.language),
    },
    valid: true,
  };
}

/**
 * Whether a page URL's `:locale?` segment is wrong: an unknown locale prefix, or a first segment
 * that matched `:locale?` but isn't a locale (`/junk-xyz` matches the home route). The page shell
 * 404s these, so the error renders inside the store layout (SF-6).
 */
export function isUnknownLocale(
  locale: string | undefined,
  resolution: { market: Pick<Market, 'pathPrefix'>; valid: boolean },
): boolean {
  if (!resolution.valid) return true;
  return locale !== undefined && `/${locale}` !== resolution.market.pathPrefix;
}

/** Removes a leading locale segment: `/fr-ca/products/x` → `/products/x`. */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/');
  if (parseLocaleSegment(segments[1])) {
    const rest = segments.slice(2).join('/');
    return `/${rest}`;
  }
  return pathname || '/';
}

/** Prefixes a root-relative app path; leaves API routes, absolute and non-root paths alone. */
export function localizePath(path: string, pathPrefix: string): string {
  if (!pathPrefix || !path.startsWith('/') || path.startsWith('//')) return path;
  if (path.startsWith('/api/') || path.startsWith('/account/')) return path;
  if (parseLocaleSegment(path.split('/')[1])) return path;
  return path === '/' ? pathPrefix : `${pathPrefix}${path}`;
}

/**
 * Prefix for a country in the switcher: keep the current language when that country supports
 * it, else the shop's primary language, else the country's first language. Primary → `""`.
 */
export function prefixForCountry(
  localization: Localization,
  countryIso: string,
  currentLanguage: string,
): string {
  const country = localization.availableCountries.find((c) => c.isoCode === countryIso);
  const languages = country?.availableLanguages.map((l) => l.isoCode) ?? [];
  const language =
    [currentLanguage, localization.language.isoCode].find((l) => languages.includes(l)) ??
    languages[0] ??
    localization.language.isoCode;
  const primary = primaryMarket(localization);
  if (countryIso === primary.country && language === primary.language) return '';
  return marketPrefix(countryIso, language);
}

/** Fallback when the localization query fails: matches the template's previous default. */
export const FALLBACK_LOCALIZATION: Localization = {
  country: { isoCode: 'US' },
  language: { isoCode: 'EN' },
  availableCountries: [
    {
      isoCode: 'US',
      name: 'United States',
      currency: { isoCode: 'USD', symbol: '$' },
      availableLanguages: [{ isoCode: 'EN', endonymName: 'English' }],
    },
  ],
};

/** Every market subfolder the shop sells in: `''` (primary) first, then `/{lang}-{country}`. */
export function allMarketPrefixes(localization: Localization): string[] {
  const primary = primaryMarket(localization);
  const prefixes = new Set<string>(['']);
  for (const country of localization.availableCountries) {
    for (const language of country.availableLanguages) {
      if (country.isoCode === primary.country && language.isoCode === primary.language) continue;
      prefixes.add(marketPrefix(country.isoCode, language.isoCode));
    }
  }
  return [...prefixes];
}

export type HreflangLink = { hreflang: string; href: string };

/** BCP 47 tag for a market: `FR` + `CA` → `fr-CA`; Shopify's `PT_BR` → `pt-BR`. */
export function hreflangTag(language: string, country: string): string {
  const [base = language] = language.toLowerCase().split(/[_-]/);
  return `${base}-${country.toUpperCase()}`;
}

/** Right-to-left scripts (ISO 15924) and languages written in one by default (T-2.92). */
const RTL_SCRIPTS = new Set([
  'adlm',
  'arab',
  'hebr',
  'mand',
  'nkoo',
  'rohg',
  'samr',
  'syrc',
  'thaa',
]);
const LTR_SCRIPTS = new Set(['latn', 'cyrl', 'grek', 'deva', 'hans', 'hant', 'jpan', 'kore']);
const RTL_LANGUAGES = new Set([
  'ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ks', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi',
]); // prettier-ignore

type TextInfoLocale = Intl.Locale & {
  getTextInfo?: () => { direction?: string };
  textInfo?: { direction?: string };
};

/**
 * Text direction for a market language (`<html dir>`, T-2.92). Accepts Shopify codes (`AR`,
 * `PT_BR`) and BCP 47 tags (`ku-Arab`). An explicit script decides; otherwise the runtime's
 * `Intl.Locale` text info when it has one (V8: `getTextInfo()`, older `textInfo`), else a small
 * list. Anything unparsable → `ltr`.
 */
export function textDirection(language: string): 'ltr' | 'rtl' {
  const tag = language.trim().replace(/_/g, '-');
  if (!tag) return 'ltr';
  const [base = '', ...rest] = tag.toLowerCase().split('-');
  const script = rest.find((part) => /^[a-z]{4}$/.test(part));
  if (script && RTL_SCRIPTS.has(script)) return 'rtl';
  if (script && LTR_SCRIPTS.has(script)) return 'ltr';
  try {
    const locale = new Intl.Locale(tag) as TextInfoLocale;
    const direction = (locale.getTextInfo?.() ?? locale.textInfo)?.direction;
    if (direction === 'rtl' || direction === 'ltr') return direction;
  } catch {
    // Not a valid tag: fall back to the list.
  }
  return RTL_LANGUAGES.has(base) ? 'rtl' : 'ltr';
}

/**
 * hreflang alternates for one page (T-2.7): every market subfolder the shop sells in
 * (`allMarketPrefixes` order; primary = unprefixed) plus `x-default` = the unprefixed URL.
 * `pathname` may carry any market prefix; it is stripped so every market points at the same
 * page. `search` is appended as given (pass only canonical params). Empty for one-market shops.
 */
export function hreflangAlternates(
  localization: Localization,
  origin: string,
  pathname: string,
  search = '',
): HreflangLink[] {
  const primary = primaryMarket(localization);
  const markets: { prefix: string; tag: string }[] = [
    { prefix: '', tag: hreflangTag(primary.language, primary.country) },
  ];
  const seen = new Set(['']);
  for (const country of localization.availableCountries) {
    for (const language of country.availableLanguages) {
      const prefix =
        country.isoCode === primary.country && language.isoCode === primary.language
          ? ''
          : marketPrefix(country.isoCode, language.isoCode);
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      markets.push({ prefix, tag: hreflangTag(language.isoCode, country.isoCode) });
    }
  }
  if (markets.length < 2) return [];
  const base = origin.replace(/\/+$/, '');
  const stripped = stripLocalePrefix(pathname);
  const path = stripped.length > 1 ? stripped.replace(/\/+$/, '') : '/';
  const url = (prefix: string) =>
    `${base}${path === '/' ? prefix || '/' : `${prefix}${path}`}${search}`;
  const links = markets.map(({ prefix, tag }) => ({ hreflang: tag, href: url(prefix) }));
  links.push({ hreflang: 'x-default', href: url('') });
  return links;
}

/** Sitemap form of `hreflangAlternates` (`hreflang → href`) for a root-relative app path. */
export function sitemapAlternates(
  localization: Localization,
  origin: string,
  path: string,
): Record<string, string> | undefined {
  const links = hreflangAlternates(localization, origin, path);
  return links.length ? Object.fromEntries(links.map((l) => [l.hreflang, l.href])) : undefined;
}

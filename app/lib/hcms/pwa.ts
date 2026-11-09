/**
 * Installable storefront (T-2.83): web app manifest from theme settings. Pure (node:test).
 * No service worker: installing adds a home-screen icon only; HTML is never cached offline.
 *
 * Theme `settings.pwa` (all optional): `enabled` (default off), `name`, `short_name`,
 * `theme_color`, `background_color` (hex), `icon` (`{ $file }` image, ideally square 512 px).
 * Fallbacks: shop name, colour scheme 1 (`background`), store logo, `/favicon.svg`.
 */
import { shopifyImageUrl } from '../image.ts';

export type PwaSettings = {
  enabled: boolean;
  name: string | null;
  shortName: string | null;
  themeColor: string | null;
  backgroundColor: string | null;
  /** `{ $file }` value of `icon`, resolved by the caller. */
  icon: unknown;
};

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FALLBACK_COLOR = '#ffffff';
export const NAME_MAX = 45;
export const SHORT_NAME_MAX = 12;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Hex colour or `null` (the manifest never carries free-form CSS from settings). */
export function hexColor(value: unknown): string | null {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max).trim() : null;
}

/** Tolerant reader for `settings.pwa`. */
export function pwaSettings(settings: unknown): PwaSettings {
  const pwa = record(record(settings).pwa);
  return {
    enabled: pwa.enabled === true,
    name: text(pwa.name, NAME_MAX),
    shortName: text(pwa.short_name, SHORT_NAME_MAX),
    themeColor: hexColor(pwa.theme_color),
    backgroundColor: hexColor(pwa.background_color),
    icon: pwa.icon ?? null,
  };
}

/** Colour scheme 1 (`scheme-1`, else the first stored scheme) role value. */
function schemeColor(settings: unknown, role: string): string | null {
  const schemes = record(record(record(settings).colors).schemes);
  const scheme = record(schemes['scheme-1'] ?? Object.values(schemes)[0]);
  return hexColor(scheme[role]);
}

/** Browser UI colour: setting, else the scheme background. */
export function themeColorFor(settings: unknown): string {
  return pwaSettings(settings).themeColor ?? schemeColor(settings, 'background') ?? FALLBACK_COLOR;
}

export type ManifestInput = {
  settings: unknown;
  shopName: string;
  /** Square-ish brand image (theme `pwa.icon`, else the store logo). */
  iconUrl: string | null;
  /** Page language (`en`, `fr-CA`), BCP 47. */
  lang?: string;
};

const ICON_SIZES = [192, 512] as const;

/** Icons: Shopify CDN images are cropped square at 192/512; anything else is passed as-is. */
export function manifestIcons(iconUrl: string | null): Record<string, string>[] {
  if (!iconUrl) return [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }];
  return ICON_SIZES.map((size) => ({
    src: shopifyImageUrl(iconUrl, { width: size, height: size, crop: 'center' }),
    sizes: `${size}x${size}`,
    purpose: 'any',
  }));
}

export function buildManifest({ settings, shopName, iconUrl, lang }: ManifestInput) {
  const pwa = pwaSettings(settings);
  const name = pwa.name ?? text(shopName, NAME_MAX) ?? 'Store';
  return {
    name,
    short_name: pwa.shortName ?? name.slice(0, SHORT_NAME_MAX).trim(),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    ...(lang ? { lang } : {}),
    theme_color: themeColorFor(settings),
    background_color: pwa.backgroundColor ?? schemeColor(settings, 'background') ?? FALLBACK_COLOR,
    icons: manifestIcons(iconUrl),
  };
}

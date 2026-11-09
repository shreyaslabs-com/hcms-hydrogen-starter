/**
 * Favicon (premium-theme parity P1): theme `settings.favicon` (`{ $file }` image, Online Store
 * "Logo and favicon" › Favicon image, ideally square ≥ 180 px) → `<link rel="icon">` cropped
 * 32×32 + `<link rel="apple-touch-icon">` 180×180 on the Shopify CDN. No image (or a missing /
 * non-image file) = the starter's `/favicon.svg`. Pure (node:test).
 */
import { shopifyImageUrl } from '../image.ts';

export type FaviconLink = { rel: string; href: string; type?: string; sizes?: string };

export const FALLBACK_FAVICON: FaviconLink[] = [
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

/** Only http(s) URLs reach the `<head>` (asset map URLs are CDN URLs; anything else is junk). */
function safeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Icon links for a resolved favicon image URL (`null` = fallback). */
export function faviconLinks(imageUrl: string | null | undefined): FaviconLink[] {
  const url = safeUrl(imageUrl);
  if (!url) return FALLBACK_FAVICON;
  const crop = (size: number) =>
    shopifyImageUrl(url, { width: size, height: size, crop: 'center' });
  return [
    { rel: 'icon', href: crop(32), sizes: '32x32' },
    { rel: 'apple-touch-icon', href: crop(180), sizes: '180x180' },
  ];
}

/** `settings.favicon` value (`{ $file }`), resolved by the caller with the document's asset map. */
export function faviconValue(settings: unknown): unknown {
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? ((settings as Record<string, unknown>).favicon ?? null)
    : null;
}

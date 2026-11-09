/**
 * Shopify CDN image sizing (hydrogen-image skill). Only Shopify CDN hosts are rewritten; other
 * URLs pass through. Params are set with URL.searchParams so `?v=` etc. survive.
 */
export type ImageCrop = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type ShopifyImageOptions = { width?: number; height?: number; crop?: ImageCrop };

const SHOPIFY_CDN_HOSTS = ['cdn.shopify.com', 'mock.shop'];

export function isShopifyImageHost(hostname: string): boolean {
  return SHOPIFY_CDN_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export function shopifyImageUrl(url: string, { width, height, crop }: ShopifyImageOptions = {}) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!isShopifyImageHost(parsed.hostname)) return url;
  if (width) parsed.searchParams.set('width', String(Math.round(width)));
  if (height) parsed.searchParams.set('height', String(Math.round(height)));
  if (crop) parsed.searchParams.set('crop', crop);
  return parsed.toString();
}

/** Default responsive widths; capped at the image's intrinsic width so we never upscale. */
export const IMAGE_WIDTHS = [320, 480, 640, 800, 1024, 1280, 1600, 2048, 2560];

/**
 * `srcset` with width descriptors. With `aspectRatio` (width / height), each candidate also gets
 * a height and `crop` so the CDN returns the exact shape.
 */
export function imageSrcSet(
  url: string,
  {
    intrinsicWidth,
    aspectRatio,
    crop = 'center',
    widths = IMAGE_WIDTHS,
  }: {
    intrinsicWidth?: number | null;
    aspectRatio?: number;
    crop?: ImageCrop;
    widths?: number[];
  } = {},
): string {
  const max = intrinsicWidth ?? Infinity;
  const candidates = widths.filter((w) => w <= max);
  if (
    intrinsicWidth &&
    !candidates.includes(intrinsicWidth) &&
    intrinsicWidth < (widths.at(-1) ?? 0)
  ) {
    candidates.push(intrinsicWidth);
  }
  if (candidates.length === 0) candidates.push(widths[0] ?? 320);
  return candidates
    .map((width) => {
      const options: ShopifyImageOptions = aspectRatio
        ? { width, height: width / aspectRatio, crop }
        : { width };
      return `${shopifyImageUrl(url, options)} ${width}w`;
    })
    .join(', ');
}

/** Tailwind `md` (48rem): an art-directed `mobile` image applies below it, the main one from it. */
export const MOBILE_MEDIA = '(max-width: 47.99rem)';
export const DESKTOP_MEDIA = '(min-width: 48rem)';

export type ImagePreload = { imageSrcSet: string; imageSizes: string; media: string };

/**
 * Preloads for an art-directed LCP image (T-2.132): one per source, scoped to the media its
 * `<picture>` uses, so each viewport fetches only its own file, and early (from `<head>`, ahead
 * of scripts and CSS). The srcset/sizes must be the exact strings the `<source>`/`<img>` use, or
 * the browser downloads twice.
 */
export function artDirectedPreloads(
  desktop: { srcSet: string; sizes: string },
  mobile: { srcSet: string; sizes: string },
): [ImagePreload, ImagePreload] {
  return [
    { imageSrcSet: mobile.srcSet, imageSizes: mobile.sizes, media: MOBILE_MEDIA },
    { imageSrcSet: desktop.srcSet, imageSizes: desktop.sizes, media: DESKTOP_MEDIA },
  ];
}

/** `{x, y}` in 0–1 → CSS `object-position`. */
export function focalToObjectPosition(focal?: { x: number; y: number } | null): string | undefined {
  if (!focal) return undefined;
  const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 1000) / 10}%`;
  return `${pct(focal.x)} ${pct(focal.y)}`;
}

/**
 * SEO meta for React Router `meta` exports (replaces Hydrogen's removed `getSeoMeta`, S-06 §4).
 * Full SEO (per-template defaults, overrides, JSON-LD) is T-1.7.x; this is the shared builder.
 */
export type SeoInput = {
  title: string;
  description?: string | null;
  /** Absolute canonical URL (no query except pagination). */
  url?: string | null;
  image?: {
    url: string;
    width?: number | null;
    height?: number | null;
    altText?: string | null;
  } | null;
  type?: 'website' | 'product' | 'article';
  siteName?: string;
  noindex?: boolean;
};

/** Recommended Open Graph / X large-card size (1.91:1). */
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const;

const SHARE_CDN_HOSTS = ['cdn.shopify.com', 'mock.shop'];

/**
 * Share-image generator (T-2.7): Shopify CDN images are cropped to 1200×630 (never upscaled,
 * 1.91:1 kept) so Facebook/X/LinkedIn show a full-width card instead of a letterboxed or
 * cropped square. No image rendering on the storefront; other hosts pass through unchanged.
 */
export function shareImage<T extends NonNullable<SeoInput['image']>>(image: T): T {
  let url: URL;
  try {
    url = new URL(image.url);
  } catch {
    return image;
  }
  if (!SHARE_CDN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)))
    return image;
  const ratio = SHARE_IMAGE_SIZE.width / SHARE_IMAGE_SIZE.height;
  let width: number = Math.min(SHARE_IMAGE_SIZE.width, image.width || SHARE_IMAGE_SIZE.width);
  let height = Math.round(width / ratio);
  if (image.height && image.height < height) {
    height = image.height;
    width = Math.round(height * ratio);
  }
  url.searchParams.set('width', String(width));
  url.searchParams.set('height', String(height));
  url.searchParams.set('crop', 'center');
  return { ...image, url: url.toString(), width, height };
}

export type MetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { tagName: 'link'; rel: string; href: string };

/** Truncate at a word boundary, adding an ellipsis (descriptions show ~155 chars in results). */
export function truncate(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

export function seoMeta({
  title,
  description,
  url,
  image,
  type = 'website',
  siteName,
  noindex,
}: SeoInput): MetaTag[] {
  const desc = description ? truncate(description) : '';
  const tags: MetaTag[] = [
    { title },
    { property: 'og:title', content: title },
    { property: 'og:type', content: type },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    { name: 'twitter:title', content: title },
  ];
  if (desc) {
    tags.push(
      { name: 'description', content: desc },
      { property: 'og:description', content: desc },
      { name: 'twitter:description', content: desc },
    );
  }
  if (siteName) tags.push({ property: 'og:site_name', content: siteName });
  if (url) {
    tags.push(
      { tagName: 'link', rel: 'canonical', href: url },
      { property: 'og:url', content: url },
    );
  }
  if (image) {
    image = shareImage(image);
    tags.push(
      { property: 'og:image', content: image.url },
      { name: 'twitter:image', content: image.url },
    );
    if (image.width) tags.push({ property: 'og:image:width', content: String(image.width) });
    if (image.height) tags.push({ property: 'og:image:height', content: String(image.height) });
    if (image.altText) tags.push({ property: 'og:image:alt', content: image.altText });
  }
  if (noindex) tags.push({ name: 'robots', content: 'noindex, nofollow' });
  return tags;
}

/** Query params that change page content and stay in the canonical URL (cursor pagination). */
export const CANONICAL_PARAMS = ['after', 'before'];

/**
 * Canonical URL: origin + path (market prefix included, so each market is self-canonical),
 * dropping tracking, `?variant=`, filter and sort params. Trailing slashes are removed.
 */
export function canonicalUrl(origin: string, pathname: string, search = ''): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of CANONICAL_PARAMS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
  const query = kept.toString();
  return `${origin.replace(/\/+$/, '')}${path}${query ? `?${query}` : ''}`;
}

/* ------------------------------------------------- Theme SEO (T-1.7.1) */

export type SeoImage = NonNullable<SeoInput['image']>;
type SeoOverride = {
  title?: string;
  description?: string;
  image?: SeoImage | null;
  noindex?: boolean;
};
/** Theme Document `seo`, made safe for the root loader (strings bounded, images resolved). */
export type SeoContext = {
  titleFormat: string | null;
  homeTitle: string | null;
  homeDescription: string | null;
  shareImage: SeoImage | null;
  overrides: Record<string, SeoOverride>;
};

const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/**
 * `image` turns a `{ $file }` value into an image (or null: missing / not an image).
 * `shop.description` (Shopify Preferences meta description) is the fallback description (T-2.48).
 */
export function seoContext(
  seo: unknown,
  image: (value: unknown) => SeoImage | null,
  shop: { description?: string | null } = {},
): SeoContext {
  const s = (seo ?? {}) as { defaults?: Record<string, unknown>; overrides?: unknown };
  const d = s.defaults ?? {};
  const overrides: Record<string, SeoOverride> = {};
  if (s.overrides && typeof s.overrides === 'object')
    for (const [name, raw] of Object.entries(s.overrides as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const entry: SeoOverride = {};
      const title = str(o.title, 200);
      const description = str(o.description, 500);
      const img = o.image === undefined ? null : image(o.image);
      if (title) entry.title = title;
      if (description) entry.description = description;
      if (img) entry.image = img;
      if (o.noindex === true) entry.noindex = true;
      if (Object.keys(entry).length) overrides[name] = entry;
    }
  return {
    titleFormat: str(d.title_format, 200),
    homeTitle: str(d.home_title, 200),
    homeDescription: str(d.home_description, 500) ?? str(shop.description, 500),
    shareImage: d.share_image === undefined ? null : image(d.share_image),
    overrides,
  };
}

/** Online Store treats `seo.hidden = 1` as "hide from search engines and sitemaps". */
export function isSeoHidden(hidden: { value?: string | null } | null | undefined): boolean {
  const value = hidden?.value?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

export const DEFAULT_TITLE_FORMAT = '{title} · {shop}';

export function formatTitle(format: string | null, title: string, shop: string): string {
  if (!title) return shop;
  if (title.toLowerCase().includes(shop.toLowerCase())) return title; // Dawn: no "Shop · Shop"
  return (format || DEFAULT_TITLE_FORMAT).replace(/\{title\}/g, title).replace(/\{shop\}/g, shop);
}

export type PageSeoInput = {
  /** Template name rendering this page (`product`, `page.contact`); null = no HCMS template. */
  template: string | null;
  /** Generic template type, also checked for overrides (`page` for `page.contact`). */
  type: string;
  /** Resource or page title (product title, "Search"). */
  title: string;
  description?: string | null;
  image?: SeoImage | null;
  /** Shopify resource SEO fields (Search engine listing): always win. */
  resourceSeo?: { title?: string | null; description?: string | null } | null;
  /** Shopify `seo.hidden` metafield: `1` hides the resource from search engines (T-2.48). */
  hidden?: { value?: string | null } | null;
  shopName: string;
  url?: string | null;
  ogType?: SeoInput['type'];
  noindex?: boolean;
};

/**
 * Precedence (Online Store behaviour): Shopify resource SEO → template override → resource
 * title/description → store defaults. The home page uses the Preferences title as is.
 */
export function pageSeo(ctx: SeoContext | null | undefined, input: PageSeoInput): SeoInput {
  const override =
    (input.template ? ctx?.overrides[input.template] : undefined) ?? ctx?.overrides[input.type];
  const home = input.type === 'index';
  const resourceTitle = str(input.resourceSeo?.title, 200);
  const baseTitle =
    resourceTitle ?? override?.title ?? (home ? ctx?.homeTitle : null) ?? input.title;
  const title =
    home && !resourceTitle && !override?.title && ctx?.homeTitle
      ? ctx.homeTitle
      : formatTitle(ctx?.titleFormat ?? null, baseTitle, input.shopName);
  const description =
    str(input.resourceSeo?.description, 500) ??
    override?.description ??
    str(input.description, 5000) ??
    ctx?.homeDescription ??
    null;
  const image = override?.image ?? input.image ?? ctx?.shareImage ?? null;
  return {
    title,
    description,
    image,
    siteName: input.shopName,
    ...(input.url ? { url: input.url } : {}),
    ...(input.ogType ? { type: input.ogType } : {}),
    ...(input.noindex || override?.noindex || isSeoHidden(input.hidden) ? { noindex: true } : {}),
  };
}

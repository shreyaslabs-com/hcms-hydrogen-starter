/**
 * Judge.me, server-rendered (T-2.103). Pure (node:test-importable; also used by the lazy
 * integrations chunk, so no vendor table / sanitizer imports here — the sanitizer is passed in).
 *
 * ONE request per page to Judge.me's cache server (the endpoint its own `widget_preloader.js`
 * calls): `GET https://cache.judge.me/widgets/shopify/<shop>?public_token=…` plus
 * `review_widget_product_ids` / `preview_badge_product_ids` (comma-separated Shopify product ids,
 * so a whole product grid is one request), `featured_carousel=1`, `all_reviews_page=1`. The JSON
 * answer always carries `settings` (HTML: settings `<script>` + `<style>`) and `html_miracle`
 * (critical CSS); per widget `review_widgets[id]`, `preview_badges[id]`, `featured_carousel`,
 * `all_reviews_header` + `all_reviews`. (Read from `widget_preloader.js`, Nov 2026.)
 *
 * Every widget HTML goes through our allowlist sanitizer (`sanitizeReviewsHtml`) before it is cached
 * or rendered; Judge.me's `<style>` blocks go through `sanitizeVendorCss`.
 */

/** Hosts (the integrations table in `./integrations.ts` lists them for the CSP). */
export const JUDGEME_CACHE_HOST = 'https://cache.judge.me';
export const JUDGEME_CDN_HOST = 'https://cdnwidget.judge.me/';

/** Caps: review widgets per page (main product + a featured product or two), badges per grid. */
export const MAX_REVIEW_WIDGETS = 4;
export const MAX_BADGES = 60;
const MAX_HTML = 300_000;
const MAX_CSS = 150_000;

export type JudgemeTargets = {
  /** Shopify product ids (numeric strings) for review widgets. */
  reviews: string[];
  /** Shopify product ids for star rating badges (product page + cards). */
  stars: string[];
  carousel: boolean;
  allReviews: boolean;
};

export type JudgemeRating = { value: number; count: number };
export type JudgemeReview = {
  author: string;
  rating: number;
  title?: string;
  body?: string;
  date?: string;
};

/** Server-rendered app widgets for one page (adapter `appWidgetHtml` keys → sanitized HTML). */
export type AppWidgets = {
  html: Record<string, string>;
  /** Sanitized vendor CSS (Judge.me settings + critical styles) for a `<style>` element. */
  css: string;
  /** Judge.me star badge data per product id (JSON-LD fallback when metafields are empty). */
  ratings: Record<string, JudgemeRating>;
  /** A few published reviews per product id (JSON-LD `review`). */
  reviews: Record<string, JudgemeReview[]>;
  /** Judge.me answered 404 (shop not on Judge.me): the page tells the browser loader to skip. */
  unavailable?: true;
};

/** `<meta name>` the page renders when the server saw Judge.me's 404 (S2-3). */
export const JUDGEME_UNAVAILABLE_META = 'hcms-judgeme-unavailable';

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/(\d{1,20})$/;
const NUMERIC_ID = /^\d{1,20}$/;

type Node = {
  type?: unknown;
  settings?: Record<string, unknown>;
  blocks?: Record<string, Node>;
  disabled?: unknown;
};

/** `app` setting of a reviews block: Judge.me is the default (`app-blocks.ts` REVIEWS_SETTING). */
const isJudgeme = (node: Node) => {
  const app = node.settings?.app;
  return app === undefined || app === null || app === '' || app === 'judgeme';
};

/** Product ids in a section's data slice, breadth-first (the section's own product comes first). */
export function productIds(data: unknown, max: number): string[] {
  const found: string[] = [];
  const queue: unknown[] = [data];
  let visited = 0;
  while (queue.length && found.length < max && visited < 20_000) {
    const value = queue.shift();
    visited += 1;
    if (Array.isArray(value)) queue.push(...value);
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'id' && typeof child === 'string') {
          const id = PRODUCT_GID.exec(child)?.[1];
          if (id && !found.includes(id)) found.push(id);
        } else if (child && typeof child === 'object') queue.push(child);
      }
    }
  }
  return found;
}

/**
 * Which Judge.me widgets a resolved template needs, with the product ids from its batched data
 * (`data['section:<id>']`). Null = nothing to fetch.
 */
export function judgemeTargets(
  template: { sections?: Record<string, Node> },
  data: Record<string, unknown>,
): JudgemeTargets | null {
  const reviews = new Set<string>();
  const stars = new Set<string>();
  let carousel = false;
  let allReviews = false;
  for (const [id, section] of Object.entries(template.sections ?? {})) {
    if (!section || section.disabled === true) continue;
    if (section.type === 'judgeme-carousel') carousel = true;
    if (section.type === 'judgeme-all-reviews') allReviews = true;
    let wantsReviews = false;
    let wantsStars = false;
    let wantsCards = false;
    const walk = (blocks: Record<string, Node> | undefined, depth: number) => {
      if (!blocks || depth > 8) return;
      for (const block of Object.values(blocks)) {
        if (!block || block.disabled === true) continue;
        if (block.type === 'reviews' && isJudgeme(block)) wantsReviews = true;
        if (block.type === 'star_rating' && isJudgeme(block)) wantsStars = true;
        if (block.type === 'card-rating' && isJudgeme(block)) wantsCards = true;
        walk(block.blocks, depth + 1);
      }
    };
    walk(section.blocks, 0);
    if (!wantsReviews && !wantsStars && !wantsCards) continue;
    const slice = data[`section:${id}`];
    const own = productIds(slice, 1)[0];
    if (own && wantsReviews) reviews.add(own);
    if (own && wantsStars) stars.add(own);
    if (wantsCards) for (const p of productIds(slice, MAX_BADGES)) stars.add(p);
  }
  const targets: JudgemeTargets = {
    reviews: [...reviews].sort().slice(0, MAX_REVIEW_WIDGETS),
    stars: [...stars].sort().slice(0, MAX_BADGES),
    carousel,
    allReviews,
  };
  return targets.reviews.length || targets.stars.length || carousel || allReviews ? targets : null;
}

/** Cache server URL (one request for every widget on the page). */
export function judgemeCacheUrl(
  shopDomain: string,
  publicToken: string,
  targets: JudgemeTargets,
): string {
  const params = new URLSearchParams({ public_token: publicToken });
  const ids = (list: string[]) => list.filter((id) => NUMERIC_ID.test(id)).join(',');
  if (ids(targets.reviews)) params.set('review_widget_product_ids', ids(targets.reviews));
  if (ids(targets.stars)) params.set('preview_badge_product_ids', ids(targets.stars));
  if (targets.carousel) {
    // Judge.me's preloader asks for the store totals with the carousel.
    params.set('featured_carousel', '1');
    params.set('all_reviews_rating', '1');
    params.set('all_reviews_count', '1');
  }
  if (targets.allReviews) params.set('all_reviews_page', '1');
  return `${JUDGEME_CACHE_HOST}/widgets/shopify/${encodeURIComponent(shopDomain)}?${params}`;
}

/** Sub-request cache key: never contains the token; ids are sorted so equal pages share it. */
export const judgemeCacheKey = (shopDomain: string, targets: JudgemeTargets): string[] => [
  'hcms',
  'judgeme',
  shopDomain,
  targets.reviews.join(','),
  targets.stars.join(','),
  targets.carousel ? 'c' : '',
  targets.allReviews ? 'a' : '',
];

const JUDGEME_URL = /^https:\/\/([a-z0-9-]+\.)*judge\.me\//i;
const DATA_URL =
  /^data:(image\/(png|gif|jpeg|webp|svg\+xml)|font\/[a-z0-9]+|application\/(x-)?font-[a-z0-9]+)[;,]/i;

/**
 * Judge.me's widget CSS for a `<style>` element: rejected whole (empty string) when it could
 * break out of the element, import other sheets, run script-ish features, or load anything but
 * Judge.me hosts / image + font data URIs. Checked on a copy with CSS escapes decoded.
 */
export function sanitizeVendorCss(css: string): string {
  if (!css || css.length > MAX_CSS) return '';
  const decoded = css
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16) || 32),
    )
    .replace(/\\(.)/g, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  if (/<|@import|expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/i.test(decoded))
    return '';
  for (const match of decoded.matchAll(/url\s*\(\s*(['"]?)([^'")]*)/gi)) {
    const url = (match[2] ?? '').trim();
    if (!JUDGEME_URL.test(url) && !DATA_URL.test(url)) return '';
  }
  return css.trim();
}

const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

/** `<style>` contents of Judge.me's `settings` / `html_miracle` HTML, sanitized. */
export function judgemeCss(...html: unknown[]): string {
  const blocks: string[] = [];
  for (const chunk of html) {
    if (typeof chunk !== 'string' || chunk.length > MAX_HTML) continue;
    for (const match of chunk.matchAll(STYLE)) {
      const css = sanitizeVendorCss(match[1] ?? '');
      if (css) blocks.push(css);
    }
  }
  return blocks.join('\n');
}

const decodeText = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Opening tag whose class list contains `name` (sanitized HTML: attributes are double-quoted). */
const tagWithClass = (html: string, name: string, from = 0): RegExpExecArray | null => {
  const re = new RegExp(
    `<([a-z0-9]+)\\b[^>]*\\bclass="(?:[^"]*\\s)?${name}(?:\\s[^"]*)?"[^>]*>`,
    'gi',
  );
  re.lastIndex = from;
  return re.exec(html);
};
const attr = (tag: string, name: string): string | null =>
  new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? null;

/** Text inside the first element with class `name` (simple elements: author, title, body). */
function textOf(html: string, name: string): string {
  const open = tagWithClass(html, name);
  if (!open) return '';
  const tag = open[1] ?? 'div';
  const start = open.index + open[0].length;
  const end = html.indexOf(`</${tag}>`, start);
  return decodeText(html.slice(start, end === -1 ? undefined : end));
}

/** Average + count from a (sanitized) Judge.me star badge. */
export function badgeRating(html: string): JudgemeRating | null {
  const tag = tagWithClass(html, 'jdgm-prev-badge')?.[0];
  if (!tag) return null;
  const value = Number(attr(tag, 'data-average-rating'));
  const count = Number(attr(tag, 'data-number-of-reviews'));
  if (!Number.isFinite(value) || !Number.isInteger(count) || count <= 0) return null;
  if (value < 1 || value > 5) return null;
  return { value, count };
}

/** Up to `max` published reviews (author + rating required) from a sanitized review widget. */
export function widgetReviews(html: string, max = 3): JudgemeReview[] {
  const out: JudgemeReview[] = [];
  const starts: number[] = [];
  const re = /<div\b[^>]*\bclass="(?:[^"]*\s)?jdgm-rev(?:\s[^"]*)?"[^>]*>/gi;
  for (const match of html.matchAll(re)) starts.push(match.index);
  starts.forEach((start, i) => {
    if (out.length >= max) return;
    const chunk = html.slice(start, starts[i + 1] ?? html.length);
    const ratingTag = tagWithClass(chunk, 'jdgm-rev__rating')?.[0];
    const rating = Number(ratingTag ? attr(ratingTag, 'data-score') : NaN);
    const author = textOf(chunk, 'jdgm-rev__author').slice(0, 100);
    if (!author || !Number.isInteger(rating) || rating < 1 || rating > 5) return;
    const title = textOf(chunk, 'jdgm-rev__title').slice(0, 200);
    const body = textOf(chunk, 'jdgm-rev__body').slice(0, 500);
    const stamp = tagWithClass(chunk, 'jdgm-rev__timestamp')?.[0];
    const date = stamp ? attr(stamp, 'data-content') : null;
    out.push({
      author,
      rating,
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
      ...(date && /^\d{4}-\d{2}-\d{2}/.test(date) ? { date: date.slice(0, 10) } : {}),
    });
  });
  return out;
}

const html = (value: unknown, sanitize: (raw: string) => string): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_HTML) return '';
  return sanitize(value).trim();
};

/**
 * Cache server JSON → sanitized widgets. Only ids we asked for are kept. Null = unusable answer.
 */
export function parseJudgemeResponse(
  json: unknown,
  targets: JudgemeTargets,
  sanitize: (raw: string) => string,
): AppWidgets | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  const result: AppWidgets = {
    html: {},
    css: judgemeCss(r.settings, r.html_miracle),
    ratings: {},
    reviews: {},
  };
  const byId = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const widgets = byId(r.review_widgets);
  for (const id of targets.reviews) {
    const clean = html(widgets[id], sanitize);
    if (!clean) continue;
    result.html[`judgeme:reviews:${id}`] = clean;
    const items = widgetReviews(clean);
    if (items.length) result.reviews[id] = items;
  }
  const badges = byId(r.preview_badges);
  for (const id of targets.stars) {
    const clean = html(badges[id], sanitize);
    if (!clean) continue;
    result.html[`judgeme:stars:${id}`] = clean;
    const rating = badgeRating(clean);
    if (rating) result.ratings[id] = rating;
  }
  if (targets.carousel) {
    const clean = html(r.featured_carousel, sanitize);
    if (clean) result.html['judgeme:carousel'] = clean;
  }
  if (targets.allReviews) {
    const body = html(r.all_reviews, sanitize);
    if (body)
      result.html['judgeme:all_reviews'] =
        `${html(r.all_reviews_header, sanitize)}<div class="jdgm-all-reviews__body">${body}</div>`;
  }
  return Object.keys(result.html).length || result.css ? result : null;
}

type Metafield = { value?: string | null } | null | undefined;

/**
 * Product JSON-LD rating fields, only from real data: the standard `reviews.rating` /
 * `reviews.rating_count` metafields (Judge.me syncs them), else Judge.me's badge; `review` items
 * only next to an `aggregateRating`. `{}` when there is nothing real to say.
 */
export function ratingJsonLd(
  metafields: { rating?: Metafield; ratingCount?: Metafield },
  widgets: AppWidgets | null | undefined,
  productGid: string,
): { aggregateRating?: Record<string, unknown>; review?: Record<string, unknown>[] } {
  const id = PRODUCT_GID.exec(productGid)?.[1] ?? '';
  let aggregate: { value: number; count: number; best: number; worst: number } | null = null;
  try {
    const parsed = JSON.parse(metafields.rating?.value ?? 'null') as {
      value?: string;
      scale_max?: string;
      scale_min?: string;
    } | null;
    const value = Number(parsed?.value);
    const count = Number(metafields.ratingCount?.value);
    const best = Number(parsed?.scale_max ?? 5);
    const worst = Number(parsed?.scale_min ?? 1);
    if (Number.isFinite(value) && Number.isInteger(count) && count > 0 && value > 0)
      aggregate = { value, count, best: best || 5, worst: worst || 1 };
  } catch {
    aggregate = null;
  }
  const badge = id ? widgets?.ratings[id] : undefined;
  if (!aggregate && badge) aggregate = { ...badge, best: 5, worst: 1 };
  if (!aggregate) return {};
  const reviews = (id ? widgets?.reviews[id] : undefined) ?? [];
  return {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: aggregate.value,
      reviewCount: aggregate.count,
      bestRating: aggregate.best,
      worstRating: aggregate.worst,
    },
    ...(reviews.length
      ? {
          review: reviews.map((item) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: item.author },
            reviewRating: {
              '@type': 'Rating',
              ratingValue: item.rating,
              bestRating: 5,
              worstRating: 1,
            },
            ...(item.title ? { name: item.title } : {}),
            ...(item.body ? { reviewBody: item.body } : {}),
            ...(item.date ? { datePublished: item.date } : {}),
          })),
        }
      : {}),
  };
}

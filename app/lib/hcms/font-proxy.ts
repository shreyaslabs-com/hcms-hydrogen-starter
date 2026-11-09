/**
 * Same-origin Google Fonts (T-2.135): font files referenced by the inlined Google `@font-face`
 * rules (`google-fonts.ts`) are served from `/__hcms/fonts/<sig>/<family>-<ver>-<name>.woff2`, so
 * first paint needs no fonts.gstatic.com connection (~1 s in PSI slow 4G on font-led themes).
 *
 * Not an open proxy: only `https://fonts.gstatic.com/s/<family>/<ver>/<name>.woff2` files, and
 * `<sig>` = HMAC(secret, upstream URL), minted only while rewriting the Google CSS fetched for the
 * theme's own families, so nobody else can mint a path. Bodies must be woff2 (`wOF2` magic) and
 * ≤ 500 KB. Every rewritten `src` keeps the gstatic URL as a second source: the browser falls
 * back to it when our path fails. Handled in `server.ts` before React Router (no route manifest
 * entry, no middleware, zero client JS); answers are kept in the Cache API (immutable).
 */

export const FONT_PATH_PREFIX = '/__hcms/fonts/';
const GSTATIC_FILE =
  /^https:\/\/fonts\.gstatic\.com\/s\/([a-z0-9]+)\/(v\d{1,4})\/([A-Za-z0-9_-]{1,200})\.woff2$/;
const FONT_PATH =
  /^\/__hcms\/fonts\/([0-9a-f]{16})\/([a-z0-9]+)-(v\d{1,4})-([A-Za-z0-9_-]{1,200})\.woff2$/;
export const MAX_FONT_BYTES = 500_000;
const UPSTREAM_TIMEOUT_MS = 5_000;
export const FONT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Signing key: Oxygen's `SESSION_SECRET`, else the HCMS preview secret; none = gstatic as before. */
export function fontProxySecret(env: {
  SESSION_SECRET?: string;
  HCMS_PREVIEW_SECRET?: string;
}): string | undefined {
  return env.SESSION_SECRET || env.HCMS_PREVIEW_SECRET || undefined;
}

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    keys.set(secret, key);
  }
  return key;
}

/** 64-bit HMAC tag (hex) for a value; domain-separated from other uses of the secret. */
export async function fontSignature(secret: string, value: string): Promise<string> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(`hcms-font:${value}`),
  );
  return [...new Uint8Array(mac, 0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Same-origin path for a gstatic woff2 URL; null for any other URL (it stays on gstatic). */
export async function selfHostedFontPath(secret: string, upstream: string): Promise<string | null> {
  const match = GSTATIC_FILE.exec(upstream);
  if (!match) return null;
  const [, family, version, name] = match;
  return `${FONT_PATH_PREFIX}${await fontSignature(secret, upstream)}/${family}-${version}-${name}.woff2`;
}

/** Our path → the gstatic URL it was minted for, or null (bad shape or signature). */
export async function verifyFontPath(secret: string, pathname: string): Promise<string | null> {
  const match = FONT_PATH.exec(pathname);
  if (!match) return null;
  const [, sig = '', family, version, name] = match;
  const upstream = `https://fonts.gstatic.com/s/${family}/${version}/${name}.woff2`;
  const expected = await fontSignature(secret, upstream);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? upstream : null;
}

/**
 * Safe (minified) Google CSS → `src:url(<ours>) format('woff2'),url(<gstatic>) format('woff2')`
 * for every gstatic woff2 source; anything else is left as it is.
 */
export async function selfHostFontCss(css: string, secret: string): Promise<string> {
  const pattern = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+)\) format\('woff2'\)/g;
  const urls = [...new Set([...css.matchAll(pattern)].map((m) => m[1] ?? ''))];
  const paths = new Map<string, string>();
  for (const url of urls) {
    const path = await selfHostedFontPath(secret, url);
    if (path) paths.set(url, path);
  }
  return css.replace(pattern, (source, url: string) => {
    const path = paths.get(url);
    return path ? `url(${path}) format('woff2'),${source}` : source;
  });
}

export type FontFaceRef = { family: string; weight: number; style: 'normal' | 'italic' };

function declarations(block: string): Map<string, string> {
  const body = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
  const map = new Map<string, string>();
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) map.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return map;
}

function weightMatches(value: string, weight: number): boolean {
  const [min, max = min] = value.split(/\s+/).map(Number);
  return min !== undefined && weight >= min && weight <= (max ?? min);
}

/**
 * Same-origin files to preload: the Latin subset of each above-the-fold face (heading, body
 * regular), at most 2. Other weights/subsets load on demand (`font-display: swap`).
 */
export function fontPreloads(css: string, faces: readonly FontFaceRef[]): string[] {
  const blocks = (css.match(/@font-face\{[^{}]*\}/g) ?? []).map(declarations);
  const hrefs: string[] = [];
  for (const face of faces) {
    const block = blocks.find(
      (d) =>
        (d.get('font-family') ?? '').replace(/['"]/g, '') === face.family &&
        (d.get('font-style') ?? 'normal') === face.style &&
        weightMatches(d.get('font-weight') ?? '400', face.weight) &&
        (d.get('unicode-range') ?? '').startsWith('U+0000-00FF'),
    );
    const href = /^url\((\/__hcms\/fonts\/[^)]+)\)/.exec(block?.get('src') ?? '')?.[1];
    if (href && !hrefs.includes(href)) hrefs.push(href);
    if (hrefs.length === 2) break;
  }
  return hrefs;
}

type FontCache = Pick<Cache, 'match' | 'put'>;

const failure = (status: number) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

async function readCapped(
  body: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_FONT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const isWoff2 = (bytes: Uint8Array) =>
  bytes.length > 4 &&
  bytes[0] === 0x77 &&
  bytes[1] === 0x4f &&
  bytes[2] === 0x46 &&
  bytes[3] === 0x32;

/**
 * `GET /__hcms/fonts/<sig>/<file>.woff2`: cached copy, else the signed gstatic file (validated),
 * stored for a year. Failures answer 404/502 `no-store` (the CSS falls back to gstatic).
 */
export async function serveSelfHostedFont(
  request: Request,
  options: {
    secret: string | undefined;
    cache: FontCache;
    waitUntil: (promise: Promise<unknown>) => void;
    fetch?: typeof fetch;
  },
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  if (!options.secret || url.search) return failure(404);
  const upstream = await verifyFontPath(options.secret, url.pathname);
  if (!upstream) return failure(404);
  const key = new Request(`${url.origin}${url.pathname}`);
  const head = (response: Response) =>
    request.method === 'HEAD' ? new Response(null, response) : response;

  const cached = await options.cache.match(key).catch(() => undefined);
  if (cached) return head(cached);

  let bytes: Uint8Array<ArrayBuffer> | null = null;
  try {
    const response = await (options.fetch ?? fetch)(upstream, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const length = Number(response.headers.get('content-length') ?? 0);
    if (
      response.ok &&
      response.body &&
      (response.headers.get('content-type') ?? '').startsWith('font/woff2') &&
      length <= MAX_FONT_BYTES
    ) {
      bytes = await readCapped(response.body);
    } else {
      await response.body?.cancel();
    }
  } catch {
    bytes = null;
  }
  if (!bytes || !isWoff2(bytes)) return failure(502);

  const response = new Response(bytes, {
    headers: {
      'Content-Type': 'font/woff2',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': FONT_CACHE_CONTROL,
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  options.waitUntil(options.cache.put(key, response.clone()).catch(() => undefined));
  return head(response);
}

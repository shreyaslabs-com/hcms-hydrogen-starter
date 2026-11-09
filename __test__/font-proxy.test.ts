import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FONT_CACHE_CONTROL,
  fontPreloads,
  fontProxySecret,
  selfHostedFontPath,
  selfHostFontCss,
  serveSelfHostedFont,
  verifyFontPath,
} from '../app/lib/hcms/font-proxy.ts';
import { linksWithoutGoogleStylesheet, safeGoogleFontCss } from '../app/lib/hcms/google-fonts.ts';

const SECRET = 'test-secret';
const LATIN =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2';
const CYRILLIC =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZthiI2B.woff2';
const PLAYFAIR =
  'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvXDXbtM.woff2';
const face = (family: string, weight: number, url: string, range: string) => `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(${url}) format('woff2');
  unicode-range: ${range};
}
`;
const GOOGLE_CSS = safeGoogleFontCss(
  [
    face('Inter', 400, CYRILLIC, 'U+0301, U+0400-045F'),
    face('Inter', 400, LATIN, 'U+0000-00FF, U+0131'),
    face('Inter', 700, LATIN, 'U+0000-00FF, U+0131'),
    face('Playfair Display', 600, PLAYFAIR, 'U+0000-00FF, U+0131'),
    face('Old', 400, 'https://fonts.gstatic.com/l/font?kit=abc', 'U+0000-00FF'),
  ].join(''),
) as string;

const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 9, 9]);

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: async (request: RequestInfo | URL) => store.get(new Request(request).url)?.clone(),
    put: async (request: RequestInfo | URL, response: Response) => {
      store.set(new Request(request).url, response);
    },
  };
}

function fakeFetch(make: () => Response) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return make();
  }) as typeof fetch;
  return { fn, calls };
}

const fontResponse = (body: BodyInit = WOFF2, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { 'content-type': 'font/woff2', ...headers } });

async function serve(
  path: string,
  options: {
    fetch?: typeof fetch;
    secret?: string;
    method?: string;
    cache?: ReturnType<typeof fakeCache>;
  } = {},
) {
  const pending: Promise<unknown>[] = [];
  const response = await serveSelfHostedFont(
    new Request(`https://shop.example${path}`, { method: options.method ?? 'GET' }),
    {
      secret: 'secret' in options ? options.secret : SECRET,
      cache: options.cache ?? fakeCache(),
      waitUntil: (p) => pending.push(p),
      fetch: options.fetch,
    },
  );
  await Promise.all(pending);
  return response;
}

test('secret: SESSION_SECRET, else the preview secret, else off', () => {
  assert.equal(fontProxySecret({ SESSION_SECRET: 'a', HCMS_PREVIEW_SECRET: 'b' }), 'a');
  assert.equal(fontProxySecret({ HCMS_PREVIEW_SECRET: 'b' }), 'b');
  assert.equal(fontProxySecret({ SESSION_SECRET: '' }), undefined);
});

test('rewrites gstatic woff2 sources to the same-origin path, gstatic kept as fallback', async () => {
  const css = await selfHostFontCss(GOOGLE_CSS, SECRET);
  const path = await selfHostedFontPath(SECRET, LATIN);
  assert.match(
    path ?? '',
    /^\/__hcms\/fonts\/[0-9a-f]{16}\/inter-v20-UcCO3Fwr[A-Za-z0-9_-]+\.woff2$/,
  );
  assert.ok(css.includes(`src:url(${path}) format('woff2'),url(${LATIN}) format('woff2')`));
  assert.equal(css.match(/@font-face/g)?.length, 5);
  assert.equal(css.match(/url\(\/__hcms\/fonts\//g)?.length, 4);
  // Not a `/s/…woff2` file: stays on gstatic only.
  assert.ok(css.includes("src:url(https://fonts.gstatic.com/l/font?kit=abc) format('woff2');"));
  assert.equal(await selfHostedFontPath(SECRET, 'https://evil.example/s/inter/v20/a.woff2'), null);
  assert.equal(
    await selfHostedFontPath(SECRET, 'https://fonts.gstatic.com/s/inter/v20/a.ttf'),
    null,
  );
  // Deterministic (cached CSS stays valid) and secret-bound.
  assert.equal(await selfHostFontCss(GOOGLE_CSS, SECRET), css);
  assert.notEqual(await selfHostedFontPath('other', LATIN), path);
});

test('verifies paths: only signed gstatic files, nothing else', async () => {
  const path = (await selfHostedFontPath(SECRET, PLAYFAIR)) as string;
  assert.equal(await verifyFontPath(SECRET, path), PLAYFAIR);
  assert.equal(await verifyFontPath('other', path), null);
  const flipped = path.replace(/\/([0-9a-f])/, (_, c: string) => `/${c === '0' ? '1' : '0'}`);
  assert.equal(await verifyFontPath(SECRET, flipped), null);
  assert.equal(await verifyFontPath(SECRET, path.replace('playfairdisplay', 'inter')), null);
  for (const bad of [
    '/__hcms/fonts/0123456789abcdef/inter-v20-a.ttf',
    '/__hcms/fonts/0123456789abcdef/..%2F..%2Fetc-v1-a.woff2',
    '/__hcms/fonts/0123456789abcdef/a/b-v1-c.woff2',
    '/__hcms/fonts/zz/inter-v20-a.woff2',
  ])
    assert.equal(await verifyFontPath(SECRET, bad), null, bad);
});

test('preloads the Latin file of heading + body regular, at most 2, same-origin only', async () => {
  const css = await selfHostFontCss(GOOGLE_CSS, SECRET);
  const heading = { family: 'Playfair Display', weight: 600, style: 'normal' as const };
  const body = { family: 'Inter', weight: 400, style: 'normal' as const };
  assert.deepEqual(fontPreloads(css, [heading, body]), [
    await selfHostedFontPath(SECRET, PLAYFAIR),
    await selfHostedFontPath(SECRET, LATIN),
  ]);
  // Same file for both faces → one preload; unknown faces → none; gstatic-only CSS → none.
  assert.equal(fontPreloads(css, [body, { ...body, weight: 700 }]).length, 1);
  assert.deepEqual(fontPreloads(css, [{ family: 'Nope', weight: 400, style: 'normal' }]), []);
  assert.deepEqual(fontPreloads(GOOGLE_CSS, [heading, body]), []);
});

test('self-hosted fonts drop the gstatic preconnect, inline-only keeps it', () => {
  const links = [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' as const },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter' },
  ];
  assert.deepEqual(
    linksWithoutGoogleStylesheet(links).map((l) => l.href),
    ['https://fonts.gstatic.com'],
  );
  assert.deepEqual(linksWithoutGoogleStylesheet(links, { keepGstatic: false }), []);
});

test('serves the signed file with immutable cache headers, then from the cache', async () => {
  const path = (await selfHostedFontPath(SECRET, LATIN)) as string;
  const cache = fakeCache();
  const upstream = fakeFetch(() => fontResponse());
  const response = await serve(path, { fetch: upstream.fn, cache });
  assert.equal(response.status, 200);
  assert.deepEqual(upstream.calls, [LATIN]);
  assert.equal(response.headers.get('content-type'), 'font/woff2');
  assert.equal(response.headers.get('cache-control'), FONT_CACHE_CONTROL);
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), WOFF2);
  assert.equal(cache.store.size, 1);

  const again = await serve(path, { fetch: upstream.fn, cache });
  assert.equal(again.status, 200);
  assert.deepEqual(new Uint8Array(await again.arrayBuffer()), WOFF2);
  assert.equal(upstream.calls.length, 1, 'repeat hit never reaches Google');

  const head = await serve(path, { fetch: upstream.fn, cache, method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
});

test('no open proxy: unsigned, forged, query or secret-less requests never fetch', async () => {
  const upstream = fakeFetch(() => fontResponse());
  const path = (await selfHostedFontPath(SECRET, LATIN)) as string;
  const forged = `/__hcms/fonts/0123456789abcdef/inter-v20-${'a'.repeat(20)}.woff2`;
  for (const [url, options] of [
    [forged, {}],
    [`${path}?u=https://evil.example`, {}],
    [path, { secret: undefined }],
    [(await selfHostedFontPath('attacker', LATIN)) as string, {}],
  ] as const) {
    const response = await serve(url, { ...options, fetch: upstream.fn });
    assert.equal(response.status, 404, url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await serve(path, { method: 'POST', fetch: upstream.fn })).status, 405);
  assert.deepEqual(upstream.calls, []);
});

test('upstream failures answer 502 no-store and cache nothing (CSS falls back to gstatic)', async () => {
  const path = (await selfHostedFontPath(SECRET, LATIN)) as string;
  const cases: [string, () => Response][] = [
    ['404', () => new Response('nope', { status: 404, headers: { 'content-type': 'font/woff2' } })],
    ['html', () => new Response('<html>', { headers: { 'content-type': 'text/html' } })],
    ['declared too big', () => fontResponse(WOFF2, { 'content-length': '600000' })],
    ['streamed too big', () => fontResponse(new Uint8Array(600_000).fill(0x77))],
    ['not woff2 bytes', () => fontResponse(new Uint8Array([1, 2, 3, 4, 5, 6]))],
    [
      'network error',
      () => {
        throw new TypeError('fetch failed');
      },
    ],
  ];
  for (const [name, make] of cases) {
    const cache = fakeCache();
    const response = await serve(path, { fetch: fakeFetch(make).fn, cache });
    assert.equal(response.status, 502, name);
    assert.equal(response.headers.get('cache-control'), 'no-store', name);
    assert.equal(cache.store.size, 0, name);
  }
});

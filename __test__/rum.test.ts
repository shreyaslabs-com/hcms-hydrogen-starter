import assert from 'node:assert/strict';
import test from 'node:test';

import { sign } from '../app/lib/hcms/forms.ts';
import { isAutomatedAgent, isAutomatedBrowser } from '../app/lib/hcms/automation.ts';
import {
  cleanRate,
  handleRumBeacon,
  parseBeacon,
  rumSampleRate,
  setRumSampleRate,
} from '../app/lib/hcms/rum.ts';

const env = {
  HCMS_API_URL: 'https://admin.example.com/',
  HCMS_PREVIEW_SECRET: 's3cret',
  PUBLIC_STORE_DOMAIN: 'shop.myshopify.com',
};
const beacon = (body: unknown) =>
  new Request('https://store.example/__hcms/rum', { method: 'POST', body: JSON.stringify(body) });

test('parseBeacon keeps plausible metrics only and validates the template', () => {
  assert.deepEqual(
    parseBeacon(
      JSON.stringify({
        template: 'product',
        device: 'desktop',
        metrics: { LCP: 1234.6, CLS: 0.12345, INP: -1, FID: 3 },
      }),
    ),
    { template: 'product', device: 'desktop', metrics: { LCP: 1235, CLS: 0.123 }, rate: 1 },
  );
  assert.equal(
    parseBeacon(JSON.stringify({ template: '<x>', metrics: { CLS: 0.1 } }))?.template,
    '-',
  );
  assert.equal(parseBeacon(JSON.stringify({ metrics: {} })), null);
  assert.equal(parseBeacon('nope'), null);
  assert.equal(parseBeacon('x'.repeat(2000)), null);
});

test('answers 204 at once and forwards a signed payload in the background', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const pending: Promise<unknown>[] = [];
  const res = await handleRumBeacon(
    beacon({ template: 'index', metrics: { LCP: 900 } }),
    env,
    (p) => pending.push(p),
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch,
  );
  assert.equal(res.status, 204);
  await Promise.all(pending);
  const [call] = calls;
  assert.ok(call);
  assert.equal(call.url, 'https://admin.example.com/api/storefront/rum');
  const payload = JSON.parse(String(call.init.body));
  assert.equal(payload.kind, 'rum');
  assert.equal(payload.shop, 'shop.myshopify.com');
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers['X-HCMS-Signature'], await sign('s3cret', String(call.init.body)));
});

test('nothing is forwarded without config or with junk; a failing admin never throws', async () => {
  let called = 0;
  const count = (async () => {
    called++;
    throw new Error('down');
  }) as unknown as typeof fetch;
  const pending: Promise<unknown>[] = [];
  assert.equal(
    (await handleRumBeacon(beacon({ metrics: { LCP: 1 } }), {}, (p) => pending.push(p), count))
      .status,
    204,
  );
  assert.equal(
    (await handleRumBeacon(beacon({ metrics: {} }), env, (p) => pending.push(p), count)).status,
    204,
  );
  await handleRumBeacon(beacon({ metrics: { CLS: 0 } }), env, (p) => pending.push(p), count);
  await Promise.all(pending);
  assert.equal(called, 1);
  const get = await handleRumBeacon(
    new Request('https://s.example/__hcms/rum'),
    env,
    () => undefined,
  );
  assert.equal(get.status, 405);
});

const CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

test('automation: WebDriver, headless brands, Lighthouse, WebPageTest and crawlers are skipped', () => {
  assert.equal(isAutomatedBrowser({ webdriver: false, userAgent: CHROME }), false);
  assert.equal(isAutomatedBrowser({ webdriver: true, userAgent: CHROME }), true);
  assert.equal(
    isAutomatedBrowser({
      userAgent: CHROME,
      userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'HeadlessChrome' }] },
    }),
    true,
  );
  for (const ua of [
    CHROME.replace('Chrome/', 'HeadlessChrome/'),
    `${CHROME} Chrome-Lighthouse`,
    'Mozilla/5.0 (compatible; Lighthouse/12.0)',
    `${CHROME} PTST/250101.120000`,
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'Some-Crawler/1.0',
    'facebookexternalhit spider',
  ])
    assert.equal(isAutomatedAgent(ua), true, ua);
  assert.equal(isAutomatedAgent(CHROME), false);
  assert.equal(isAutomatedAgent(null), false);
});

test('beacons from automated user agents are dropped server-side', async () => {
  let called = 0;
  const pending: Promise<unknown>[] = [];
  const res = await handleRumBeacon(
    new Request('https://store.example/__hcms/rum', {
      method: 'POST',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Lighthouse/12.0) HeadlessChrome' },
      body: JSON.stringify({ metrics: { LCP: 900 } }),
    }),
    env,
    (p) => pending.push(p),
    (async () => {
      called++;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch,
  );
  await Promise.all(pending);
  assert.equal(res.status, 204);
  assert.equal(called, 0);
});

test('sampling: the beacon carries its rate and the admin answer sets the store rate', async () => {
  assert.equal(cleanRate(0.25), 0.25);
  assert.equal(cleanRate(0), 1);
  assert.equal(cleanRate(0.001), 1);
  assert.equal(cleanRate('0.5'), 1);
  assert.equal(parseBeacon(JSON.stringify({ metrics: { CLS: 0 }, rate: 0.5 }))?.rate, 0.5);
  setRumSampleRate(1);
  const bodies: string[] = [];
  const pending: Promise<unknown>[] = [];
  await handleRumBeacon(
    beacon({ template: 'index', metrics: { LCP: 900 }, rate: 0.5 }),
    env,
    (p) => pending.push(p),
    (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return Response.json({ rate: 0.2 });
    }) as unknown as typeof fetch,
  );
  await Promise.all(pending);
  assert.equal(JSON.parse(bodies[0] ?? '{}').rate, 0.5);
  assert.equal(rumSampleRate(), 0.2);
  // A junk or empty answer keeps the last good rate.
  await handleRumBeacon(
    beacon({ metrics: { LCP: 900 } }),
    env,
    (p) => pending.push(p),
    (async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
  );
  await Promise.all(pending);
  assert.equal(rumSampleRate(), 0.2);
  setRumSampleRate(1);
});

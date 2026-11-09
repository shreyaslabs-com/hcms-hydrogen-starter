import assert from 'node:assert/strict';
import test from 'node:test';

import { handleExposureBeacon, parseExposureBeacon } from '../app/lib/hcms/ab.ts';
import { sign } from '../app/lib/hcms/forms.ts';

const env = {
  HCMS_API_URL: 'https://admin.example.com/',
  HCMS_PREVIEW_SECRET: 's3cret',
  PUBLIC_STORE_DOMAIN: 'shop.myshopify.com',
};
const beacon = (body: unknown) =>
  new Request('https://store.example/__hcms/ab', { method: 'POST', body: JSON.stringify(body) });

test('parseExposureBeacon keeps valid experiment:arm pairs only', () => {
  assert.equal(
    parseExposureBeacon(JSON.stringify({ exp: 'exp_abcdef:b, bad:x,exp_123456:control,<x>' })),
    'exp_abcdef:b,exp_123456:control',
  );
  assert.equal(parseExposureBeacon(JSON.stringify({ exp: 'junk' })), null);
  assert.equal(parseExposureBeacon(JSON.stringify({ exp: 1 })), null);
  assert.equal(parseExposureBeacon('null'), null);
  assert.equal(parseExposureBeacon('nope'), null);
  assert.equal(parseExposureBeacon('x'.repeat(2000)), null);
});

test('answers 204 and forwards a signed payload in the background', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const pending: Promise<unknown>[] = [];
  const res = await handleExposureBeacon(
    beacon({ exp: 'exp_abcdef:b' }),
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
  assert.equal(call.url, 'https://admin.example.com/api/storefront/experiments');
  const payload = JSON.parse(String(call.init.body));
  assert.equal(payload.kind, 'ab');
  assert.equal(payload.exp, 'exp_abcdef:b');
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers['X-HCMS-Signature'], await sign('s3cret', String(call.init.body)));
});

test('nothing is forwarded without config or with junk; GET is refused', async () => {
  let called = 0;
  const count = (async () => {
    called++;
    throw new Error('down');
  }) as unknown as typeof fetch;
  const pending: Promise<unknown>[] = [];
  await handleExposureBeacon(beacon({ exp: 'exp_abcdef:b' }), {}, (p) => pending.push(p), count);
  await handleExposureBeacon(beacon({ exp: 'x' }), env, (p) => pending.push(p), count);
  await handleExposureBeacon(beacon({ exp: 'exp_abcdef:b' }), env, (p) => pending.push(p), count);
  await Promise.all(pending);
  assert.equal(called, 1);
  const get = await handleExposureBeacon(new Request('https://s.example/__hcms/ab'), env, () => {});
  assert.equal(get.status, 405);
});

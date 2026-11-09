import assert from 'node:assert/strict';
import test from 'node:test';

import { RATE_LIMIT, __test, handleFormPost } from '../app/lib/hcms/forms.ts';

const env = {
  HCMS_API_URL: 'https://admin.example.com/',
  HCMS_PREVIEW_SECRET: 's3cret',
  PUBLIC_STORE_DOMAIN: 'shop.myshopify.com',
};

function post(fields: Record<string, string>, headers: Record<string, string> = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request('https://store.example.com/fr-ca/__hcms/newsletter', {
    method: 'POST',
    body,
    headers,
  });
}

type Call = { url: string; init: RequestInit };
function fakeFetch(status = 200, json: unknown = { ok: true }) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json(json, { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

test('valid newsletter post forwards a signed payload and returns JSON', async () => {
  const { calls, impl } = fakeFetch();
  const res = await handleFormPost(
    post({ email: ' A@Example.com ', section: 'news-1' }, { Accept: 'application/json' }),
    'newsletter',
    env,
    impl,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call);
  assert.equal(call.url, 'https://admin.example.com/api/storefront/newsletter');
  const payload = JSON.parse(String(call.init.body));
  assert.equal(payload.shop, 'shop.myshopify.com');
  assert.deepEqual(payload.fields, { email: 'a@example.com' });
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers['X-HCMS-Signature'], await __test.sign('s3cret', String(call.init.body)));
});

test('no-JS post redirects to the same-origin referer with the success anchor', async () => {
  const { impl } = fakeFetch();
  const res = await handleFormPost(
    post(
      { email: 'a@example.com', section: 'news"<1' },
      { Referer: 'https://store.example.com/fr-ca/pages/about?x=1' },
    ),
    'newsletter',
    env,
    impl,
  );
  assert.equal(res.status, 303);
  assert.equal(
    res.headers.get('Location'),
    'https://store.example.com/fr-ca/pages/about?x=1#newsletter-news1-success',
  );
});

test('cross-origin referer falls back to the home page', async () => {
  const { impl } = fakeFetch();
  const res = await handleFormPost(
    post({ email: 'a@example.com', section: 's' }, { Referer: 'https://evil.example/x' }),
    'newsletter',
    env,
    impl,
  );
  assert.equal(res.headers.get('Location'), 'https://store.example.com/#newsletter-s-success');
});

test('honeypot pretends success without forwarding', async () => {
  const { calls, impl } = fakeFetch();
  const res = await handleFormPost(
    post({ email: 'a@example.com', hcms_hp: 'x' }, { Accept: 'application/json' }),
    'newsletter',
    env,
    impl,
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test('invalid input is rejected before forwarding', async () => {
  const { calls, impl } = fakeFetch();
  const json = { Accept: 'application/json' };
  const bad = await handleFormPost(post({ email: 'nope' }, json), 'newsletter', env, impl);
  assert.equal(bad.status, 422);
  const noMessage = await handleFormPost(post({ email: 'a@b.co' }, json), 'contact', env, impl);
  assert.equal(noMessage.status, 422);
  assert.equal(calls.length, 0);
});

test('contact forwards name, phone and message', async () => {
  const { calls, impl } = fakeFetch();
  await handleFormPost(
    post({ email: 'a@b.co', name: 'Ann', phone: '123', message: 'Hi' }),
    'contact',
    env,
    impl,
  );
  const [call] = calls;
  assert.ok(call);
  const payload = JSON.parse(String(call.init.body));
  assert.deepEqual(payload.fields, { email: 'a@b.co', name: 'Ann', phone: '123', message: 'Hi' });
  assert.match(call.url, /\/api\/storefront\/contact$/);
});

test('missing config answers 503; upstream errors map to clear statuses', async () => {
  const json = { Accept: 'application/json' };
  const off = await handleFormPost(
    post({ email: 'a@b.co' }, json),
    'newsletter',
    {},
    fakeFetch().impl,
  );
  assert.equal(off.status, 503);
  const limited = await handleFormPost(
    post({ email: 'a@b.co' }, json),
    'newsletter',
    env,
    fakeFetch(429).impl,
  );
  assert.equal(limited.status, 429);
  const invalid = await handleFormPost(
    post({ email: 'a@b.co' }, json),
    'newsletter',
    env,
    fakeFetch(422, { error: 'Already subscribed.' }).impl,
  );
  assert.deepEqual(await invalid.json(), { ok: false, error: 'Already subscribed.' });
  const failing = (async () => {
    throw new Error('down');
  }) as unknown as typeof fetch;
  const down = await handleFormPost(post({ email: 'a@b.co' }, json), 'newsletter', env, failing);
  assert.equal(down.status, 502);
});

test('GET is not allowed', async () => {
  const res = await handleFormPost(
    new Request('https://s.example/__hcms/newsletter'),
    'newsletter',
    env,
  );
  assert.equal(res.status, 405);
});

test('spam (T-2.49): cross-site POSTs are refused; same-origin and null Origin are fine', async () => {
  const { calls, impl } = fakeFetch();
  const evil = await handleFormPost(
    post({ email: 'a@b.co' }, { Origin: 'https://evil.example' }),
    'newsletter',
    env,
    impl,
  );
  assert.equal(evil.status, 403);
  assert.equal(calls.length, 0);
  for (const Origin of ['https://store.example.com', 'null']) {
    const ok = await handleFormPost(
      post({ email: 'a@b.co' }, { Origin, Accept: 'application/json' }),
      'newsletter',
      env,
      impl,
    );
    assert.equal(ok.status, 200);
  }
  assert.equal(calls.length, 2);
});

test('spam (T-2.49): instant submits pretend success; slow, old or missing stamps pass', async () => {
  const { calls, impl } = fakeFetch();
  const json = { Accept: 'application/json' };
  const fast = await handleFormPost(
    post({ email: 'a@b.co', hcms_ts: String(Date.now() - 300) }, json),
    'newsletter',
    env,
    impl,
  );
  assert.deepEqual(await fast.json(), { ok: true });
  assert.equal(calls.length, 0);
  for (const hcms_ts of [String(Date.now() - 5000), 'garbage', String(Date.now() + 60_000)]) {
    await handleFormPost(post({ email: 'a@b.co', hcms_ts }, json), 'newsletter', env, impl);
  }
  assert.equal(calls.length, 3);
});

test('spam (T-2.49): link-stuffed contact messages are dropped silently', async () => {
  const { calls, impl } = fakeFetch();
  const message = 'Buy now https://a.io http://b.io www.c.io [url=d.io]x[/url]';
  const res = await handleFormPost(
    post({ email: 'a@b.co', message }, { Accept: 'application/json' }),
    'contact',
    env,
    impl,
  );
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 0);
  await handleFormPost(
    post({ email: 'a@b.co', message: 'See https://a.io and https://b.io' }),
    'contact',
    env,
    impl,
  );
  assert.equal(calls.length, 1);
});

test('spam (T-2.49): per-IP limit answers 429 before reaching the admin', async () => {
  __test.resetRateLimit();
  const { calls, impl } = fakeFetch();
  const headers = { Accept: 'application/json', 'oxygen-buyer-ip': '203.0.113.9' };
  const statuses: number[] = [];
  for (let i = 0; i < RATE_LIMIT.max + 1; i++) {
    const res = await handleFormPost(post({ email: 'a@b.co' }, headers), 'newsletter', env, impl);
    statuses.push(res.status);
  }
  assert.equal(statuses.at(-1), 429);
  assert.equal(calls.length, RATE_LIMIT.max);
  assert.equal(
    (calls[0]?.init.headers as Record<string, string>)['X-HCMS-Buyer-IP'],
    '203.0.113.9',
  );
  const other = await handleFormPost(
    post({ email: 'a@b.co' }, { ...headers, 'oxygen-buyer-ip': '203.0.113.10' }),
    'newsletter',
    env,
    impl,
  );
  assert.equal(other.status, 200);
  __test.resetRateLimit();
});

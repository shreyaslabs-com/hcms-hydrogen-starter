import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { reportHealth, reportPage } from '../app/lib/hcms/health-report.ts';

const env = {
  HCMS_API_URL: 'https://admin.example/',
  HCMS_PREVIEW_SECRET: 'secret',
  PUBLIC_STORE_DOMAIN: 'shop.myshopify.com',
};

describe('storefront-reported health (T-1.5.1, private environments)', () => {
  it('posts the report to the admin, signed with the preview secret', async () => {
    let call: { url: string; init: RequestInit } | null = null;
    const result = await reportHealth({
      report: { sdkVersion: '1.0.0' },
      env,
      origin: 'https://store.o2.myshopify.dev',
      previewVerified: true,
      now: () => 1_000_000_000_000,
      fetchImpl: (async (url: string, init: RequestInit) => {
        call = { url, init };
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    assert.equal(result.ok, true);
    assert.ok(call);
    const { url, init } = call as { url: string; init: RequestInit };
    assert.equal(url, 'https://admin.example/api/storefront/health');
    const body = String(init.body);
    assert.deepEqual(JSON.parse(body), {
      shop: 'shop.myshopify.com',
      kind: 'health',
      ts: 1_000_000_000,
      url: 'https://store.o2.myshopify.dev',
      report: { sdkVersion: '1.0.0' },
    });
    const headers = init.headers as Record<string, string>;
    assert.equal(headers['X-HCMS-Shop'], 'shop.myshopify.com');
    assert.equal(
      headers['X-HCMS-Signature'],
      createHmac('sha256', 'secret').update(body).digest('base64url'),
    );
  });

  it('explains missing settings, an unverified link and admin errors without posting', async () => {
    const never = (async () => {
      throw new Error('should not fetch');
    }) as typeof fetch;
    const base = { report: {}, origin: 'https://s.dev', fetchImpl: never };
    assert.match(
      (await reportHealth({ ...base, env: { ...env, HCMS_API_URL: '' }, previewVerified: true }))
        .message,
      /HCMS_API_URL/,
    );
    assert.match(
      (await reportHealth({ ...base, env, previewVerified: false })).message,
      /doesn’t match/,
    );
    const rejected = await reportHealth({
      ...base,
      env,
      previewVerified: true,
      fetchImpl: (async () => new Response(null, { status: 401 })) as typeof fetch,
    });
    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /signature/);
    const down = await reportHealth({
      ...base,
      env,
      previewVerified: true,
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch,
    });
    assert.match(down.message, /tunnel/);
    const stale = await reportHealth({
      ...base,
      env,
      previewVerified: true,
      fetchImpl: (async () => new Response(null, { status: 530 })) as typeof fetch,
    });
    assert.match(stale.message, /tunnel/);
  });

  it('renders a script-free, escaped page', async () => {
    const res = reportPage({ ok: false, message: '<b>x</b>' });
    assert.equal(res.status, 422);
    const html = await res.text();
    assert.ok(!html.includes('<b>') && !html.includes('<script'));
  });
});

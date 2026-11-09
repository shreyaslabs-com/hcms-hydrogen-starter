import assert from 'node:assert/strict';
import test from 'node:test';

import { contentSecurityPolicy, createNonce } from '../app/lib/csp.ts';

const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

test('csp: nonce per response, base64 and unique', () => {
  const a = createNonce();
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.notEqual(a, createNonce());
});

test('csp: production policy', () => {
  const policy = contentSecurityPolicy({
    nonce: 'abc',
    shopDomain: 'demo.myshopify.com',
    checkoutDomain: 'checkout.demo.com',
  });
  assert.ok(directive(policy, 'script-src').includes("'nonce-abc'"));
  const scripts = directive(policy, 'script-src');
  assert.ok(scripts.includes('https://cdn.shopify.com/shopifycloud/'));
  assert.ok(!/https:\/\/cdn\.shopify\.com(\s|$)/.test(scripts), 'merchant Files are not scripts');
  assert.ok(
    scripts.includes('model-viewer.min.js') && !/ajax\.googleapis\.com(\s|$)/.test(scripts),
  );
  assert.ok(!directive(policy, 'script-src').includes("'unsafe-inline'"));
  assert.ok(directive(policy, 'connect-src').includes('https://demo.myshopify.com'));
  assert.ok(directive(policy, 'form-action').includes('https://checkout.demo.com'));
  assert.ok(directive(policy, 'frame-src').includes('https://www.youtube-nocookie.com'));
  assert.equal(directive(policy, 'object-src'), "object-src 'none'");
  assert.ok(policy.endsWith('upgrade-insecure-requests'));
  assert.ok(!policy.includes('localhost'));
  assert.ok(!policy.includes('frame-ancestors'), 'left to applyPreviewHeaders');
});

test('csp: dev allows the Vite websocket; bad domains are dropped', () => {
  const policy = contentSecurityPolicy({ nonce: 'n', shopDomain: 'x y;', dev: true });
  assert.ok(directive(policy, 'connect-src').includes('ws://localhost:*'));
  assert.ok(!policy.includes('x y'));
  assert.ok(!policy.includes('upgrade-insecure-requests'));
});

test('csp: Adobe Fonts hosts only when the theme has a project (T-2.73)', () => {
  const off = contentSecurityPolicy({ nonce: 'n' });
  assert.ok(!off.includes('typekit'));
  // Uploaded fonts come from Shopify Files (cdn.shopify.com), already a font source.
  assert.ok(directive(off, 'font-src').includes('https://cdn.shopify.com'));
  const on = contentSecurityPolicy({ nonce: 'n', adobeFonts: true });
  for (const name of ['style-src', 'font-src']) {
    assert.ok(directive(on, name).includes('https://use.typekit.net'), name);
    assert.ok(directive(on, name).includes('https://p.typekit.net'), name);
  }
  assert.ok(!directive(on, 'script-src').includes('typekit'));
});

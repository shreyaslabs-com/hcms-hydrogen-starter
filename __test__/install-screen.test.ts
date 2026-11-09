import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_INSTALL_URL,
  installScreenHtml,
  installScreenResponse,
  installUrl,
  isInstallScreenExempt,
  missingHcmsEnv,
  needsInstallScreen,
} from '../app/lib/hcms/install-screen.ts';

const realStore = {
  PRIVATE_STOREFRONT_API_TOKEN: 'private-token',
  PUBLIC_STORE_DOMAIN: 'acme.myshopify.com',
};
const configured = {
  ...realStore,
  HCMS_API_URL: 'https://app.example.com',
  HCMS_PREVIEW_SECRET: 'secret-value-123',
  HCMS_PUBLIC_KEY: 'public-key-456',
};

test('shows only on a real store with no HydrogenCMS variable at all', () => {
  assert.equal(needsInstallScreen(realStore), true);
  assert.equal(needsInstallScreen({ ...realStore, HCMS_API_URL: '  ' }), true, 'blank = unset');
  assert.equal(needsInstallScreen(configured), false);
});

test('never replaces the mock.shop demo or local development without a store token', () => {
  assert.equal(needsInstallScreen({}), false);
  assert.equal(needsInstallScreen({ ...realStore, MOCK_SHOP: '1' }), false);
  assert.equal(needsInstallScreen({ ...realStore, PUBLIC_STORE_DOMAIN: 'pets.mock.shop' }), false);
});

test('a partly configured storefront keeps rendering (fallback chain), missing names are known', () => {
  const partial = { ...realStore, HCMS_PREVIEW_SECRET: 's' };
  assert.equal(needsInstallScreen(partial), false);
  assert.deepEqual(missingHcmsEnv(partial), ['HCMS_API_URL', 'HCMS_PUBLIC_KEY']);
  assert.deepEqual(missingHcmsEnv(configured), []);
});

test('decided from the environment only: an unreachable API never shows it', () => {
  // A configured storefront whose API URL points nowhere is still "configured".
  assert.equal(needsInstallScreen({ ...configured, HCMS_API_URL: 'https://down.invalid' }), false);
});

test('/__hcms/* stays reachable, also under a market prefix', () => {
  assert.equal(isInstallScreenExempt('/__hcms/health'), true);
  assert.equal(isInstallScreenExempt('/__hcms/manifest'), true);
  assert.equal(isInstallScreenExempt('/en-ca/__hcms/section'), true);
  assert.equal(isInstallScreenExempt('/'), false);
  assert.equal(isInstallScreenExempt('/__hcmsx'), false);
  assert.equal(isInstallScreenExempt('/collections/all/__hcms/health'), false);
});

test('install link: HCMS_INSTALL_URL when it is http(s), else the default', () => {
  assert.equal(installUrl({}), DEFAULT_INSTALL_URL);
  assert.equal(
    installUrl({ HCMS_INSTALL_URL: 'https://apps.shopify.com/x' }),
    'https://apps.shopify.com/x',
  );
  assert.equal(installUrl({ HCMS_INSTALL_URL: 'javascript:alert(1)' }), DEFAULT_INSTALL_URL);
  assert.equal(installUrl({ HCMS_INSTALL_URL: 'not a url' }), DEFAULT_INSTALL_URL);
});

test('HTML: heading, steps, button, missing names, no script, escaped link', () => {
  const html = installScreenHtml({
    missing: ['HCMS_API_URL', 'HCMS_PUBLIC_KEY'],
    installHref: 'https://example.com/?a=1&b="2"',
  });
  assert.match(html, /This storefront runs on HydrogenCMS/);
  assert.match(html, /Install HydrogenCMS<\/a>/);
  assert.match(html, /Connect your storefront/);
  assert.match(html, /Redeploy/);
  assert.match(html, /<code>HCMS_API_URL<\/code>/);
  assert.match(html, /<code>HCMS_PUBLIC_KEY<\/code>/);
  assert.doesNotMatch(html, /HCMS_PREVIEW_SECRET/);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=&quot;2&quot;"/);
});

test('response: names only (never values), 503, no-store, noindex, no scripts allowed', async () => {
  const env = { ...realStore, HCMS_INSTALL_URL: 'https://apps.shopify.com/hydrogencms' };
  const response = installScreenResponse(env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
  const body = await response.text();
  for (const name of ['HCMS_API_URL', 'HCMS_PREVIEW_SECRET', 'HCMS_PUBLIC_KEY'])
    assert.ok(body.includes(name), name);
  assert.ok(!body.includes('private-token'));
  assert.ok(body.includes('href="https://apps.shopify.com/hydrogencms"'));
  assert.equal(await installScreenResponse(env, 'HEAD').text(), '');
});

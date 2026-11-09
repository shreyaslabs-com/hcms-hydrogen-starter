import assert from 'node:assert/strict';
import test from 'node:test';

import { FALLBACK_FAVICON, faviconLinks, faviconValue } from '../app/lib/hcms/favicon.ts';

test('no image = the starter favicon.svg', () => {
  assert.deepEqual(faviconLinks(null), FALLBACK_FAVICON);
  assert.deepEqual(faviconLinks(undefined), FALLBACK_FAVICON);
  assert.deepEqual(faviconLinks('javascript:alert(1)'), FALLBACK_FAVICON);
  assert.deepEqual(faviconLinks('not a url'), FALLBACK_FAVICON);
});

test('Shopify CDN image cropped 32 px icon + 180 px apple-touch-icon', () => {
  const links = faviconLinks('https://cdn.shopify.com/s/files/1/fav.png?v=2');
  assert.equal(links.length, 2);
  assert.equal(links[0]?.rel, 'icon');
  assert.equal(links[0]?.sizes, '32x32');
  assert.match(links[0]?.href ?? '', /width=32&height=32&crop=center/);
  assert.equal(links[1]?.rel, 'apple-touch-icon');
  assert.match(links[1]?.href ?? '', /width=180&height=180&crop=center/);
});

test('other hosts pass through unchanged', () => {
  const links = faviconLinks('https://example.com/icon.png');
  assert.equal(links[0]?.href, 'https://example.com/icon.png');
});

test('reads settings.favicon tolerantly', () => {
  assert.equal(faviconValue(undefined), null);
  assert.equal(faviconValue([]), null);
  assert.deepEqual(faviconValue({ favicon: { $file: 'gid://shopify/MediaImage/1' } }), {
    $file: 'gid://shopify/MediaImage/1',
  });
});

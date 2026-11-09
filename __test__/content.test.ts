import assert from 'node:assert/strict';
import test from 'node:test';

import { humanize } from '../app/lib/content.ts';
import { shopifyImageUrl } from '../app/lib/image.ts';

test('shopifyImageUrl adds size params and keeps the existing query', () => {
  assert.equal(
    shopifyImageUrl('https://cdn.shopify.com/s/files/1/a.jpg?v=17', { width: 799.6 }),
    'https://cdn.shopify.com/s/files/1/a.jpg?v=17&width=800',
  );
  assert.equal(
    shopifyImageUrl('https://cdn.shopify.com/a.jpg', { width: 400, height: 300, crop: 'center' }),
    'https://cdn.shopify.com/a.jpg?width=400&height=300&crop=center',
  );
});

test('shopifyImageUrl leaves invalid or unsized URLs alone', () => {
  assert.equal(shopifyImageUrl('not a url', { width: 100 }), 'not a url');
  assert.equal(shopifyImageUrl('https://cdn.shopify.com/a.jpg'), 'https://cdn.shopify.com/a.jpg');
});

test('humanize turns keys and types into labels', () => {
  assert.equal(humanize('store_location'), 'Store location');
  assert.equal(humanize('meet-the-maker'), 'Meet the maker');
  assert.equal(humanize(''), '');
});

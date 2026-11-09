import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cartUpsellEnabled,
  upsellItems,
  upsellSeed,
  type UpsellProduct,
} from '../app/lib/hcms/upsell.ts';

const product = (handle: string, opts: { variants?: number; available?: boolean } = {}) =>
  ({
    id: `gid://shopify/Product/${handle}`,
    handle,
    title: handle.toUpperCase(),
    availableForSale: opts.available ?? true,
    featuredImage: { url: `https://cdn.shopify.com/${handle}.jpg`, altText: null },
    variantsCount: { count: opts.variants ?? 1 },
    selectedOrFirstAvailableVariant: {
      id: `gid://shopify/ProductVariant/${handle}`,
      title: 'Default Title',
      availableForSale: opts.available ?? true,
      price: { amount: '10.0', currencyCode: 'USD' },
    },
  }) satisfies UpsellProduct;

test('upsell (T-2.43): complementary first, related as the fallback', () => {
  const data = { complementary: [product('a')], related: [product('b')] };
  assert.deepEqual(
    upsellItems(data).map((i) => i.handle),
    ['a'],
  );
  assert.deepEqual(
    upsellItems({ complementary: [], related: [product('b')] }).map((i) => i.handle),
    ['b'],
  );
  // Complementary products all in the cart → related.
  assert.deepEqual(
    upsellItems(data, ['a']).map((i) => i.handle),
    ['b'],
  );
  assert.deepEqual(upsellItems(null), []);
});

test('upsell: drops cart items, sold-out and duplicates; caps the list', () => {
  const related = [
    product('a'),
    product('b', { available: false }),
    product('a'),
    product('c'),
    product('d'),
    product('e'),
  ];
  assert.deepEqual(
    upsellItems({ related }, ['c']).map((i) => i.handle),
    ['a', 'd', 'e'],
  );
  assert.equal(upsellItems({ related }, [], 2).length, 2);
});

test('upsell: one-click add only for single-variant products; server prices untouched', () => {
  const [single, multi] = upsellItems({ related: [product('a'), product('b', { variants: 3 })] });
  assert.equal(single?.variantId, 'gid://shopify/ProductVariant/a');
  assert.deepEqual(single?.price, { amount: '10.0', currencyCode: 'USD' });
  assert.equal(multi?.variantId, null);
});

test('upsell seed: first line handle (validated) and every handle in the cart', () => {
  const lines = [
    { merchandise: { product: { handle: 'shirt' } } },
    { merchandise: null },
    { merchandise: { product: { handle: 'hat' } } },
  ];
  assert.deepEqual(upsellSeed(lines), { handle: 'shirt', inCart: ['shirt', 'hat'] });
  assert.deepEqual(upsellSeed([]), { handle: null, inCart: [] });
  assert.equal(upsellSeed([{ merchandise: { product: { handle: 'bad/../x' } } }]).handle, null);
});

test('main-cart show_upsell setting (default on)', () => {
  const doc = (settings: Record<string, unknown>, disabled = false) => ({
    templates: { cart: { sections: { main: { type: 'main-cart', disabled, settings } } } },
  });
  assert.equal(cartUpsellEnabled({}), true);
  assert.equal(cartUpsellEnabled(null), true);
  assert.equal(cartUpsellEnabled(doc({})), true);
  assert.equal(cartUpsellEnabled(doc({ show_upsell: false })), false);
  assert.equal(cartUpsellEnabled(doc({ show_upsell: 'false' })), true);
  assert.equal(cartUpsellEnabled(doc({ show_upsell: false }, true)), true);
});

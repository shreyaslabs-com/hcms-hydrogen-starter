/**
 * Cart page summary (templates review, Nov 9): total and Checkout come first, the discount code,
 * gift message and order note after them, the last two as closed `<details>` rows; bigger line
 * thumbnails; the cross-sell rail as product cards. Source-level checks (node:test can't render
 * the cart store), kept next to the files they pin.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (file: string) =>
  readFileSync(new URL(`../app/components/${file}`, import.meta.url), 'utf8');

test('summary order: free shipping → total → Checkout → payments → discount → gift → note', () => {
  const lines = source('CartPageLines.tsx');
  const aside = lines.slice(lines.indexOf('<aside'));
  const at = (needle: string) => {
    const i = aside.indexOf(needle);
    assert.ok(i >= 0, `missing ${needle}`);
    return i;
  };
  const order = [
    '<CartFreeShippingBar',
    'Estimated total',
    'href={cart.checkoutUrl}',
    '<ShopPayButton',
    '<CartPaymentIcons',
    '<CartDiscounts',
    '<CartGifts collapsed',
    '<CartNoteDisclosure',
  ].map(at);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
});

test('gift message and order note are closed disclosures, open once a value is saved', () => {
  const gifts = source('CartGifts.tsx');
  assert.match(
    gifts,
    /collapsed \? \(\s*<details className="hcms-cart-disclosure" open=\{saved \? true : undefined\}>/,
  );
  const extras = source('CartExtras.tsx');
  assert.match(
    extras,
    /<details className="hcms-cart-disclosure[^"]*" open=\{note \? true : undefined\}>/,
  );
});

test('cart page thumbnails are larger than the drawer’s and sized on the CDN', () => {
  assert.match(source('CartPageLines.tsx'), /imageClassName="size-24 sm:size-32"/);
  const item = source('CartLineItem.tsx');
  assert.match(item, /imageClassName = 'size-20'/);
  assert.match(item, /shopifyImageUrl\(merchandise\.image\.url, \{ width: 256 \}\)/);
});

test('cart page cross-sell: product cards, 2 per row on phones and 4 from lg', () => {
  const upsell = source('CartUpsell.tsx');
  assert.match(upsell, /grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4/);
  assert.match(upsell, /const PAGE_ITEMS = 4;/);
});

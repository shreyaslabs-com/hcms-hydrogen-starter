import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCartAddForm } from '../app/lib/hcms/cart-add.ts';
import {
  GIFT_WRAP_VARIANT,
  GIFT_MESSAGE_KEY,
  cartGiftsForDocument,
  giftWrapLine,
  onlyGiftWrap,
  otherAttributes,
} from '../app/lib/hcms/cart-gifts.ts';

const WRAP = 'gid://shopify/ProductVariant/42';
const line = (id: string, variant: string) => ({ id, merchandise: { id: variant } });

test('gift options (T-2.80) come from theme cart settings', () => {
  assert.equal(cartGiftsForDocument(null), null);
  assert.equal(cartGiftsForDocument({ settings: { cart: { type: 'drawer' } } }), null);
  assert.deepEqual(
    cartGiftsForDocument({ settings: { cart: { gift_wrap_variant: WRAP, gift_message: true } } }),
    { wrapVariantId: WRAP, message: true },
  );
  // Never a product GID or junk: the checkbox would add something else.
  assert.equal(
    cartGiftsForDocument({ settings: { cart: { gift_wrap_variant: 'gid://shopify/Product/1' } } }),
    null,
  );
});

test('gift wrap line lookup and the "only gift wrap left" rule', () => {
  const lines = [line('a', 'gid://shopify/ProductVariant/1'), line('w', WRAP)];
  assert.equal(giftWrapLine(lines, WRAP)?.id, 'w');
  assert.equal(giftWrapLine(lines.slice(0, 1), WRAP), undefined);
  assert.equal(onlyGiftWrap(lines, WRAP), false);
  assert.equal(onlyGiftWrap([line('w', WRAP)], WRAP), true);
  assert.equal(onlyGiftWrap([], WRAP), false);
});

test('the no-JS gift wrap form is a valid /__hcms/cart/add post', () => {
  const form = new FormData();
  form.set('gift_wrap', 'on');
  form.set('merchandiseId', WRAP);
  form.set('quantity', '1');
  form.set('return_to', '/en-in/cart');
  assert.deepEqual(parseCartAddForm(form), {
    line: { merchandiseId: WRAP, quantity: 1 },
    returnTo: '/en-in/cart',
  });
});

test('a gift message save resends every other cart attribute', () => {
  assert.equal(GIFT_MESSAGE_KEY, 'Gift message');
  assert.deepEqual(
    otherAttributes([
      { key: '_hcms_exp', value: 'hero:b' },
      { key: GIFT_MESSAGE_KEY, value: 'Happy birthday' },
      { key: 'Delivery date', value: null },
    ]),
    [
      { key: '_hcms_exp', value: 'hero:b' },
      { key: 'Delivery date', value: '' },
    ],
  );
  assert.deepEqual(otherAttributes(null), []);
});

test('the gift-wrap price route only accepts a variant GID (App Store 1.1.9)', () => {
  assert.ok(GIFT_WRAP_VARIANT.test('gid://shopify/ProductVariant/123'));
  assert.ok(!GIFT_WRAP_VARIANT.test('gid://shopify/Product/123'));
  assert.ok(!GIFT_WRAP_VARIANT.test('gid://shopify/ProductVariant/1 OR 1'));
});

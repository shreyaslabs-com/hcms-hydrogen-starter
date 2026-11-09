import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cartFreeShippingFrom } from '../app/lib/hcms/free-shipping.ts';

test('free-shipping bar settings (T-2.43): thresholds from theme settings, drawer toggle from main-cart', () => {
  const doc = (thresholds: unknown, mainCart?: Record<string, unknown>) => ({
    settings: { cart: { type: 'page', free_shipping_thresholds: thresholds } },
    templates: mainCart
      ? { cart: { sections: { main: { type: 'main-cart', settings: mainCart } } } }
      : {},
  });
  assert.deepEqual(cartFreeShippingFrom(null), { thresholds: null, drawer: true });
  assert.deepEqual(cartFreeShippingFrom(doc(undefined)), { thresholds: null, drawer: true });
  assert.deepEqual(cartFreeShippingFrom(doc({ USD: '75', EUR: '70.50' })), {
    thresholds: { USD: [{ amount: '75' }], EUR: [{ amount: '70.50' }] },
    drawer: true,
  });
  // Invalid entries (bad code, number, non-positive) are dropped, never guessed.
  assert.deepEqual(cartFreeShippingFrom(doc({ usd: '75', GBP: 60, JPY: '0', INR: '5000' })), {
    thresholds: { INR: [{ amount: '5000' }] },
    drawer: true,
  });
  assert.deepEqual(cartFreeShippingFrom(doc({ USD: '75' }, { show_free_shipping: false })), {
    thresholds: { USD: [{ amount: '75' }] },
    drawer: false,
  });
});

test('tiered cart goals (T-2.69): labelled goals per currency reach the root loader', () => {
  const goals = [
    { amount: '999', label: 'Free shipping' },
    { amount: '1999', label: 'Free gift' },
  ];
  assert.deepEqual(
    cartFreeShippingFrom({ settings: { cart: { free_shipping_thresholds: { INR: goals } } } }),
    { thresholds: { INR: goals }, drawer: true },
  );
});

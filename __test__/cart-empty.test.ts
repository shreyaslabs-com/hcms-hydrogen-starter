import assert from 'node:assert/strict';
import test from 'node:test';

import { cartEmptyForDocument } from '../app/lib/hcms/cart-display.ts';

test('drawer empty state: unset = null (default copy in CartDrawer)', () => {
  assert.equal(cartEmptyForDocument(null), null);
  assert.equal(cartEmptyForDocument({ settings: { cart: {} } }), null);
});

test('drawer empty state from theme cart settings, unsafe links dropped', () => {
  assert.deepEqual(
    cartEmptyForDocument({
      settings: {
        cart: {
          empty_text: 'Your bag is empty',
          empty_button_label: 'Shop new arrivals',
          empty_button_link: '/collections/new',
        },
      },
    }),
    { text: 'Your bag is empty', buttonLabel: 'Shop new arrivals', buttonLink: '/collections/new' },
  );
  assert.equal(
    cartEmptyForDocument({
      settings: { cart: { empty_text: 'x', empty_button_link: 'javascript:1' } },
    })?.buttonLink,
    '/collections',
  );
});

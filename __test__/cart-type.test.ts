import assert from 'node:assert/strict';
import test from 'node:test';

import { cartTypeFrom } from '../app/lib/hcms/cart-type-setting.ts';

test('cart type theme setting (T-2.43): drawer by default, page/notification when set', () => {
  assert.equal(cartTypeFrom({}), 'drawer');
  assert.equal(cartTypeFrom(null), 'drawer');
  assert.equal(cartTypeFrom({ cart: { type: 'page' } }), 'page');
  assert.equal(cartTypeFrom({ cart: { type: 'notification' } }), 'notification');
  assert.equal(cartTypeFrom({ cart: { type: 'popup<script>' } }), 'drawer');
});

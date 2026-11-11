import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { cartDrawerForDocument } from '../app/lib/hcms/cart-display.ts';
import {
  CHECKOUT_STARTED_EVENT,
  dispatchCheckoutStarted,
  publishAfterSettle,
} from '../app/lib/hcms/checkout-started.ts';
import { cartFreeShippingFrom } from '../app/lib/hcms/free-shipping.ts';
import { parseUpsellRequest, upsellItems, upsellQuery } from '../app/lib/hcms/upsell.ts';

const doc = (cart: Record<string, unknown>, mainCart?: Record<string, unknown>) => ({
  settings: { cart },
  templates: mainCart
    ? { cart: { sections: { main: { type: 'main-cart', settings: mainCart } } } }
    : {},
});

const product = (handle: string) => ({
  id: `gid://shopify/Product/${handle.length}`,
  handle,
  title: handle,
  availableForSale: true,
  variantsCount: { count: 1 },
  selectedOrFirstAvailableVariant: {
    id: `v-${handle}`,
    title: 'Default',
    availableForSale: true,
    price: { amount: '1', currencyCode: 'INR' },
  },
});

describe('cart drawer config (T-2.159)', () => {
  it('keeps today’s drawer by default (upsell follows main-cart show_upsell)', () => {
    assert.deepEqual(cartDrawerForDocument(doc({})), {
      showUpsell: true,
      upsellLayout: 'list',
      fallbackCollection: null,
      badgePrefix: '',
      nudges: [],
      layout: 'classic',
      acceleratedCheckout: true,
      paymentLogos: false,
    });
    assert.equal(cartDrawerForDocument(doc({}, { show_upsell: false })).showUpsell, false);
  });

  it('the drawer upsell setting is independent of the cart page', () => {
    assert.equal(
      cartDrawerForDocument(doc({ drawer_upsell: 'show' }, { show_upsell: false })).showUpsell,
      true,
    );
    assert.equal(
      cartDrawerForDocument(doc({ drawer_upsell: 'hide' }, { show_upsell: true })).showUpsell,
      false,
    );
  });

  it('passes layouts, Shop Pay, payment logos, badges and nudges through', () => {
    const config = cartDrawerForDocument(
      doc({
        upsell_layout: 'cards',
        drawer_layout: 'summary_card',
        show_accelerated_checkout: false,
        drawer_payment_logos: true,
        cart_line_badge_prefix: 'badge:',
        line_nudges: [{ tag: 'b1g1', quantity: 2, text: 'Add {remaining} more to get 1 FREE' }],
      }),
    );
    assert.equal(config.upsellLayout, 'cards');
    assert.equal(config.layout, 'summary_card');
    assert.equal(config.acceleratedCheckout, false);
    assert.equal(config.paymentLogos, true);
    assert.equal(config.badgePrefix, 'badge:');
    assert.equal(config.nudges.length, 1);
  });
});

describe('item-count goals reach the bar (T-2.159)', () => {
  it('only with goal type item_count and goals', () => {
    const goals = [{ count: 2, label: 'B1G1' }, { count: 4 }];
    assert.deepEqual(
      cartFreeShippingFrom(doc({ cart_goal_type: 'item_count', item_count_goals: goals })),
      {
        thresholds: null,
        drawer: true,
        itemGoals: goals,
      },
    );
    // Amount type (default) ignores stored item goals.
    assert.equal('itemGoals' in cartFreeShippingFrom(doc({ item_count_goals: goals })), false);
    assert.equal(
      'itemGoals' in
        cartFreeShippingFrom(doc({ cart_goal_type: 'item_count', item_count_goals: [] })),
      false,
    );
  });
});

describe('upsell fallback collection (T-2.159)', () => {
  it('asks for the fallback with the automatic rail only', () => {
    const q = new URLSearchParams(upsellQuery([{ source: 'auto' }], 'tee', 'best-sellers'));
    assert.equal(q.get('fc'), 'best-sellers');
    assert.equal(parseUpsellRequest(q).fallback, 'best-sellers');
    const noAuto = upsellQuery(
      [{ source: 'collection', collection: 'sale' }],
      'tee',
      'best-sellers',
    );
    assert.equal(new URLSearchParams(noAuto).get('fc'), null);
    assert.equal(
      new URLSearchParams(upsellQuery([{ source: 'auto' }], 'tee', '../x')).get('fc'),
      null,
    );
    assert.equal(parseUpsellRequest(new URLSearchParams({ fc: 'a b' })).fallback, null);
  });

  it('shows the fallback only when recommendations are empty (new stores)', () => {
    const fallback = [product('mug'), product('tee')];
    assert.deepEqual(
      upsellItems({ complementary: [], related: [], fallback }, ['tee']).map((i) => i.handle),
      ['mug'],
    );
    assert.deepEqual(
      upsellItems({ related: [product('cap')], fallback }).map((i) => i.handle),
      ['cap'],
    );
  });
});

describe('checkout_started for the plain Buy now path (T-2.159)', () => {
  it('dispatches hcms:checkout_started with the cart', () => {
    const target = new EventTarget();
    const seen: unknown[] = [];
    target.addEventListener(CHECKOUT_STARTED_EVENT, (e) => seen.push((e as CustomEvent).detail));
    dispatchCheckoutStarted(target, { id: 'c1' });
    assert.deepEqual(seen, [{ cart: { id: 'c1' } }]);
  });

  it('publishes the cart as it is after the add settled', async () => {
    let cart = 'before';
    const published: string[] = [];
    await publishAfterSettle(
      () => cart,
      (c) => published.push(c),
      async () => {
        cart = 'after'; // the store projected the Buy now line while we waited
      },
    );
    assert.deepEqual(published, ['after']);
  });

  it('PlainBuyNow fires it before leaving for checkout', () => {
    const source = readFileSync(
      new URL('../app/components/product/HcmsProductForm.tsx', import.meta.url),
      'utf8',
    );
    const plain = source.slice(source.indexOf('function PlainBuyNow'));
    assert.match(plain, /const checkoutStarted = useCheckoutStarted\(\);/);
    assert.ok(
      plain.indexOf('await checkoutStarted();') < plain.indexOf("localize('/checkout')"),
      'event before navigation',
    );
  });
});

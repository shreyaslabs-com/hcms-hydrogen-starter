import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commerceEvent,
  createDeduper,
  dataLayerEvent,
  eventId,
  gtagEvent,
  metaEvent,
  pinterestEvent,
  tiktokEvent,
  type CommerceEvent,
} from '../app/lib/hcms/ad-events.ts';

function must<T>(value: T | null): T {
  assert.ok(value);
  return value;
}

const usd = (amount: string) => ({ amount, currencyCode: 'USD' });

const productViewed = {
  products: [
    {
      id: 'gid://shopify/Product/111',
      title: 'Snowboard',
      vendor: 'Hydrogen',
      price: usd('600.0'),
      variantId: 'gid://shopify/ProductVariant/222',
      variantTitle: '154cm / Blue',
      quantity: 1,
      sku: 'SB-154',
    },
  ],
};

const line = (qty: number) => ({
  id: 'gid://shopify/CartLine/1',
  quantity: qty,
  merchandise: {
    id: 'gid://shopify/ProductVariant/222',
    title: '154cm / Blue',
    sku: 'SB-154',
    price: usd('600.0'),
    product: { id: 'gid://shopify/Product/111', title: 'Snowboard', vendor: 'Hydrogen' },
  },
});

const cart = {
  id: 'gid://shopify/Cart/abc',
  updatedAt: '2026-11-07T10:00:00Z',
  lines: {
    nodes: [
      line(2),
      {
        quantity: 1,
        merchandise: {
          id: 'gid://shopify/ProductVariant/333',
          title: 'Default Title',
          price: usd('25.5'),
          product: { id: 'gid://shopify/Product/444', title: 'Wax', vendor: '' },
        },
      },
    ],
  },
};

function event(name: string, payload: unknown): CommerceEvent {
  const e = commerceEvent(name, payload, 'CAD');
  assert.ok(e, name);
  return e;
}

test('ad events: product_viewed → GA4 view_item with Merchant Center ids', () => {
  const e = event('product_viewed', productViewed);
  assert.equal(e.kind, 'view_item');
  assert.deepEqual(gtagEvent(e, 'US'), [
    'view_item',
    {
      currency: 'USD',
      value: 600,
      items: [
        {
          item_id: 'shopify_US_111_222',
          id: 'shopify_US_111_222',
          item_name: 'Snowboard',
          item_brand: 'Hydrogen',
          item_variant: '154cm / Blue',
          price: 600,
          quantity: 1,
          google_business_vertical: 'retail',
        },
      ],
    },
  ]);
  const [name, params, opts] = must(metaEvent(e, 'ev1'));
  assert.equal(name, 'ViewContent');
  assert.deepEqual(params.content_ids, ['222']);
  assert.equal(params.content_type, 'product');
  assert.equal(params.value, 600);
  assert.equal(params.currency, 'USD');
  assert.deepEqual(opts, { eventID: 'ev1' });
  const tt = must(tiktokEvent(e, 'ev1'));
  assert.equal(tt[0], 'ViewContent');
  assert.deepEqual(tt[2], { event_id: 'ev1' });
  assert.equal((tt[1].contents as { content_id: string }[])[0]?.content_id, '222');
  assert.equal(pinterestEvent(e, 'ev1'), null, 'Pinterest has no view-item event in our map');
});

test('ad events: add to cart counts only the added quantity', () => {
  const e = event('product_added_to_cart', {
    cart,
    prevLine: line(1),
    currentLine: line(3),
  });
  assert.equal(e.kind, 'add_to_cart');
  assert.equal(e.items[0]?.quantity, 2);
  assert.equal(e.value, 1200);
  assert.equal(gtagEvent(e, 'ZZ')[0], 'add_to_cart');
  assert.equal(
    (gtagEvent(e, 'ZZ')[1].items as { item_id: string }[])[0]?.item_id,
    'shopify_ZZ_111_222',
  );
  assert.equal(metaEvent(e, 'x')?.[0], 'AddToCart');
  assert.equal(tiktokEvent(e, 'x')?.[0], 'AddToCart');
  const [pin, pinParams] = must(pinterestEvent(e, 'x'));
  assert.equal(pin, 'addtocart');
  assert.equal(pinParams.order_quantity, 2);
  assert.equal(pinParams.event_id, 'x');
  assert.deepEqual((pinParams.line_items as unknown[])[0], {
    product_id: '111',
    product_variant_id: '222',
    product_name: 'Snowboard',
    product_price: 600,
    product_quantity: 2,
    product_brand: 'Hydrogen',
  });
  // Quantity decrease / no line → nothing.
  assert.equal(
    commerceEvent('product_added_to_cart', { prevLine: line(3), currentLine: line(1) }, 'USD'),
    null,
  );
  assert.equal(commerceEvent('product_added_to_cart', {}, 'USD'), null);
});

test('ad events: cart viewed / checkout started → view_cart / begin_checkout', () => {
  const view = event('cart_viewed', { cart });
  assert.equal(view.kind, 'view_cart');
  assert.equal(view.value, 1225.5);
  assert.equal(view.items[1]?.variant, '', 'Default Title is not a variant name');
  assert.equal(metaEvent(view, 'x'), null);
  const checkout = event('checkout_started', { cart });
  assert.equal(checkout.scope, 'global');
  assert.deepEqual(gtagEvent(checkout, 'US').slice(0, 1), ['begin_checkout']);
  const [name, params] = must(metaEvent(checkout, 'x'));
  assert.equal(name, 'InitiateCheckout');
  assert.equal(params.num_items, 3);
  assert.deepEqual(params.content_ids, ['222', '333']);
  assert.equal(tiktokEvent(checkout, 'x')?.[0], 'InitiateCheckout');
  assert.equal(pinterestEvent(checkout, 'x')?.[0], 'initiatecheckout');
  assert.equal(commerceEvent('cart_viewed', { cart: null }, 'USD'), null);
  assert.equal(
    commerceEvent('checkout_started', { cart: { id: 'c', lines: { nodes: [] } } }, 'USD'),
    null,
  );
});

test('ad events: collection + search use the market currency', () => {
  const list = event('collection_viewed', {
    collection: { id: 'gid://shopify/Collection/9', handle: 'boards' },
  });
  assert.deepEqual(gtagEvent(list, 'US'), [
    'view_item_list',
    { item_list_id: 'boards', item_list_name: 'boards', items: [] },
  ]);
  assert.equal(metaEvent(list, 'x'), null);
  assert.equal(pinterestEvent(list, 'x')?.[0], 'viewcategory');
  const search = event('search_viewed', { searchTerm: ' Snow ', searchResults: { totalCount: 3 } });
  assert.deepEqual(gtagEvent(search, 'US'), ['search', { search_term: 'Snow' }]);
  assert.deepEqual(metaEvent(search, 'x'), ['Search', { search_string: 'Snow' }, { eventID: 'x' }]);
  assert.deepEqual(tiktokEvent(search, 'x'), [
    'Search',
    { search_string: 'Snow' },
    { event_id: 'x' },
  ]);
  assert.deepEqual(pinterestEvent(search, 'x'), [
    'search',
    { search_query: 'Snow', event_id: 'x' },
  ]);
  assert.equal(commerceEvent('search_viewed', { searchTerm: '' }, 'USD'), null);
  assert.equal(commerceEvent('page_viewed', {}, 'USD'), null);
});

test('ad events: GTM data layer uses the GA4 ecommerce object', () => {
  const e = event('product_viewed', productViewed);
  const push = dataLayerEvent(e, 'US');
  assert.equal(push.event, 'view_item');
  assert.equal((push.ecommerce as { currency: string }).currency, 'USD');
  const search = dataLayerEvent(
    must(commerceEvent('search_viewed', { searchTerm: 'hat' }, 'USD')),
    'US',
  );
  assert.deepEqual(search, { event: 'search', search_term: 'hat' });
});

test('ad events: dedup per page view (views) and forever (cart events); stable event ids', () => {
  const dedupe = createDeduper();
  const view = event('product_viewed', productViewed);
  assert.equal(dedupe(view, 'p1'), true);
  assert.equal(dedupe(view, 'p1'), false, 're-render / revalidation in the same page view');
  assert.equal(dedupe(view, 'p2'), true, 'a new page view of the same product counts');
  const add = event('product_added_to_cart', { cart, currentLine: line(1) });
  assert.equal(dedupe(add, 'p2'), true);
  assert.equal(dedupe(add, 'p3'), false, 'bus replay after navigation');
  const later = event('product_added_to_cart', {
    cart: { ...cart, updatedAt: '2026-11-07T10:05:00Z' },
    prevLine: line(1),
    currentLine: line(2),
  });
  assert.equal(dedupe(later, 'p3'), true, 'a later add is a new event');

  assert.equal(eventId(view, 'p1'), eventId(view, 'p1'));
  assert.notEqual(eventId(view, 'p1'), eventId(view, 'p2'));
  assert.equal(eventId(add, 'p1'), eventId(add, 'p9'), 'cart events ignore the page view');
  assert.match(eventId(add, 'p1'), /^hcms\.add_to_cart\.[0-9a-z]+$/);
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseUpsellRequest, railItems, upsellQuery } from '../app/lib/hcms/upsell.ts';

const GID = 'gid://shopify/Product/1';
const product = (handle: string, ok = true) => ({
  id: `gid://shopify/Product/${handle.length}`,
  handle,
  title: handle,
  availableForSale: ok,
  selectedOrFirstAvailableVariant: {
    id: 'v',
    title: 'Default',
    availableForSale: ok,
    price: { amount: '1', currencyCode: 'INR' },
  },
});

describe('upsell rails (P1-7)', () => {
  it('builds and parses the request for two rails', () => {
    const q = upsellQuery(
      [
        { source: 'collection', collection: 'best-sellers' },
        { source: 'products', products: [GID, 'gid://shopify/Product/2'] },
      ],
      'tee',
    );
    assert.equal(new URLSearchParams(q).get('handle'), null); // no auto rail: no seed
    const req = parseUpsellRequest(new URLSearchParams(q));
    assert.deepEqual(req.collections, ['best-sellers', null]);
    assert.deepEqual(req.ids[1], [GID, 'gid://shopify/Product/2']);
  });

  it('seeds only automatic rails and rejects malformed params', () => {
    assert.equal(
      new URLSearchParams(upsellQuery([{ source: 'auto' }], 'tee')).get('handle'),
      'tee',
    );
    const req = parseUpsellRequest(
      new URLSearchParams({ handle: 'a b', c0: '../x', p0: `${GID},nope,gid://shopify/Variant/1` }),
    );
    assert.equal(req.handle, null);
    assert.equal(req.collections[0], null);
    assert.deepEqual(req.ids[0], [GID]);
  });

  it('drops sold-out, in-cart and missing products', () => {
    const items = railItems([product('a'), product('b', false), null, product('c')], ['c']);
    assert.deepEqual(
      items.map((i) => i.handle),
      ['a'],
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cartContentSignature } from '../app/lib/hcms/cart-refresh.ts';

const line = (id: string, variant: string, quantity = 1, attrs: Record<string, string> = {}) => ({
  id,
  quantity,
  merchandise: { id: `gid://shopify/ProductVariant/${variant}` },
  attributes: Object.entries(attrs).map(([key, value]) => ({ key, value })),
});

describe('cartContentSignature (drawer refresh guard)', () => {
  it('ignores line ids and order: a refresh that only re-ids a merged box line never loops', () => {
    const before = [
      line('gid://shopify/CartLine/a1', '1', 1, { _hcms_bundle: 'box-6' }),
      line('gid://shopify/CartLine/b1', '2'),
    ];
    const after = [
      line('gid://shopify/CartLine/b1', '2'),
      line('gid://shopify/CartLine/a2', '1', 1, { _hcms_bundle: 'box-6' }),
    ];
    assert.equal(cartContentSignature(before), cartContentSignature(after));
  });

  it('changes with quantities, added/removed lines and boxes', () => {
    const first = line('x', '1', 1, { _hcms_box: 'box:1' });
    const second = line('y', '1', 1, { _hcms_box: 'box:2' });
    const base = [first, second];
    const sig = cartContentSignature(base);
    assert.notEqual(cartContentSignature([first]), sig);
    assert.notEqual(cartContentSignature([first, { ...second, quantity: 2 }]), sig);
    assert.notEqual(cartContentSignature([...base, line('z', '3')]), sig);
  });

  it('falls back to the line id without merchandise', () => {
    assert.equal(cartContentSignature([{ id: 'l1', quantity: 2 }]), 'l1||:2');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { discountRowMessages } from '../app/lib/hcms/cart-discounts.ts';
import { lineOptionText, lineProductPath } from '../app/lib/hcms/cart-line.ts';

describe('cart line display (SF-12, SF-27)', () => {
  const dawn = [
    { name: 'Color', value: 'Dawn' },
    { name: 'Size', value: '154 cm' },
  ];
  const single = [{ name: 'Title', value: 'Default Title' }];

  it('hides Shopify’s default variant title', () => {
    assert.equal(lineOptionText(single), '');
    assert.equal(lineOptionText(dawn), 'Dawn / 154 cm');
    assert.equal(lineOptionText(null), '');
  });

  it('links to the product on the line’s variant', () => {
    assert.equal(
      lineProductPath('the-complete-snowboard', dawn),
      '/products/the-complete-snowboard?Color=Dawn&Size=154+cm',
    );
    assert.equal(lineProductPath('hidden', single), '/products/hidden');
    assert.equal(lineProductPath('hidden', undefined), '/products/hidden');
  });
});

describe('discount messages (SF-13)', () => {
  const invalid = 'Enter a valid discount code';
  const codes = [
    { code: 'BOGUS123', applicable: false },
    { code: 'DUO10', applicable: false },
  ];

  it('shows a repeated error once, under the input, for the last tried code', () => {
    const rows = discountRowMessages(codes, () => invalid, 'DUO10');
    assert.equal(rows.size, 0);
  });

  it('keeps a different message for an applicable row (e.g. a failed remove), once', () => {
    const rows = discountRowMessages(
      [
        { code: 'A', applicable: true },
        { code: 'B', applicable: true },
        { code: 'C', applicable: true },
      ],
      (code) => (code === 'C' ? null : 'Could not remove'),
      '',
    );
    assert.deepEqual([...rows], [['A', 'Could not remove']]);
  });

  it('matches the tried code case-insensitively', () => {
    const rows = discountRowMessages([{ code: 'save5', applicable: true }], () => 'x', 'SAVE5');
    assert.equal(rows.size, 0);
  });
});

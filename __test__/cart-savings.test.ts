import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cartSavings,
  fromMilli,
  lineCompareAtMilli,
  lineDiscounts,
  toMilli,
} from '../app/lib/hcms/cart-savings.ts';

const inr = (amount: string) => ({ amount, currencyCode: 'INR' });

describe('cart savings (P1-6)', () => {
  it('converts decimal strings to integer thousandths exactly', () => {
    assert.equal(toMilli('0.1'), 100);
    assert.equal(toMilli('19.99'), 19990);
    assert.equal(toMilli('1.005'), 1005);
    assert.equal(toMilli('x'), 0);
    assert.deepEqual(fromMilli(19990, 'INR'), inr('19.990'));
    assert.deepEqual(fromMilli(5, 'INR'), inr('0.005'));
  });

  it('strikes through only a higher compare-at price', () => {
    const line = {
      quantity: 2,
      cost: { amountPerQuantity: inr('80'), compareAtAmountPerQuantity: inr('100') },
    };
    assert.equal(lineCompareAtMilli(line), 200000);
    assert.equal(
      lineCompareAtMilli({
        quantity: 1,
        cost: { amountPerQuantity: inr('80'), compareAtAmountPerQuantity: inr('80') },
      }),
      null,
    );
    assert.equal(lineCompareAtMilli({ quantity: 1 }), null);
  });

  it('labels discount allocations by title or code', () => {
    const discounts = lineDiscounts({
      quantity: 1,
      discountAllocations: [
        { title: 'BUY2', discountedAmount: inr('100') },
        { code: 'SAVE', discountedAmount: inr('0') },
        { code: 'WELCOME', discountedAmount: inr('5.5') },
      ],
    });
    assert.deepEqual(
      discounts.map((d) => d.label),
      ['BUY2', 'WELCOME'],
    );
  });

  it('sums compare-at savings, line discounts and cart-level discounts', () => {
    const lines = [
      {
        quantity: 2,
        cost: {
          totalAmount: inr('160'),
          amountPerQuantity: inr('80'),
          compareAtAmountPerQuantity: inr('100'),
        },
      },
      {
        quantity: 1,
        cost: { totalAmount: inr('400'), amountPerQuantity: inr('500') },
        discountAllocations: [{ title: 'BUY2', discountedAmount: inr('100') }],
      },
    ];
    // 40 (compare-at) + 100 (line discount) + 20 (cart-level: 560 → 540)
    const saved = cartSavings(lines, { subtotalAmount: inr('560'), totalAmount: inr('540') });
    assert.deepEqual(saved, inr('160.000'));
    assert.equal(cartSavings([], { subtotalAmount: inr('1'), totalAmount: inr('1') }), null);
    assert.equal(cartSavings(lines, null), null);
  });
});

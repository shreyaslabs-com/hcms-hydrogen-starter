import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatPrice, hideWholeDecimals } from '../app/lib/money.ts';

const inr = (amount: string) => ({ amount, currencyCode: 'INR' as const });
const usd = (amount: string) => ({ amount, currencyCode: 'USD' as const });

describe('money_hide_decimals (T-2.157)', () => {
  it('off by default: Hydrogen formatting unchanged', () => {
    assert.equal(formatPrice(inr('1299.0')), '₹1,299.00');
    assert.equal(formatPrice(usd('10.0')), '$10.00');
  });

  it('INR: whole amounts lose .00, paise stay', () => {
    const on = { hideDecimals: true };
    assert.equal(formatPrice(inr('1299.0'), 'en-US', on), '₹1,299');
    assert.equal(formatPrice(inr('100000.00'), 'en-US', on), '₹100,000');
    assert.equal(formatPrice(inr('1299.50'), 'en-US', on), '₹1,299.50');
    assert.equal(formatPrice(inr('0.0'), 'en-US', on), '₹0');
  });

  it('USD: whole amounts lose .00, cents stay', () => {
    const on = { hideDecimals: true };
    assert.equal(formatPrice(usd('10.0'), 'en-US', on), '$10');
    assert.equal(formatPrice(usd('1000'), 'en-US', on), '$1,000');
    assert.equal(formatPrice(usd('9.99'), 'en-US', on), '$9.99');
  });

  it('keeps group separators and zero-decimal currencies intact', () => {
    // Indian grouping: only the last ".00" goes.
    assert.equal(hideWholeDecimals('₹1,00,000.00', inr('100000')), '₹1,00,000');
    // Comma decimal locales.
    assert.equal(
      hideWholeDecimals('10,00 €', { amount: '10', currencyCode: 'EUR' }, 'de-DE'),
      '10 €',
    );
    // JPY has no minor unit: "¥1,000" must not lose ",000".
    assert.equal(hideWholeDecimals('¥1,000', { amount: '1000', currencyCode: 'JPY' }), '¥1,000');
    // With the currency code appended afterwards it still works on the number.
    assert.equal(hideWholeDecimals('$10.00', usd('10')), '$10');
    // Junk amounts: untouched.
    assert.equal(hideWholeDecimals('$10.00', usd('abc')), '$10.00');
  });
});

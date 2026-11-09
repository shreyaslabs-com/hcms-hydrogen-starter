import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { boxDiscounted, boxTotals, groupCartLines } from '../app/lib/hcms/cart-boxes.ts';

const inr = (amount: string) => ({ amount, currencyCode: 'INR' });

const boxLine = (
  id: string,
  box: string,
  opts: { unit?: string; total?: string; quantity?: number; name?: string | null } = {},
) => ({
  id,
  quantity: opts.quantity ?? 1,
  cost: {
    totalAmount: inr(opts.total ?? opts.unit ?? '100'),
    amountPerQuantity: inr(opts.unit ?? '100'),
  },
  attributes: [
    { key: '_hcms_box', value: box },
    ...(opts.name === null
      ? []
      : [{ key: '_hcms_box_name', value: opts.name ?? 'Build your box #8f6d' }]),
  ],
});

const plain = (id: string) => ({
  id,
  quantity: 1,
  cost: { totalAmount: inr('50'), amountPerQuantity: inr('50') },
  attributes: [{ key: 'Engraving', value: 'Hi' }],
});

describe('cart boxes (Build a box rows)', () => {
  it('groups lines of one box into one row with item count and totals', () => {
    const rows = groupCartLines([
      boxLine('a', 'box-1:x', { unit: '100', total: '90' }),
      boxLine('b', 'box-1:x', { unit: '200', total: '180', quantity: 2 }),
    ]);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row?.kind, 'box');
    if (row?.kind !== 'box') return;
    assert.equal(row.key, 'box-1:x');
    assert.equal(row.name, 'Build your box');
    assert.equal(row.itemCount, 3);
    assert.deepEqual(
      row.lines.map((l) => l.id),
      ['a', 'b'],
    );
    assert.deepEqual(row.original, inr('500.000'));
    assert.deepEqual(row.total, inr('270.000'));
    assert.equal(boxDiscounted(row), true);
  });

  it('keeps plain lines and puts each box where its first line was', () => {
    const rows = groupCartLines([
      plain('p1'),
      boxLine('a', 'box-1:x'),
      plain('p2'),
      boxLine('c', 'box-1:y', { name: 'Second box' }),
      boxLine('b', 'box-1:x'),
      boxLine('d', 'box-1:y'),
    ]);
    assert.deepEqual(
      rows.map((r) => (r.kind === 'line' ? r.line.id : `${r.key}=${r.lines.map((l) => l.id)}`)),
      ['p1', 'box-1:x=a,b', 'p2', 'box-1:y=c,d'],
    );
    const second = rows[3];
    assert.equal(second?.kind === 'box' && second.name, 'Second box');
  });

  it('a partial box still groups; without a discount the totals are equal', () => {
    const rows = groupCartLines([boxLine('a', 'box-1:x', { unit: '120' })]);
    const row = rows[0];
    assert.equal(row?.kind, 'box');
    if (row?.kind !== 'box') return;
    assert.equal(row.itemCount, 1);
    assert.deepEqual(row.original, row.total);
    assert.equal(boxDiscounted(row), false);
  });

  it('falls back to "Box" without a name and to the discounted total + allocations', () => {
    const line = {
      id: 'a',
      quantity: 1,
      cost: { totalAmount: inr('80') },
      discountAllocations: [{ discountedAmount: inr('20'), title: 'Build a box' }],
      attributes: [{ key: '_hcms_box', value: 'b:1' }],
    };
    const rows = groupCartLines([line]);
    assert.equal(rows[0]?.kind === 'box' && rows[0].name, 'Box');
    assert.deepEqual(boxTotals([line]), { original: inr('100.000'), total: inr('80.000') });
  });

  it('never shows an original below the total and ignores blank box attributes', () => {
    assert.deepEqual(
      boxTotals([boxLine('a', 'b:1', { unit: '50', total: '60' })]).original,
      inr('60.000'),
    );
    const rows = groupCartLines([
      { ...plain('x'), attributes: [{ key: '_hcms_box', value: ' ' }] },
    ]);
    assert.equal(rows[0]?.kind, 'line');
  });
});

describe('cart boxes: Cart Transform merged bundle line', () => {
  const component = (id: string, unit: string, quantity = 1) => ({
    id,
    quantity,
    cost: { totalAmount: inr(unit), amountPerQuantity: inr(unit) },
  });
  const merged = {
    id: 'gid://shopify/CartLine/parent',
    quantity: 1,
    cost: { totalAmount: inr('250') },
    attributes: [
      { key: 'Box', value: 'Build your box #c184' },
      { key: '_hcms_bundle', value: 'build-box-x7a2' },
    ],
    lineComponents: [component('c1', '100'), component('c2', '100', 2)],
  };

  it('is one box row listing its components; Remove targets the merged line only', () => {
    const rows = groupCartLines([plain('x'), merged]);
    assert.equal(rows.length, 2);
    const row = rows[1];
    assert.equal(row?.kind, 'box');
    if (row?.kind !== 'box') return;
    assert.equal(row.name, 'Build your box');
    assert.deepEqual(
      row.lines.map((l) => l.id),
      ['c1', 'c2'],
    );
    assert.deepEqual(row.lineIds, ['gid://shopify/CartLine/parent']);
    assert.equal(row.itemCount, 3);
    assert.deepEqual(row.total, inr('250'));
    assert.deepEqual(row.original, inr('300.000'));
    assert.equal(boxDiscounted(row), true);
  });

  it('box lines keep their own ids for Remove', () => {
    const rows = groupCartLines([boxLine('a', 'b:1'), boxLine('b', 'b:1')]);
    assert.deepEqual(rows[0]?.kind === 'box' && rows[0].lineIds, ['a', 'b']);
  });

  it('the cart fragment asks for lineComponents on merged lines', async () => {
    const { CART_FRAGMENT_WITH_COMPONENTS: fragment } = await import('../app/lib/cart-handlers.ts');
    assert.match(fragment, /\.\.\. on ComponentizableCartLine \{\s*lineComponents \{/);
    // Spliced inside the line node (after the line's own merchandise), once.
    assert.equal(fragment.split('lineComponents').length, 2);
    assert.ok(fragment.indexOf('lineComponents') > fragment.indexOf('sellingPlanAllocation'));
  });

  it('a merged line without components (or without the attribute) stays a plain line', () => {
    assert.equal(groupCartLines([{ ...merged, lineComponents: [] }])[0]?.kind, 'line');
    assert.equal(groupCartLines([{ ...merged, attributes: [] }])[0]?.kind, 'line');
  });
});

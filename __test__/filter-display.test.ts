import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FacetValues, type FacetOption } from '../app/components/hcms/FacetValues.ts';
import {
  facetDisplay,
  namedColor,
  splitValues,
  swatchPaint,
} from '../app/lib/hcms/filter-display.ts';

const v = (label: string, swatch?: { color?: string }) => ({
  label,
  ...(swatch ? { swatch } : {}),
});

test('facetDisplay: price, explicit displays, swatch fallback and automatic', () => {
  assert.equal(
    facetDisplay({ type: 'PRICE_RANGE', values: [], view: { display: 'buttons' } }),
    'price',
  );
  assert.equal(facetDisplay({ values: [v('S'), v('M')], view: { display: 'buttons' } }), 'buttons');
  assert.equal(
    facetDisplay({ values: [v('Red', { color: '#f00' })], view: { display: 'list' } }),
    'list',
  );
  // Swatches: Shopify data or a safe colour name for every value…
  assert.equal(
    facetDisplay({
      values: [v('Navy'), v('Odd', { color: '#123' })],
      view: { display: 'swatches' },
    }),
    'swatches',
  );
  // …otherwise a list.
  assert.equal(
    facetDisplay({ values: [v('Navy'), v('Heather mix')], view: { display: 'swatches' } }),
    'list',
  );
  assert.equal(facetDisplay({ values: [v('Red', { color: '#f00' }), v('Mix')] }), 'swatches');
  assert.equal(facetDisplay({ values: [v('S')], presentation: 'SWATCH' }), 'swatches');
  assert.equal(facetDisplay({ values: [v('S')] }), 'list');
});

test('namedColor only passes allowlisted CSS colour words', () => {
  assert.equal(namedColor(' Navy '), 'navy');
  assert.equal(namedColor('red;background:url(x)'), null);
  assert.equal(namedColor('Heather'), null);
  assert.deepEqual(swatchPaint(v('Blue')), { color: 'blue', image: null });
  assert.deepEqual(
    swatchPaint({ label: 'Blue', swatch: { image: { previewImage: { url: 'u' } } } }),
    {
      color: null,
      image: 'u',
    },
  );
});

test('splitValues keeps a lone extra value visible', () => {
  assert.deepEqual(splitValues([1, 2, 3, 4], 3), { shown: [1, 2, 3, 4], more: [] });
  assert.deepEqual(splitValues([1, 2, 3, 4, 5], 3), { shown: [1, 2, 3], more: [4, 5] });
  assert.deepEqual(splitValues([1, 2], undefined), { shown: [1, 2], more: [] });
});

const options: FacetOption[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((label, i) => ({
  id: `v${i}`,
  label,
  count: i + 1,
  name: 'filter.v.option.size',
  value: label,
  active: label === 'XXL',
}));

test('FacetValues: no-JS "Show more" keeps every value in the HTML', () => {
  const html = renderToStaticMarkup(
    createElement(FacetValues, { labelId: 'size', display: 'list', options, maxValues: 3 }),
  );
  assert.match(html, /^<fieldset[^>]*aria-labelledby="size"/);
  assert.equal(html.match(/type="checkbox"/g)?.length, 6);
  assert.match(html, /<details class="group\/more" open="">/); // an active value is inside
  assert.match(html, /Show more \(3\)/);
  const [before, after] = html.split('<details');
  assert.match(before ?? '', /XS.*S.*M/);
  assert.match(after ?? '', /XXL/);
  assert.match(html, /1 product</);
});

test('FacetValues: buttons and swatches keep checkbox semantics and names', () => {
  const buttons = renderToStaticMarkup(
    createElement(FacetValues, {
      labelId: 'size',
      display: 'buttons',
      options: options.slice(0, 2),
    }),
  );
  assert.doesNotMatch(buttons, /<details/);
  assert.match(buttons, /type="checkbox"[^>]*name="filter.v.option.size" value="XS"/);
  assert.match(buttons, /rounded-button/);
  const swatches = renderToStaticMarkup(
    createElement(FacetValues, {
      labelId: 'color',
      display: 'swatches',
      options: [{ ...(options[0] as FacetOption), label: 'Navy', color: 'navy' }],
    }),
  );
  assert.match(swatches, /title="Navy \(1\)"/);
  assert.match(swatches, /aria-label="Navy"/);
  assert.match(swatches, /--filter-swatch-color:navy/);
  assert.equal(
    renderToStaticMarkup(
      createElement(FacetValues, { labelId: 'x', display: 'list', options: [] }),
    ),
    '',
  );
});

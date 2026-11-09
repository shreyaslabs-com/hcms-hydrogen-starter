import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QUICK_VIEW_CACHE,
  parseQuickViewQuery,
  withMarketContext,
} from '../app/lib/hcms/quick-view.ts';

const parse = (query: string) => parseQuickViewQuery(new URLSearchParams(query));

test('quick view (T-2.77): handle + option params like a product URL', () => {
  assert.deepEqual(parse('handle=kurta&Color=Red&Size=M'), {
    handle: 'kurta',
    selectedOptions: [
      { name: 'Color', value: 'Red' },
      { name: 'Size', value: 'M' },
    ],
  });
  assert.deepEqual(parse('handle=kurta'), { handle: 'kurta', selectedOptions: [] });
});

test('quick view: bad handles are rejected', () => {
  assert.equal(parse(''), null);
  assert.equal(parse('handle='), null);
  assert.equal(parse('handle=../admin'), null);
  assert.equal(parse('handle=a%20b'), null);
  assert.equal(parse(`handle=${'a'.repeat(256)}`), null);
});

test('quick view: `variant`, empty, duplicate and oversized options are dropped; max 3', () => {
  const long = 'x'.repeat(256);
  assert.deepEqual(
    parse(`handle=k&variant=123&A=&B=1&B=2&${long}=v&C=${long}&D=4&E=5&F=6`).selectedOptions,
    [
      { name: 'B', value: '1' },
      { name: 'D', value: '4' },
      { name: 'E', value: '5' },
    ],
  );
});

test('quick view: the section query gains the market context', () => {
  const query = withMarketContext(
    'query HcmsMainProduct($p: String!, $selectedOptions: [SelectedOptionInput!]!) {\n product(handle: $p) { id } }',
  );
  assert.equal(
    query,
    'query HcmsMainProduct($p: String!, $selectedOptions: [SelectedOptionInput!]!, $country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {\n product(handle: $p) { id } }',
  );
  assert.match(QUICK_VIEW_CACHE, /^public, max-age=\d+/);
});

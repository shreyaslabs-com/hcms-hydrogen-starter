import assert from 'node:assert/strict';
import test from 'node:test';

import { POPULAR_MAX, parsePopularHandle } from '../app/lib/hcms/search-popular.ts';

test('search popular: handle validation', () => {
  assert.equal(parsePopularHandle(new URLSearchParams('handle=best-sellers')), 'best-sellers');
  assert.equal(parsePopularHandle(new URLSearchParams('handle=a b')), null);
  assert.equal(parsePopularHandle(new URLSearchParams('handle=../x')), null);
  assert.equal(parsePopularHandle(new URLSearchParams('')), null);
  assert.ok(POPULAR_MAX >= 1);
});

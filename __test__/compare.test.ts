import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCompareQuery } from '../app/lib/hcms/compare.ts';

const q = (s: string) => parseCompareQuery(new URLSearchParams(s));

test('compare query: valid handles, max 4, unique', () => {
  assert.deepEqual(q('handles=a,b,a,c d,e,f,g')?.handles, ['a', 'b', 'e', 'f']);
  assert.equal(q('handles='), null);
  assert.equal(q('handles=bad handle'), null);
});

test('compare query: spec metafields validated, max 8', () => {
  const specs = q('handles=a&specs=custom.material,bad,custom.material,x.y,a-b.c_d')?.specs;
  assert.deepEqual(specs, [
    { namespace: 'custom', key: 'material' },
    { namespace: 'a-b', key: 'c_d' },
  ]);
  const many = Array.from({ length: 12 }, (_, i) => `custom.k${i}x`).join(',');
  assert.equal(q(`handles=a&specs=${many}`)?.specs.length, 8);
  assert.deepEqual(q('handles=a')?.specs, []);
});

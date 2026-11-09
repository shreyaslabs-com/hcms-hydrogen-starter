import assert from 'node:assert/strict';
import test from 'node:test';

import { gatePath, safeReturnTo } from '../app/lib/hcms/gate.ts';

test('gate: password page keeps the visitor’s market', () => {
  assert.equal(gatePath('/products/x'), '/password');
  assert.equal(gatePath('/fr-ca/products/x'), '/fr-ca/password');
  assert.equal(gatePath('/'), '/password');
});

test('gate: return_to is same-site only', () => {
  assert.equal(safeReturnTo('/collections/all?page=2'), '/collections/all?page=2');
  for (const bad of [null, '', 'https://evil.com', '//evil.com', '/\\evil.com', '/password?x=1'])
    assert.equal(safeReturnTo(bad), '/', String(bad));
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { recordConditions, type ConditionsState } from '../app/lib/hcms/conditions.ts';

test('page loaders keep the earliest date boundary and any customer dependency', () => {
  const state: ConditionsState = { expiresAt: null, personal: false };
  recordConditions(state, { expiresAt: 5000, personal: false });
  recordConditions(state, { expiresAt: null, personal: true });
  recordConditions(state, { expiresAt: 3000, personal: false });
  recordConditions(state, { expiresAt: 9000, personal: false });
  assert.deepEqual(state, { expiresAt: 3000, personal: true });
  recordConditions(null, { expiresAt: 1, personal: true }); // outside the middleware: no-op
});

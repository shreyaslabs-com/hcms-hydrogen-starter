import assert from 'node:assert/strict';
import test from 'node:test';

import { healthReport } from '../app/lib/hcms/health.ts';

const base = { sdkVersion: '0.0.0', now: new Date('2026-11-06T00:00:00Z') };

test('health: status from tier + failures; settings reported as booleans only', () => {
  const report = healthReport({
    ...base,
    source: 'mirror',
    failures: [{ tier: 'api', error: { code: 'UPSTREAM', message: 'HCMS API returned 503' } }],
    env: { HCMS_API_URL: 'https://admin.example.com', HCMS_PREVIEW_SECRET: 'secret-value' },
    previewVerified: true,
  });
  assert.equal(report.status, 'degraded');
  assert.deepEqual(report.config, { apiUrl: true, previewSecret: true, publicKey: false });
  assert.equal(report.preview, true);
  assert.ok(!JSON.stringify(report).includes('secret-value'), 'never echoes secrets');
});

test('health: nothing published yet is "unpublished", not degraded', () => {
  const report = healthReport({
    ...base,
    source: 'bundled',
    failures: [{ tier: 'mirror', error: { code: 'NOT_FOUND', message: 'No pointer' } }],
    env: {},
    previewVerified: false,
  });
  assert.equal(report.status, 'unpublished');
  assert.equal(report.preview, false);
  assert.equal(
    healthReport({ ...base, source: 'api', failures: [], env: {}, previewVerified: false }).status,
    'ok',
  );
});

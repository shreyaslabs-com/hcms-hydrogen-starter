import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { migrateThemeDocument } from '@hcms/schema';

// The bundled document is the last fallback tier (D-07): it must always validate.
const raw = JSON.parse(
  readFileSync(new URL('../app/hcms/last-known-good.json', import.meta.url), 'utf8'),
);

test('bundled last-known-good is a valid Theme Document', () => {
  const document = migrateThemeDocument(raw);
  assert.equal(document.snapshotId, 'snap_bundled');
  assert.ok(document.templates.index, 'has a home template');
});

test('bundled document is the official default preset (regenerate: pnpm hcms:bundle-preset)', async () => {
  const { defaultTheme } = await import('@hcms/sections');
  assert.deepEqual(
    {
      assignments: raw.assignments,
      settings: raw.settings,
      groups: raw.groups,
      templates: raw.templates,
    },
    JSON.parse(JSON.stringify(defaultTheme)),
  );
});

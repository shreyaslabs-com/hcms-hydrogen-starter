/**
 * Regenerates the bundled fallback document (D-07) from the official default theme preset
 * (T-1.3.5). Run after changing `@hcms/sections` presets: `pnpm hcms:bundle-preset`.
 * A deployed store replaces this file with its own published snapshot.
 *
 * `HCMS_PRESET=<id>` bundles another starting theme (T-2.107), e.g. to measure its JS budgets:
 * `HCMS_PRESET=beauty pnpm hcms:bundle-preset && HCMS_ANALYZE=1 pnpm build && pnpm budgets`.
 * Re-run without it before committing (the committed file is always the default preset).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process, { stdout } from 'node:process';
import { URL } from 'node:url';

import { themePresets } from '@hcms/sections';

const id = process.env.HCMS_PRESET || 'default';
const preset = themePresets.find((p) => p.id === id);
if (!preset) {
  process.stderr.write(
    `Unknown preset "${id}". Choose one of: ${themePresets.map((p) => p.id).join(', ')}\n`,
  );
  process.exit(1);
}

const path = new URL('../app/hcms/last-known-good.json', import.meta.url);
const current = JSON.parse(readFileSync(path, 'utf8'));
const document = {
  version: 1,
  storeId: current.storeId ?? 'gid://shopify/Shop/0',
  themeId: 'thm_bundled',
  snapshotId: 'snap_bundled',
  publishedAt: current.publishedAt ?? new Date().toISOString(),
  sdkMin: current.sdkMin ?? '0.0.0',
  ...preset.document,
};
writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
stdout.write(`Wrote ${path.pathname} (${id})\n`);

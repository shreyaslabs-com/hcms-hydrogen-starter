#!/usr/bin/env node
/**
 * Per-module size report for client chunks (T-1.8.1). Needs a sourcemap build:
 * `HCMS_ANALYZE=1 pnpm build && node scripts/bundle-report.mjs [chunk-name-substring…]`.
 * Prints the top modules (by source size, a proxy for minified bytes) per matching chunk.
 */
import { readFileSync, readdirSync } from 'node:fs';
import process, { stdout } from 'node:process';
import { URL } from 'node:url';

const dir = new URL('../dist/client/assets/', import.meta.url);
const filters = process.argv.slice(2);
const maps = readdirSync(dir).filter((f) => f.endsWith('.js.map'));
if (!maps.length) {
  stdout.write('No sourcemaps: run `HCMS_ANALYZE=1 pnpm build` first.\n');
  process.exit(1);
}
for (const file of maps) {
  if (filters.length && !filters.some((f) => file.includes(f))) continue;
  const map = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  const rows = (map.sources ?? []).map((src, i) => [
    (map.sourcesContent?.[i] ?? '').length,
    src.replace(/^(\.\.\/)+/, '').replace(/node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'npm:'),
  ]);
  const total = rows.reduce((a, [n]) => a + n, 0);
  stdout.write(`\n${file.replace('.map', '')}  (${(total / 1024).toFixed(0)} KB source)\n`);
  for (const [n, src] of rows.sort((a, b) => b[0] - a[0]).slice(0, 12))
    stdout.write(`  ${(n / 1024).toFixed(1).padStart(7)} KB  ${src}\n`);
}

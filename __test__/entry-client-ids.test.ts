/**
 * `useId` parity between `entry.server.tsx` and `entry.client.tsx` (T-2.105 bug): React encodes
 * sibling positions into every `useId`, so the hydrated root must have as many children as the
 * server root (ONE router). A second root child (an effect-only component beside the router)
 * shifted every client id while the DOM kept the server's, breaking `getElementById` lookups
 * (phone gallery thumbnails) — silently in production. The e2e `hydration-ids.spec.ts` checks
 * real pages; this pins the source shape so it fails before a build.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(new URL(`../app/${file}`, import.meta.url), 'utf8');

/** JSX elements directly inside `<Tag>…</Tag>` (one level, self-closing or paired). */
function children(source: string, tag: string): string[] {
  const name = tag.replace(/\./g, '\\.');
  const inner = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(source)?.[1];
  assert.ok(inner !== undefined, `<${tag}> not found`);
  const names: string[] = [];
  let depth = 0;
  for (const m of inner.matchAll(/<(\/?)([A-Za-z][\w.]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (closing) depth -= 1;
    else {
      if (depth === 0 && name) names.push(name);
      if (!selfClosing) depth += 1;
    }
  }
  return names;
}

test('the hydrated root has exactly one child, like the server root', () => {
  const client = read('entry.client.tsx');
  assert.match(client, /hydrateRoot\(\s*document,\s*<StrictMode>/);
  assert.deepEqual(children(client, 'StrictMode'), ['App']);
  // …and that child renders the router itself (no siblings beside it).
  assert.match(client, /function App\(\)[\s\S]*?return <HydratedRouter \/>;/);

  const server = read('entry.server.tsx');
  assert.deepEqual(children(server, 'NonceContext.Provider'), ['ServerRouter']);
});

test('the guard notices a second root child', () => {
  const broken = '<StrictMode>\n  <HydratedRouter />\n  <HydrationCommitted />\n</StrictMode>';
  assert.deepEqual(children(broken, 'StrictMode'), ['HydratedRouter', 'HydrationCommitted']);
});

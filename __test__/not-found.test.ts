import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { notFoundPage } from '../app/lib/hcms/not-found-data.ts';

const read = (path: string) => readFileSync(new URL(`../app/${path}`, import.meta.url), 'utf8');

test('themed 404 payload: template + origin, anything else = app NotFound', () => {
  const hcms = { name: '404', data: {} };
  assert.deepEqual(notFoundPage({ hcms, origin: 'https://x.test' }), {
    hcms,
    origin: 'https://x.test',
  });
  assert.equal(notFoundPage({ hcms: null, origin: 'https://x.test' }), null);
  assert.equal(notFoundPage('Not Found'), null);
  assert.equal(notFoundPage(null), null);
});

test('page routes and the catch-all sit inside the shell layout (404s keep header/footer)', () => {
  const routes = read('routes.ts');
  const shell = routes.indexOf("layout('routes/shell.tsx'");
  assert.ok(shell > 0);
  for (const file of ['routes/page.tsx', 'routes/product.tsx', 'routes/catchall.tsx'])
    assert.ok(routes.indexOf(`'${file}'`) > shell, file);
  // Resource-only routes stay outside (no shell needed).
  assert.ok(routes.indexOf("'routes/robots.ts'") > routes.indexOf("'routes/catchall.tsx'"));
  assert.match(read('routes/shell.tsx'), /export function ErrorBoundary/);
  // Missing resources throw the themed 404 instead of a bare Response.
  for (const file of ['page', 'product', 'collection', 'blog', 'article', 'metaobject-page'])
    assert.match(read(`routes/${file}.tsx`), /throwNotFound\(context, request\)/, file);
});

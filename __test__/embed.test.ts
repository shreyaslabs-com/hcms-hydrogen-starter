import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { customCodeFields, customCodeHash } from '@hcms/schema';

import { embedPath, embedResponse } from '../app/lib/hcms/embed.ts';

const settings = {
  html: '<div id="calc"></div><script>bad()</script>',
  css: '#calc { color: red }',
  javascript: 'document.getElementById("calc").textContent = "ok"',
  title: 'Size calculator',
};
const doc = {
  templates: {
    product: {
      sections: {
        main: {
          type: 'main-product',
          settings: {},
          blocks: {
            b1: { type: 'custom_html', settings },
            plain: { type: 'custom_html', settings: { html: '<p>x</p>' } },
          },
        },
      },
    },
  },
  groups: {},
};
const hash = customCodeHash(customCodeFields(settings));
const live = { origin: 'https://shop.example', preview: false };

test('embed paths: section + up to 3 block ids, nothing else', () => {
  assert.deepEqual(embedPath('main/b1'), ['main', 'b1']);
  assert.equal(embedPath(''), null);
  assert.equal(embedPath('main/../x'), null);
  assert.equal(embedPath('a/b/c/d/e'), null);
});

test('frame document: sandbox CSP, scoped CSS, scripts out of HTML, cached by content hash', async () => {
  const response = embedResponse(doc, 'main/b1', hash, live);
  assert.equal(response.status, 200);
  const csp = response.headers.get('Content-Security-Policy') ?? '';
  assert.match(csp, /^sandbox allow-scripts allow-popups allow-forms;/);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.doesNotMatch(csp, /allow-same-origin|allow-top-navigation/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Cache-Control') ?? '', /^public/);
  const body = await response.text();
  assert.match(body, /\[data-hcms-code="main\.b1"\] #calc\{color: red\}/);
  assert.doesNotMatch(body, /bad\(\)/);
  assert.match(body, /<title>Size calculator<\/title>/);
  assert.match(body, /"https:\/\/shop\.example"/);
});

test('stale hash and preview are never cached; unknown, plain or malformed ids are 404', async () => {
  assert.equal(embedResponse(doc, 'main/b1', 'old', live).headers.get('Cache-Control'), 'no-store');
  assert.equal(
    embedResponse(doc, 'main/b1', hash, { ...live, preview: true }).headers.get('Cache-Control'),
    'no-store',
  );
  for (const splat of ['main/plain', 'main/nope', 'x', '../../etc'])
    assert.equal(embedResponse(doc, splat, null, live).status, 404, splat);
});

test('route: content by ids from the rendered document, never from the query string', () => {
  const route = readFileSync(new URL('../app/routes/hcms/embed.ts', import.meta.url), 'utf8');
  assert.match(route, /context\.get\(documentContext\)\.document/);
  assert.match(route, /params\['\*'\]/);
  const routes = readFileSync(new URL('../app/routes.ts', import.meta.url), 'utf8');
  assert.match(routes, /route\('__hcms\/embed\/\*', 'routes\/hcms\/embed\.ts'\)/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(new URL(`../app/${path}`, import.meta.url), 'utf8');

test('theme Custom CSS (T-2.74) renders after the app stylesheets, theme fonts before', () => {
  const root = source('root.tsx');
  const links = root.indexOf('<Links />');
  const custom = root.indexOf('data-hcms-custom-css');
  assert.ok(links > 0 && custom > links, 'custom CSS comes after <Links /> so it wins');
  assert.ok(root.indexOf('rootData?.theme.links.map') < links, 'font links/preloads stay first');
  assert.match(root, /__html: rootData\.theme\.customCss/);
  // T-2.166: theme Custom CSS follows the theme tokens, so it overrides them.
  const tokens = root.indexOf('data-hcms-theme=""');
  assert.ok(tokens > 0 && custom > tokens, 'custom CSS comes after the theme tokens');
});

test('section Custom CSS (T-2.74) is computed in the loader and passed to every renderer', () => {
  assert.match(source('lib/hcms/page.ts'), /sectionCss: sectionStyles\(containers\)/);
  assert.match(source('components/hcms/HcmsTemplatePage.tsx'), /sectionCss: page\.sectionCss/);
  const root = source('root.tsx');
  assert.equal(root.match(/sectionCss=\{loaderData\.groups\.sectionCss\}/g)?.length, 3);
  // The sanitizer never reaches client code: only server modules import it.
  for (const client of [
    'components/hcms/HcmsTemplatePage.tsx',
    'components/hcms/HcmsLayoutGroup.tsx',
  ])
    assert.doesNotMatch(source(client), /sanitizeCustomCss|sectionStyles/);
});

test('Adobe Fonts CSP (T-2.73) follows the theme document', () => {
  assert.match(source('entry.server.tsx'), /adobeFonts: hasAdobeFonts\(context\)/);
});

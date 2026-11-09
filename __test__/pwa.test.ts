import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildManifest,
  hexColor,
  manifestIcons,
  pwaSettings,
  themeColorFor,
} from '../app/lib/hcms/pwa.ts';

const settings = {
  colors: { schemes: { 'scheme-1': { background: '#fafafa', text: '#111' } } },
  pwa: { enabled: true, name: '  Bagru   Prints  ', theme_color: '#123456' },
};

test('off by default, tolerant of junk', () => {
  assert.equal(pwaSettings(undefined).enabled, false);
  assert.equal(pwaSettings({ pwa: 'x' }).enabled, false);
  assert.equal(pwaSettings({ pwa: { enabled: 'true' } }).enabled, false);
  assert.equal(pwaSettings(settings).enabled, true);
});

test('colours are hex only; theme colour falls back to the scheme background', () => {
  assert.equal(hexColor('red; } body{'), null);
  assert.equal(hexColor('url(x)'), null);
  assert.equal(hexColor('#abc'), '#abc');
  assert.equal(themeColorFor(settings), '#123456');
  assert.equal(
    themeColorFor({ ...settings, pwa: { enabled: true, theme_color: 'javascript:' } }),
    '#fafafa',
  );
  assert.equal(themeColorFor({}), '#ffffff');
});

test('icons: CDN images cropped square at 192 and 512, fallback favicon', () => {
  const icons = manifestIcons('https://cdn.shopify.com/s/files/logo.png?v=1');
  assert.deepEqual(
    icons.map((i) => i.sizes),
    ['192x192', '512x512'],
  );
  assert.match(icons[0]?.src ?? '', /width=192/);
  assert.match(icons[0]?.src ?? '', /height=192/);
  assert.match(icons[0]?.src ?? '', /crop=center/);
  assert.match(icons[0]?.src ?? '', /v=1/);
  assert.equal(manifestIcons(null)[0]?.src, '/favicon.svg');
});

test('manifest from settings', () => {
  const m = buildManifest({ settings, shopName: 'Shop', iconUrl: null, lang: 'fr-ca' });
  assert.equal(m.name, 'Bagru Prints');
  assert.equal(m.short_name, 'Bagru Prints');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/');
  assert.equal(m.theme_color, '#123456');
  assert.equal(m.background_color, '#fafafa');
  assert.equal(m.lang, 'fr-ca');
  const long = buildManifest({ settings: {}, shopName: 'A'.repeat(80), iconUrl: null });
  assert.equal(long.name.length, 45);
  assert.equal(long.short_name.length, 12);
  assert.equal(buildManifest({ settings: {}, shopName: '  ', iconUrl: null }).name, 'Store');
});

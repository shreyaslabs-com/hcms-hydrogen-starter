import assert from 'node:assert/strict';
import test from 'node:test';

import { customDefinitions, customLoaders, typeFromPath } from '../app/sections/custom-registry.ts';

const def = (type: string, extra: Record<string, unknown> = {}) => ({
  type,
  name: type,
  component: () => null,
  ...extra,
});

test('the file name is the type', () => {
  assert.equal(typeFromPath('./custom/promo-banner.tsx'), 'promo-banner');
  assert.equal(typeFromPath('./custom/blocks/badge.browser.tsx'), 'badge');
});

test('server: one definition per file, checked against the file name', () => {
  const promo = def('promo-banner');
  const hero = def('hero');
  assert.deepEqual(
    customDefinitions({
      './custom/promo-banner.tsx': { promoBanner: promo, helper: 1 },
      './custom/hero.tsx': { hero, default: hero },
      './custom/hero.browser.tsx': { hero: def('hero') },
    }),
    [hero, promo],
  );
  assert.throws(
    () => customDefinitions({ './custom/utils.tsx': { cn: () => '' } }),
    /app\/sections\/custom\/utils\.tsx exports no section or block definition/,
  );
  assert.throws(
    () => customDefinitions({ './custom/promo.tsx': { promo: def('promo-banner') } }),
    /defines type "promo-banner", but the file name says "promo"/,
  );
  assert.throws(
    () => customDefinitions({ './custom/a.tsx': { a: def('a'), b: def('b') } }),
    /exports 2 definitions \(a, b\)/,
  );
});

test('browser: one lazy loader per type; a .browser.tsx half wins', async () => {
  const full = def('hero', { settings: [] });
  const light = def('hero');
  const loads: string[] = [];
  const mod = (path: string, value: Record<string, unknown>) => () => {
    loads.push(path);
    return Promise.resolve(value);
  };
  const loaders = customLoaders({
    './custom/hero.tsx': mod('full', { hero: full }),
    './custom/hero.browser.tsx': mod('light', { hero: light }),
    './custom/promo-banner.tsx': mod('promo', { x: 1, promoBanner: def('promo-banner') }),
  });
  assert.deepEqual(Object.keys(loaders).sort(), ['hero', 'promo-banner']);
  assert.deepEqual(loads, [], 'nothing loads until the type is needed');
  assert.equal(await loaders.hero?.load(), light);
  assert.equal(((await loaders['promo-banner']?.load()) as { type: string }).type, 'promo-banner');
  assert.deepEqual(loads, ['light', 'promo']);
});

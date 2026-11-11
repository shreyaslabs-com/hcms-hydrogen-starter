import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectionCrumbsOn,
  crumbCollectionHandle,
  productCrumbs,
} from '../app/lib/hcms/product-crumbs.ts';

const template = (settings: Record<string, unknown>, disabled = false) => ({
  order: ['hero', 'main'],
  sections: {
    hero: { type: 'image-banner', settings: { show_breadcrumbs: true } },
    main: { type: 'main-product', settings, disabled },
  },
});

test('off by default (today’s product page)', () => {
  assert.equal(productCrumbs(template({}), 'Kurta'), undefined);
  assert.equal(productCrumbs(null, 'Kurta'), undefined);
});

test('main-product show_breadcrumbs → Home / product', () => {
  assert.deepEqual(productCrumbs(template({ show_breadcrumbs: true }), 'Kurta'), [
    { label: 'Kurta' },
  ]);
  assert.equal(productCrumbs(template({ show_breadcrumbs: true }, true), 'Kurta'), undefined);
  assert.equal(productCrumbs(template({ show_breadcrumbs: 'true' }), 'Kurta'), undefined);
});

test('T-2.158: Home / collection / product (setting on by default, off = product only)', () => {
  const on = template({ show_breadcrumbs: true });
  const coll = { handle: 'hair-care', title: 'Hair care' };
  assert.deepEqual(productCrumbs(on, 'Serum', coll), [
    { label: 'Hair care', to: '/collections/hair-care' },
    { label: 'Serum' },
  ]);
  assert.deepEqual(productCrumbs(on, 'Serum', null), [{ label: 'Serum' }]);
  const off = template({ show_breadcrumbs: true, breadcrumbs_collection: false });
  assert.deepEqual(productCrumbs(off, 'Serum', coll), [{ label: 'Serum' }]);
  assert.equal(productCrumbs(template({}), 'Serum', coll), undefined);
});

test('T-2.158: ?collection= only passes plain handles', () => {
  const at = (q: string) => crumbCollectionHandle(new URL(`https://x.test/products/a${q}`));
  assert.equal(at('?collection=hair-care'), 'hair-care');
  assert.equal(at(''), '');
  assert.equal(at('?collection=a%22b'), '');
  assert.equal(at('?collection=%20'), '');
});

test('T-2.160: collection breadcrumbs on unless the banner turns them off', () => {
  const banner = (settings: Record<string, unknown>, disabled = false) => ({
    sections: { banner: { type: 'main-collection-banner', settings, disabled } },
  });
  assert.equal(collectionCrumbsOn(null), true);
  assert.equal(collectionCrumbsOn(banner({})), true);
  assert.equal(collectionCrumbsOn(banner({ show_breadcrumbs: false })), false);
  assert.equal(collectionCrumbsOn(banner({ show_breadcrumbs: false }, true)), true);
});

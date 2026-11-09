import assert from 'node:assert/strict';
import test from 'node:test';

import { productCrumbs } from '../app/lib/hcms/product-crumbs.ts';

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

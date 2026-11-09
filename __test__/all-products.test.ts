import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALL_PRODUCTS_TITLE_KEY,
  allProductsTitle,
  collectionMetaOrAll,
  isSyntheticCollection,
  syntheticAllCollection,
} from '../app/lib/hcms/all-products.ts';

test('a real collection always wins, including a merchant-made `all`', () => {
  const real = { id: 'gid://shopify/Collection/1', handle: 'all', title: 'Everything' };
  assert.equal(collectionMetaOrAll('all', real), real);
  assert.equal(isSyntheticCollection(real), false);
});

test('missing `all` is synthesized; any other missing handle stays a 404', () => {
  const meta = collectionMetaOrAll('all', null);
  assert.deepEqual(meta, syntheticAllCollection());
  assert.deepEqual(meta, {
    id: '',
    handle: 'all',
    title: 'Products',
    description: '',
    seo: null,
    image: null,
  });
  assert.ok(meta && isSyntheticCollection(meta));
  assert.equal(collectionMetaOrAll('missing', null), null);
  assert.equal(collectionMetaOrAll('missing', undefined), null);
  assert.equal(collectionMetaOrAll('ALL', null), null);
  assert.equal(collectionMetaOrAll('all', null, 'Tous les produits')?.title, 'Tous les produits');
});

test('title comes from theme content with a "Products" default', () => {
  assert.equal(allProductsTitle(undefined), 'Products');
  assert.equal(allProductsTitle({}), 'Products');
  assert.equal(allProductsTitle({ [ALL_PRODUCTS_TITLE_KEY]: '  ' }), 'Products');
  assert.equal(allProductsTitle({ [ALL_PRODUCTS_TITLE_KEY]: 7 }), 'Products');
  assert.equal(allProductsTitle({ [ALL_PRODUCTS_TITLE_KEY]: 'Produits' }), 'Produits');
});

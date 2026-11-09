import assert from 'node:assert/strict';
import test from 'node:test';

import { fieldText, metaobjectSeo } from '../app/lib/hcms/metaobject-seo.ts';

const rich = JSON.stringify({
  type: 'root',
  children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Hand block printer' }] }],
});

test('renderable meta fields become resource SEO; rich text flattened', () => {
  const seo = metaobjectSeo({
    handle: 'hansaben',
    fields: [
      { key: 'name', type: 'single_line_text_field', value: 'Hansaben' },
      { key: 'bio', type: 'rich_text_field', value: rich },
      {
        key: 'portrait',
        type: 'file_reference',
        value: 'gid://shopify/MediaImage/1',
        reference: { __typename: 'MediaImage', image: { url: 'https://cdn.shopify.com/a.jpg' } },
      },
    ],
    seo: {
      title: { type: 'single_line_text_field', value: 'Meet Hansaben' },
      description: { type: 'rich_text_field', value: rich },
    },
  });
  assert.equal(seo.title, 'Hansaben');
  assert.equal(seo.description, 'Hand block printer');
  assert.equal(seo.image?.url, 'https://cdn.shopify.com/a.jpg');
  assert.deepEqual(seo.resourceSeo, { title: 'Meet Hansaben', description: 'Hand block printer' });
});

test('no renderable capability: falls back to entry fields and handle', () => {
  const seo = metaobjectSeo({ handle: 'store_location', fields: [], seo: null });
  assert.equal(seo.title, 'Store location');
  assert.equal(seo.description, null);
  assert.equal(seo.image, null);
  assert.deepEqual(seo.resourceSeo, { title: null, description: null });
});

test('fieldText ignores JSON and references', () => {
  assert.equal(fieldText({ type: 'json', value: '{"a":1}' }), null);
  assert.equal(fieldText({ type: 'metaobject_reference', value: 'gid://x' }), null);
  assert.equal(fieldText({ type: 'single_line_text_field', value: '  ' }), null);
  assert.equal(fieldText(null), null);
});

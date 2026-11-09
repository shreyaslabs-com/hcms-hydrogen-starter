import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fillLibrarySamples,
  SAMPLE_LINK,
  SAMPLE_LIST_SIZE,
  sampleEndDate,
  sampleRole,
} from '../app/lib/hcms/library-samples.ts';

const manifest = {
  blocks: [{ type: 'image', name: 'Image', settings: [{ type: 'image_picker', id: 'image' }] }],
  sections: [
    {
      type: 'banner',
      name: 'Banner',
      settings: [
        { type: 'image_picker', id: 'image' },
        { type: 'image_picker', id: 'image_mobile' },
        { type: 'text', id: 'heading' },
      ],
      blocks: [{ type: '@theme' }],
    },
    {
      type: 'featured',
      name: 'Featured',
      settings: [
        { type: 'collection', id: 'collection' },
        { type: 'product', id: 'product' },
        { type: 'product_list', id: 'products' },
        { type: 'collection_list', id: 'collections' },
      ],
    },
  ],
} as never;

const samples = {
  images: [
    {
      id: 'gid://shopify/ProductImage/1',
      url: 'https://cdn.shopify.com/a.jpg',
      width: 800,
      height: 600,
    },
    {
      id: 'gid://shopify/ProductImage/2',
      url: 'https://cdn.shopify.com/b.jpg',
      width: 800,
      height: 600,
      alt: 'B',
    },
  ],
  products: [
    'gid://shopify/Product/1',
    'gid://shopify/Product/2',
    'gid://shopify/Product/3',
    'gid://shopify/Product/4',
    'gid://shopify/Product/5',
  ],
  collections: ['gid://shopify/Collection/1'],
};

const template = {
  order: ['a', 'b', 'c', 'saved'],
  sections: {
    a: {
      type: 'banner',
      settings: { heading: 'Hi' },
      blocks: { x: { type: 'image', settings: {} } },
      block_order: ['x'],
    },
    b: { type: 'featured', settings: {}, blocks: {}, block_order: [] },
    c: {
      type: 'banner',
      settings: { image: { $file: 'gid://shopify/MediaImage/9' } },
      blocks: {},
      block_order: [],
    },
    saved: { type: 'banner', settings: {}, blocks: {}, block_order: [] },
  },
} as never;

test('fills empty images (rotating), resources and lists; keeps set values and saved components', () => {
  const { template: out, assets } = fillLibrarySamples(
    template,
    manifest,
    ['a', 'b', 'c'],
    samples,
  );
  const s = (
    out as {
      sections: Record<
        string,
        {
          settings: Record<string, unknown>;
          blocks?: Record<string, { settings: Record<string, unknown> }>;
        }
      >;
    }
  ).sections;
  assert.deepEqual(s.a?.settings.image, { $file: 'gid://shopify/ProductImage/1' });
  assert.equal(s.a?.settings.image_mobile, undefined, 'mobile images fall back to desktop');
  assert.equal(s.a?.settings.heading, 'Hi');
  assert.deepEqual(s.a?.blocks?.x?.settings.image, { $file: 'gid://shopify/ProductImage/2' });
  assert.equal(s.b?.settings.collection, 'gid://shopify/Collection/1');
  assert.equal(s.b?.settings.product, 'gid://shopify/Product/1');
  assert.equal((s.b?.settings.products as string[]).length, SAMPLE_LIST_SIZE);
  assert.deepEqual(s.b?.settings.collections, ['gid://shopify/Collection/1']);
  assert.deepEqual(s.c?.settings.image, { $file: 'gid://shopify/MediaImage/9' });
  assert.deepEqual(s.saved?.settings, {}, 'saved components stay as saved');
  assert.deepEqual(assets['gid://shopify/ProductImage/2'], {
    type: 'image',
    url: 'https://cdn.shopify.com/b.jpg',
    width: 800,
    height: 600,
    alt: 'B',
  });
});

test('no samples: nothing changes', () => {
  const { template: out, assets } = fillLibrarySamples(template, manifest, ['a', 'b'], {
    images: [],
    products: [],
    collections: [],
  });
  assert.deepEqual(out, template);
  assert.deepEqual(assets, {});
});

test('picks a picture by role, with the sample pack first and store images as fallback', () => {
  assert.equal(sampleRole('image-banner', null, 'image'), 'banner');
  assert.equal(sampleRole('testimonials', 'testimonial', 'image'), 'portrait');
  assert.equal(sampleRole('logo-list', 'logo', 'image'), 'logo');
  assert.equal(sampleRole('featured-blog', null, 'image'), 'editorial');
  assert.equal(sampleRole('image-with-text', null, 'image'), 'lifestyle');
  const pack = {
    banner: [
      {
        id: 'gid://hcms/LibrarySample/b.jpg',
        url: 'https://admin.test/library-samples/b.jpg',
        width: 1600,
        height: 900,
      },
    ],
  };
  const { template: out } = fillLibrarySamples(template, manifest, ['a'], { ...samples, pack });
  const a = (
    out as {
      sections: Record<
        string,
        {
          settings: Record<string, unknown>;
          blocks: Record<string, { settings: Record<string, unknown> }>;
        }
      >;
    }
  ).sections.a;
  // Section "banner" → banner pack, its image block too (still a banner picture).
  assert.deepEqual(a?.settings.image, { $file: 'gid://hcms/LibrarySample/b.jpg' });
  assert.deepEqual(a?.blocks.x?.settings.image, { $file: 'gid://hcms/LibrarySample/b.jpg' });
  // No pack for the role → the store's own pictures.
  assert.deepEqual(
    fillLibrarySamples(template, manifest, ['c2'], { ...samples, pack }).template as never,
    template,
  );
});

test('before/after gets the matching pair; images in a section share a shape', () => {
  assert.equal(sampleRole('image-compare', null, 'before_image'), 'before');
  assert.equal(sampleRole('image-compare', null, 'after_image'), 'after');
  assert.equal(sampleRole('hotspots', null, 'image'), 'banner');
  const lifestyle = [
    { id: 'gid://hcms/LibrarySample/1', url: 'https://a.test/tall.jpg', width: 800, height: 1200 },
    { id: 'gid://hcms/LibrarySample/2', url: 'https://a.test/wide.jpg', width: 1200, height: 800 },
    { id: 'gid://hcms/LibrarySample/3', url: 'https://a.test/tall2.jpg', width: 800, height: 1200 },
  ];
  const m = {
    blocks: [{ type: 'image', name: 'Image', settings: [{ type: 'image_picker', id: 'image' }] }],
    sections: [
      { type: 'multicolumn', name: 'Multicolumn', settings: [], blocks: [{ type: '@theme' }] },
    ],
  } as never;
  const t = {
    order: ['m'],
    sections: {
      m: {
        type: 'multicolumn',
        settings: {},
        blocks: { a: { type: 'image', settings: {} }, b: { type: 'image', settings: {} } },
        block_order: ['a', 'b'],
      },
    },
  } as never;
  const { template: out } = fillLibrarySamples(t, m, ['m'], { ...samples, pack: { lifestyle } });
  const blocks = (
    out as {
      sections: Record<string, { blocks: Record<string, { settings: Record<string, unknown> }> }>;
    }
  ).sections.m?.blocks;
  // First pick is tall, so the second skips the wide one.
  assert.deepEqual(blocks?.a?.settings.image, { $file: 'gid://hcms/LibrarySample/1' });
  assert.deepEqual(blocks?.b?.settings.image, { $file: 'gid://hcms/LibrarySample/3' });
});

test('empty links point at the catalogue and countdowns get an end date two weeks out', () => {
  const m = {
    blocks: [],
    sections: [
      {
        type: 'countdown',
        name: 'Countdown',
        settings: [
          { type: 'text', id: 'end_date' },
          { type: 'url', id: 'link' },
          { type: 'url', id: 'set_link' },
        ],
      },
    ],
  } as never;
  const t = {
    order: ['s'],
    sections: { s: { type: 'countdown', settings: { set_link: '/pages/x' } } },
  } as never;
  const now = new Date('2026-11-08T10:00:00Z');
  const { template: out } = fillLibrarySamples(t, m, ['s'], samples, now);
  const settings = (out.sections.s as { settings: Record<string, unknown> }).settings;
  assert.equal(settings.link, SAMPLE_LINK);
  assert.equal(settings.set_link, '/pages/x');
  assert.equal(settings.end_date, '2026-11-22T10:00Z');
  assert.equal(sampleEndDate(now), '2026-11-22T10:00Z');
});

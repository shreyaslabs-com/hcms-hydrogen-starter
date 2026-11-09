import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTitle,
  isSeoHidden,
  pageSeo,
  seoContext,
  seoMeta,
  shareImage,
} from '../app/lib/hcms/seo.ts';

test('T-2.7: share images are cropped to 1200×630 on the Shopify CDN, never upscaled', () => {
  const big = shareImage({
    url: 'https://cdn.shopify.com/s/files/a.jpg?v=1',
    width: 3000,
    height: 3000,
  });
  assert.equal(
    big.url,
    'https://cdn.shopify.com/s/files/a.jpg?v=1&width=1200&height=630&crop=center',
  );
  assert.deepEqual([big.width, big.height], [1200, 630]);
  const small = shareImage({ url: 'https://cdn.shopify.com/b.png', width: 800, height: 300 });
  assert.deepEqual([small.width, small.height], [571, 300]);
  const other = { url: 'https://example.com/c.png', width: 50, height: 50 };
  assert.equal(shareImage(other), other);
  const tags = seoMeta({ title: 'T', image: { url: 'https://cdn.shopify.com/d.jpg' } });
  assert.ok(
    tags.some((t) => 'property' in t && t.property === 'og:image:width' && t.content === '1200'),
  );
});

const img = {
  url: 'https://cdn.shopify.com/share.jpg',
  width: 1200,
  height: 630,
  altText: 'Share',
};
const image = (v: unknown) =>
  (v as { $file?: string } | null)?.$file === 'gid://shopify/MediaImage/1' ? img : null;

const ctx = seoContext(
  {
    defaults: {
      title_format: '{title} | {shop}',
      home_title: 'Acme — outdoor gear',
      home_description: 'Gear for every trail.',
      share_image: { $file: 'gid://shopify/MediaImage/1' },
    },
    overrides: {
      'page.contact': { title: 'Talk to us', noindex: true },
      product: { description: 'Template description' },
      bad: 'x',
      empty: { title: '  ' },
      other: { image: { $file: 'gid://shopify/MediaImage/404' } },
    },
  },
  image,
);

test('seo: context is sanitized (empty / broken overrides dropped)', () => {
  assert.deepEqual(Object.keys(ctx.overrides), ['page.contact', 'product']);
  assert.equal(ctx.shareImage?.url, img.url);
  const none = seoContext(undefined, image);
  assert.deepEqual(none, {
    titleFormat: null,
    homeTitle: null,
    homeDescription: null,
    shareImage: null,
    overrides: {},
  });
});

test('seo: title format and shop name dedupe', () => {
  assert.equal(formatTitle(null, 'Shirt', 'Acme'), 'Shirt · Acme');
  assert.equal(formatTitle('{shop}: {title}', 'Shirt', 'Acme'), 'Acme: Shirt');
  assert.equal(formatTitle(null, 'Acme Shirt', 'Acme'), 'Acme Shirt');
  assert.equal(formatTitle(null, '', 'Acme'), 'Acme');
});

test('seo: home uses the Preferences title and description as is', () => {
  const seo = pageSeo(ctx, { template: 'index', type: 'index', title: 'Home', shopName: 'Acme' });
  assert.equal(seo.title, 'Acme — outdoor gear');
  assert.equal(seo.description, 'Gear for every trail.');
  assert.equal(seo.image?.url, img.url);
  const plain = pageSeo(null, { template: null, type: 'index', title: 'Home', shopName: 'Acme' });
  assert.equal(plain.title, 'Home · Acme');
});

test('seo: Shopify resource SEO > template override > resource > defaults', () => {
  const product = pageSeo(ctx, {
    template: 'product.alt',
    type: 'product',
    title: 'Shirt',
    description: 'Soft cotton',
    resourceSeo: { title: 'Best shirt', description: null },
    shopName: 'Acme',
    ogType: 'product',
  });
  assert.equal(product.title, 'Best shirt | Acme');
  assert.equal(product.description, 'Template description', 'falls back to the type override');
  assert.equal(product.type, 'product');

  const contact = pageSeo(ctx, {
    template: 'page.contact',
    type: 'page',
    title: 'Contact',
    shopName: 'Acme',
  });
  assert.equal(contact.title, 'Talk to us | Acme');
  assert.equal(contact.noindex, true);
  assert.equal(contact.description, 'Gear for every trail.');
  const tags = seoMeta(contact);
  assert.ok(tags.some((t) => 'name' in t && t.name === 'robots'));
});

test('T-2.48: Shopify seo.hidden → noindex; shop description is the store-wide fallback', () => {
  assert.equal(isSeoHidden({ value: '1' }), true);
  assert.equal(isSeoHidden({ value: ' TRUE ' }), true);
  assert.equal(isSeoHidden({ value: '0' }), false);
  assert.equal(isSeoHidden(null), false);

  const ctx = seoContext({}, () => null, { description: 'Hand block printed textiles.' });
  assert.equal(ctx.homeDescription, 'Hand block printed textiles.');
  const themed = seoContext({ defaults: { home_description: 'Theme text' } }, () => null, {
    description: 'Shop text',
  });
  assert.equal(themed.homeDescription, 'Theme text');

  const page = pageSeo(ctx, {
    template: 'product',
    type: 'product',
    title: 'Kurta',
    shopName: 'Bagru',
    hidden: { value: '1' },
  });
  assert.equal(page.noindex, true);
  assert.equal(page.description, 'Hand block printed textiles.');
  const tags = seoMeta(page);
  assert.ok(
    tags.some((t) => 'name' in t && t.name === 'robots' && t.content === 'noindex, nofollow'),
  );
  assert.equal(
    pageSeo(ctx, { template: 'product', type: 'product', title: 'K', shopName: 'B' }).noindex,
    undefined,
  );
});

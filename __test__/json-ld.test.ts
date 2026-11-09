import assert from 'node:assert/strict';
import test from 'node:test';

import {
  articleJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from '../app/lib/hcms/json-ld.ts';

test('json-ld: serialization cannot close the script element', () => {
  const out = serializeJsonLd({ name: '</script><script>alert(1)</script> &  ' });
  assert.ok(!out.includes('<') && !out.includes('>') && !out.includes('&'));
  assert.ok(!out.includes(' '));
  assert.deepEqual(JSON.parse(out), { name: '</script><script>alert(1)</script> &  ' });
});

test('json-ld: organization + website', () => {
  const org = organizationJsonLd({
    name: 'Acme',
    origin: 'https://acme.test',
    logo: { url: 'https://cdn.shopify.com/logo.png', width: 200, height: null },
    sameAs: ['https://instagram.com/acme', 'javascript:alert(1)'],
  });
  assert.equal(org['@type'], 'Organization');
  assert.deepEqual(org.logo, {
    '@type': 'ImageObject',
    url: 'https://cdn.shopify.com/logo.png',
    width: 200,
  });
  assert.deepEqual(org.sameAs, ['https://instagram.com/acme']);
  const site = websiteJsonLd({ name: 'Acme', origin: 'https://acme.test' });
  assert.equal(
    (site.potentialAction as { target: { urlTemplate: string } }).target.urlTemplate,
    'https://acme.test/search?q={search_term_string}',
  );
  assert.deepEqual(site.publisher, { '@id': 'https://acme.test/#organization' });
});

test('json-ld: article', () => {
  const ld = articleJsonLd({
    title: 'x'.repeat(200),
    url: 'https://acme.test/blogs/news/hello',
    publishedAt: '2026-11-01T00:00:00Z',
    excerpt: null,
    author: 'Sam',
    image: null,
    shopName: 'Acme',
    origin: 'https://acme.test',
  });
  assert.equal((ld.headline as string).length, 110);
  assert.deepEqual(ld.author, { '@type': 'Person', name: 'Sam' });
  assert.equal('description' in ld, false);
  assert.deepEqual(ld.mainEntityOfPage, {
    '@type': 'WebPage',
    '@id': 'https://acme.test/blogs/news/hello',
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { atomBlogHandle, atomFeed, atomResponse } from '../app/lib/hcms/atom.ts';

test('matches /blogs/<handle>.atom with an optional market prefix', () => {
  assert.equal(atomBlogHandle('/blogs/news.atom'), 'news');
  assert.equal(atomBlogHandle('/fr-ca/blogs/journal.atom'), 'journal');
  assert.equal(atomBlogHandle('/blogs/news'), null);
  assert.equal(atomBlogHandle('/blogs/news/post.atom'), null);
  assert.equal(atomBlogHandle('/blogs/%E0%A4.atom'), null);
});

test('builds an escaped Atom feed with entries, authors, tags and the self link', () => {
  const xml = atomFeed({
    origin: 'https://store.example',
    prefix: '/fr-ca',
    shopName: 'Bagru & Co',
    blog: {
      handle: 'news',
      title: 'News',
      seo: { description: 'Notes <from> the workshop' },
      articles: {
        nodes: [
          {
            id: 'gid://shopify/Article/1',
            handle: 'indigo',
            title: 'Indigo "vats"',
            publishedAt: '2026-11-01T10:00:00Z',
            contentHtml: '<p>Hello <b>dye</b></p>',
            excerptHtml: '<p>Hello</p>',
            authorV2: { name: 'Ann' },
            tags: ['dye', 'a&b'],
            image: { url: 'https://cdn.shopify.com/i.jpg' },
          },
        ],
      },
    },
  });
  assert.match(
    xml,
    /^<\?xml version="1.0" encoding="UTF-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/,
  );
  assert.ok(xml.includes('<title>Bagru &amp; Co - News</title>'));
  assert.ok(xml.includes('<subtitle>Notes &lt;from&gt; the workshop</subtitle>'));
  assert.ok(xml.includes('href="https://store.example/fr-ca/blogs/news.atom"'));
  assert.ok(xml.includes('href="https://store.example/fr-ca/blogs/news/indigo"'));
  assert.ok(xml.includes('<title>Indigo &quot;vats&quot;</title>'));
  assert.ok(
    xml.includes('<content type="html">&lt;p&gt;Hello &lt;b&gt;dye&lt;/b&gt;&lt;/p&gt;</content>'),
  );
  assert.ok(xml.includes('<category term="a&amp;b"/>'));
  assert.ok(xml.includes('<author><name>Ann</name></author>'));
  assert.ok(xml.includes('<updated>2026-11-01T10:00:00Z</updated>'));
  assert.ok(!xml.includes('<b>'));
});

test('empty blog still yields a valid feed; response is cacheable Atom', () => {
  const xml = atomFeed({
    origin: 'https://s.example',
    prefix: '',
    shopName: 'S',
    blog: { handle: 'n', title: 'N', articles: { nodes: [] } },
  });
  assert.ok(xml.includes('<updated>1970-01-01T00:00:00.000Z</updated>'));
  const res = atomResponse(xml);
  assert.equal(res.headers.get('Content-Type'), 'application/atom+xml; charset=utf-8');
  assert.match(res.headers.get('Cache-Control') ?? '', /max-age=900/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseGid, parseMetafield } from '../app/lib/hcms/metafield.ts';
import { getCursorVariables, paginationLinks } from '../app/lib/hcms/pagination.ts';
import { parseRichText, richTextToPlainText, safeUrl } from '../app/lib/hcms/rich-text.ts';
import * as seo from '../app/lib/hcms/seo.ts';
import { seoMeta, truncate } from '../app/lib/hcms/seo.ts';
import {
  escapeXml,
  sitemapIndexXml,
  urlsetXml,
  SITEMAP_MAX_URLS,
} from '../app/lib/hcms/sitemap.ts';
import {
  hostedVideoMode,
  orderVideoSources,
  parseVideoUrl,
  videoAspectRatio,
  videoEmbedUrl,
  videoThumbnailUrl,
} from '../app/lib/hcms/video.ts';
import {
  DESKTOP_MEDIA,
  MOBILE_MEDIA,
  artDirectedPreloads,
  focalToObjectPosition,
  imageSrcSet,
  shopifyImageUrl,
} from '../app/lib/image.ts';

test('image: only Shopify CDN hosts are rewritten', () => {
  assert.equal(
    shopifyImageUrl('https://images.unsplash.com/a.jpg?w=10', { width: 100 }),
    'https://images.unsplash.com/a.jpg?w=10',
  );
  assert.equal(
    shopifyImageUrl('https://demostore.mock.shop/a.jpg', { width: 100 }),
    'https://demostore.mock.shop/a.jpg?width=100',
  );
});

test('image: srcset never upscales and adds crop for a fixed ratio', () => {
  const set = imageSrcSet('https://cdn.shopify.com/a.jpg', { intrinsicWidth: 700 });
  assert.deepEqual(
    set.split(', ').map((c) => c.split(' ')[1]),
    ['320w', '480w', '640w', '700w'],
  );
  const square = imageSrcSet('https://cdn.shopify.com/a.jpg', { widths: [400], aspectRatio: 1 });
  assert.equal(square, 'https://cdn.shopify.com/a.jpg?width=400&height=400&crop=center 400w');
  assert.equal(
    imageSrcSet('https://cdn.shopify.com/a.jpg', { intrinsicWidth: 100 }),
    'https://cdn.shopify.com/a.jpg?width=100 100w',
  );
});

test('image: art-directed LCP preloads are media-scoped, one per viewport (T-2.132)', () => {
  const desktop = { srcSet: 'd.jpg?width=1600 1600w', sizes: '(min-width: 48rem) 50vw, 100vw' };
  const mobile = { srcSet: 'm.jpg?width=480 480w', sizes: '100vw' };
  assert.deepEqual(artDirectedPreloads(desktop, mobile), [
    { imageSrcSet: 'm.jpg?width=480 480w', imageSizes: '100vw', media: MOBILE_MEDIA },
    {
      imageSrcSet: 'd.jpg?width=1600 1600w',
      imageSizes: '(min-width: 48rem) 50vw, 100vw',
      media: DESKTOP_MEDIA,
    },
  ]);
  // The two media queries split at Tailwind `md` (48rem) with no gap and no overlap, and match the
  // `<source media>` + the `.hcms-art` focal rule, so exactly one preload applies per width.
  assert.equal(MOBILE_MEDIA, '(max-width: 47.99rem)');
  assert.equal(DESKTOP_MEDIA, '(min-width: 48rem)');
  const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`@media ${MOBILE_MEDIA}`));
});

test('image: focal point to object-position', () => {
  assert.equal(focalToObjectPosition({ x: 0.4, y: 0.666 }), '40% 66.6%');
  assert.equal(focalToObjectPosition({ x: -1, y: 2 }), '0% 100%');
  assert.equal(focalToObjectPosition(null), undefined);
});

test('parseGid', () => {
  assert.deepEqual(parseGid('gid://shopify/Product/123'), {
    resource: 'Product',
    id: '123',
    search: '',
  });
  assert.deepEqual(parseGid('gid://shopify/ProductVariant/9?x=1'), {
    resource: 'ProductVariant',
    id: '9',
    search: '?x=1',
  });
  assert.equal(parseGid('Product/1'), null);
  assert.equal(parseGid(null), null);
});

test('parseMetafield scalars', () => {
  assert.deepEqual(parseMetafield({ type: 'boolean', value: 'true' }), {
    type: 'boolean',
    value: true,
  });
  assert.deepEqual(parseMetafield({ type: 'number_decimal', value: '2.5' }), {
    type: 'number',
    value: 2.5,
  });
  assert.deepEqual(
    parseMetafield({ type: 'money', value: '{"amount":"9.50","currency_code":"INR"}' }),
    {
      type: 'money',
      value: { amount: '9.50', currencyCode: 'INR' },
    },
  );
  assert.deepEqual(parseMetafield({ type: 'weight', value: '{"value":2,"unit":"KILOGRAMS"}' }), {
    type: 'measurement',
    value: { value: 2, unit: 'KILOGRAMS' },
  });
  assert.deepEqual(
    parseMetafield({ type: 'rating', value: '{"value":"4.5","scale_min":"1","scale_max":"5"}' }),
    { type: 'rating', value: { value: 4.5, scaleMin: 1, scaleMax: 5 } },
  );
  assert.equal(parseMetafield({ type: 'date', value: '2026-11-06' })?.type, 'date');
  assert.deepEqual(parseMetafield({ type: 'json', value: 'not json' }), {
    type: 'json',
    value: null,
  });
  assert.deepEqual(parseMetafield({ type: 'single_line_text_field', value: 'Cotton' }), {
    type: 'string',
    value: 'Cotton',
  });
  assert.equal(parseMetafield({ type: 'boolean', value: null }), null);
  assert.equal(parseMetafield(null), null);
});

test('parseMetafield lists and references', () => {
  assert.deepEqual(parseMetafield({ type: 'list.number_integer', value: '[1,2]' }), {
    type: 'list',
    value: [1, 2],
  });
  assert.deepEqual(parseMetafield({ type: 'list.single_line_text_field', value: '["a","b"]' }), {
    type: 'list',
    value: ['a', 'b'],
  });
  assert.deepEqual(
    parseMetafield({
      type: 'list.product_reference',
      value: '[]',
      references: { nodes: [{ id: 'p1' }] },
    }),
    { type: 'list', value: [{ id: 'p1' }] },
  );
  assert.deepEqual(
    parseMetafield({ type: 'file_reference', value: 'gid://x', reference: { id: 'f' } }),
    {
      type: 'reference',
      value: { id: 'f' },
    },
  );
  assert.deepEqual(parseMetafield({ type: 'list.date', value: 'oops' }), {
    type: 'list',
    value: [],
  });
});

const richText = {
  type: 'root',
  children: [
    { type: 'heading', level: 2, children: [{ type: 'text', value: 'Care' }] },
    {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'Hand wash ', bold: true },
        { type: 'link', url: 'javascript:alert(1)', children: [{ type: 'text', value: 'bad' }] },
        {
          type: 'link',
          url: '/pages/care',
          target: '_blank',
          children: [{ type: 'text', value: 'more' }],
        },
      ],
    },
    {
      type: 'list',
      listType: 'ordered',
      children: [{ type: 'list-item', children: [{ type: 'text', value: 'Dry flat' }] }],
    },
    { type: 'script', children: [] },
  ],
};

test('rich text: normalizes, drops unsafe links and unknown nodes', () => {
  const tree = parseRichText(JSON.stringify(richText));
  assert.ok(tree && tree.type === 'root');
  assert.equal(tree.children.length, 3);
  const paragraph = tree.children[1];
  assert.ok(paragraph && paragraph.type === 'paragraph');
  assert.equal(paragraph.children[1]?.type, 'paragraph'); // unsafe link → plain content
  assert.deepEqual(paragraph.children[2], {
    type: 'link',
    url: '/pages/care',
    newTab: true,
    children: [{ type: 'text', value: 'more', bold: false, italic: false }],
  });
  assert.equal(richTextToPlainText(tree), 'Care\nHand wash badmore\nDry flat');
  assert.equal(parseRichText('{bad'), null);
  assert.equal(parseRichText({ type: 'paragraph', children: [] }), null);
});

test('rich text: safeUrl', () => {
  assert.equal(safeUrl('https://x.io'), 'https://x.io');
  assert.equal(safeUrl('mailto:a@b.c'), 'mailto:a@b.c');
  assert.equal(safeUrl('#top'), '#top');
  assert.equal(safeUrl('//evil.com'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
  assert.equal(safeUrl(''), null);
});

test('video: parse YouTube and Vimeo URLs', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/embed/dQw4w9WgXcQ',
  ]) {
    assert.deepEqual(parseVideoUrl(url), { provider: 'youtube', id: 'dQw4w9WgXcQ' }, url);
  }
  assert.deepEqual(parseVideoUrl('https://vimeo.com/76979871'), {
    provider: 'vimeo',
    id: '76979871',
  });
  assert.deepEqual(parseVideoUrl('https://player.vimeo.com/video/76979871'), {
    provider: 'vimeo',
    id: '76979871',
  });
  assert.equal(parseVideoUrl('https://example.com/v.mp4'), null);
  assert.equal(parseVideoUrl('nope'), null);
  assert.equal(parseVideoUrl('https://www.youtube.com/watch'), null);
});

test('video: embeds, thumbnails and source order', () => {
  assert.equal(
    videoEmbedUrl({ provider: 'youtube', id: 'abc' }),
    'https://www.youtube-nocookie.com/embed/abc?autoplay=1&rel=0&playsinline=1',
  );
  assert.equal(
    videoEmbedUrl({ provider: 'vimeo', id: '1' }, { autoplay: false }),
    'https://player.vimeo.com/video/1?dnt=1',
  );
  assert.equal(videoThumbnailUrl({ provider: 'vimeo', id: '1' }), null);
  assert.deepEqual(
    orderVideoSources([
      { url: 'a.mp4', mime: 'video/mp4', width: 480 },
      { url: 'b.mp4', mime: 'video/mp4', width: 1080 },
      { url: 'c.m3u8', mime: 'application/x-mpegURL' },
    ]).map((s) => s.url),
    ['c.m3u8', 'b.mp4', 'a.mp4'],
  );
});

test('video: hosted mode (facade only with a poster) and aspect ratio', () => {
  assert.equal(hostedVideoMode({ autoPlay: true, poster: { url: 'p.jpg' } }), 'autoplay');
  assert.equal(hostedVideoMode({ poster: { url: 'p.jpg' } }), 'facade');
  assert.equal(hostedVideoMode({ poster: null }), 'native');
  assert.equal(
    videoAspectRatio([
      { url: 'a.mp4', mime: 'video/mp4', width: 480, height: 270 },
      { url: 'b.mp4', mime: 'video/mp4', width: 1080, height: 1920 },
    ]),
    0.5625,
  );
  assert.equal(videoAspectRatio([], { width: 4, height: 3 }), 1.3333);
  assert.equal(videoAspectRatio([{ url: 'h.m3u8', mime: 'application/x-mpegURL' }]), null);
});

test('seo: meta tags', () => {
  const tags = seoMeta({
    title: 'Hoodie · Store',
    description: 'Soft cotton hoodie',
    url: 'https://shop.test/products/hoodie',
    image: { url: 'https://cdn.shopify.com/h.jpg', width: 800, height: 600, altText: 'Hoodie' },
    type: 'product',
    siteName: 'Store',
  });
  assert.deepEqual(tags[0], { title: 'Hoodie · Store' });
  assert.ok(
    tags.some(
      (t) => 'rel' in t && t.rel === 'canonical' && t.href === 'https://shop.test/products/hoodie',
    ),
  );
  assert.ok(
    tags.some((t) => 'property' in t && t.property === 'og:image:width' && t.content === '800'),
  );
  assert.ok(
    tags.some(
      (t) => 'name' in t && t.name === 'twitter:card' && t.content === 'summary_large_image',
    ),
  );
  const minimal = seoMeta({ title: 'T', noindex: true });
  assert.ok(!minimal.some((t) => 'name' in t && t.name === 'description'));
  assert.ok(minimal.some((t) => 'name' in t && t.name === 'robots'));
});

test('seo: truncate at a word boundary', () => {
  assert.equal(truncate('short'), 'short');
  const long = 'word '.repeat(60);
  const out = truncate(long, 30);
  assert.ok(out.length <= 30 && out.endsWith('…') && !out.includes('  '));
});

test('sitemap XML', () => {
  assert.equal(escapeXml(`a&b<"'>`), 'a&amp;b&lt;&quot;&apos;&gt;');
  const index = sitemapIndexXml([
    { loc: 'https://s.test/sitemap/products/1.xml', lastmod: '2026-11-06' },
  ]);
  assert.ok(
    index.includes(
      '<sitemap><loc>https://s.test/sitemap/products/1.xml</loc><lastmod>2026-11-06</lastmod></sitemap>',
    ),
  );
  const urls = urlsetXml([
    {
      loc: 'https://s.test/products/a?x=1&y=2',
      alternates: { fr: 'https://s.test/fr/products/a' },
      images: [{ loc: 'https://cdn.shopify.com/a.jpg', title: 'A & B' }],
    },
  ]);
  assert.ok(urls.includes('<loc>https://s.test/products/a?x=1&amp;y=2</loc>'));
  assert.ok(urls.includes('hreflang="fr"'));
  assert.ok(urls.includes('<image:title>A &amp; B</image:title>'));
  assert.throws(() => urlsetXml(new Array(SITEMAP_MAX_URLS + 1).fill({ loc: 'x' })));
});

test('pagination: cursor variables and links', () => {
  assert.deepEqual(getCursorVariables(new Request('https://s.test/blogs/news'), 12), {
    first: 12,
    after: null,
  });
  assert.deepEqual(getCursorVariables(new Request('https://s.test/blogs/news?after=A'), 12), {
    first: 12,
    after: 'A',
  });
  assert.deepEqual(
    getCursorVariables(new Request('https://s.test/blogs/news?before=B&after=A'), 12),
    {
      last: 12,
      before: 'B',
    },
  );
  const links = paginationLinks(new Request('https://s.test/search?q=tee&after=OLD'), {
    hasNextPage: true,
    hasPreviousPage: true,
    startCursor: 'S',
    endCursor: 'E',
  });
  assert.deepEqual(links, { previous: '/search?q=tee&before=S', next: '/search?q=tee&after=E' });
  assert.deepEqual(
    paginationLinks(new Request('https://s.test/x'), {
      hasNextPage: false,
      hasPreviousPage: false,
    }),
    {
      previous: null,
      next: null,
    },
  );
});

test('seo: canonical URL keeps the path and pagination only', () => {
  const { canonicalUrl } = seo;
  assert.equal(
    canonicalUrl('https://shop.test', '/products/hoodie', '?variant=1&utm_source=x'),
    'https://shop.test/products/hoodie',
  );
  assert.equal(
    canonicalUrl('https://shop.test/', '/fr-ca/blogs/news/', '?after=C1&sort=x'),
    'https://shop.test/fr-ca/blogs/news?after=C1',
  );
  assert.equal(canonicalUrl('https://shop.test', '/'), 'https://shop.test/');
});

test('sitemap: resource paths and robots.txt', async () => {
  const { sitemapResourcePath, isSitemapType, robotsTxt } =
    await import('../app/lib/hcms/sitemap.ts');
  assert.equal(sitemapResourcePath('products', { handle: 'hoodie' }), '/products/hoodie');
  assert.equal(
    sitemapResourcePath('articles', { handle: 'a', blogHandle: 'news' }),
    '/blogs/news/a',
  );
  assert.equal(sitemapResourcePath('articles', { handle: 'a' }), null);
  assert.equal(
    sitemapResourcePath('metaobjects', { handle: 'h', type: 'artisan' }),
    '/pages/artisan/h',
  );
  assert.equal(isSitemapType('articles'), true);
  assert.equal(isSitemapType('customers'), false);
  const robots = robotsTxt('https://s.test');
  assert.ok(
    robots.includes('Disallow: /*/cart') && robots.includes('Sitemap: https://s.test/sitemap.xml'),
  );
  assert.equal(
    robotsTxt('https://s.test', { allowIndexing: false }),
    'User-agent: *\nDisallow: /\n',
  );
});

test('robots.txt: merchant rules are filtered and appended', async () => {
  const { robotsTxt, customRobotsRules } = await import('../app/lib/hcms/sitemap.ts');
  assert.deepEqual(
    customRobotsRules(
      'Disallow: /collections/*sort_by*\n<script>x</script>\n\n\nUser-agent: GPTBot\nDisallow: /\nfoo bar\n',
    ),
    ['Disallow: /collections/*sort_by*', '', 'User-agent: GPTBot', 'Disallow: /'],
  );
  assert.deepEqual(customRobotsRules(42), []);
  const extended = robotsTxt('https://s.test', { custom: 'Disallow: /private' });
  assert.match(extended, /Disallow: \/\*\/api\/\nDisallow: \/private\n\nSitemap/);
  const grouped = robotsTxt('https://s.test', { custom: 'User-agent: GPTBot\nDisallow: /' });
  assert.match(
    grouped,
    /\n\nUser-agent: GPTBot\nDisallow: \/\n\nSitemap: https:\/\/s.test\/sitemap.xml\n$/,
  );
});

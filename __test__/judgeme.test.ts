import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeReviewsHtml } from '@hcms/sections';

import {
  MAX_BADGES,
  badgeRating,
  judgemeCacheKey,
  judgemeCacheUrl,
  judgemeCss,
  judgemeTargets,
  parseJudgemeResponse,
  productIds,
  ratingJsonLd,
  sanitizeVendorCss,
  widgetReviews,
} from '../app/lib/hcms/judgeme.ts';

const sanitize = sanitizeReviewsHtml;
const gid = (n: number) => `gid://shopify/Product/${n}`;

// Judge.me markup as its own templates write it (shopify_v2.js JST `badge` / review widget).
const BADGE =
  "<div class='jdgm-prev-badge' data-average-rating='4.50' data-number-of-questions='0' data-number-of-reviews='2'><span class='jdgm-prev-badge__stars' data-score='4.50' tabindex='0' aria-label='4.50 stars' role='button'></span><span class='jdgm-prev-badge__text'>2 reviews</span></div>";
const WIDGET = `<div class='jdgm-rev-widg' data-average-rating='4.50'><div class='jdgm-rev-widg__header'><h2 class='jdgm-rev-widg__title'>Customer Reviews</h2><a href='javascript:void(0)' class='jdgm-write-rev-link' role='button'>Write a review</a></div><div class='jdgm-rev-widg__reviews'>
<div class='jdgm-rev jdgm-divider-top' data-verified-buyer='true' data-review-id='r1'><div class='jdgm-rev__header'><span class='jdgm-rev__rating' data-score='5' aria-label='5 star review' role='img'></span><span class='jdgm-rev__timestamp jdgm-spinner' data-content='2026-10-01 10:00:00 UTC'></span><span class='jdgm-rev__author'>Asha &amp; Co</span></div><div class='jdgm-rev__content'><b class='jdgm-rev__title'>Lovely</b><div class='jdgm-rev__body'><p>Soft <em>fabric</em></p></div></div></div>
<div class='jdgm-rev' data-review-id='r2'><span class='jdgm-rev__rating' data-score='4'></span><span class='jdgm-rev__author'>Ravi</span><div class='jdgm-rev__body'><p>Good</p></div><script>alert(1)</script><img src='x' onerror='alert(1)'></div>
<div class='jdgm-rev' data-review-id='r3'><span class='jdgm-rev__rating' data-score='9'></span><span class='jdgm-rev__author'>Bad</span></div>
</div></div>`;

const TEMPLATE = {
  sections: {
    main: {
      type: 'main-product',
      blocks: {
        r: { type: 'reviews', settings: { app: 'judgeme' } },
        s: { type: 'star_rating', settings: {} },
        y: { type: 'reviews', settings: { app: 'yotpo' } },
      },
    },
    grid: {
      type: 'featured-collection',
      blocks: { card: { type: 'card', blocks: { rating: { type: 'card-rating', settings: {} } } } },
    },
    off: { type: 'judgeme-carousel', disabled: true },
    all: { type: 'judgeme-all-reviews' },
  },
};
const DATA = {
  'section:main': {
    product: { id: gid(11), variants: { nodes: [{ id: 'gid://shopify/ProductVariant/5' }] } },
  },
  'section:grid': {
    collection: { products: { nodes: [{ id: gid(30) }, { id: gid(20) }, { id: gid(30) }] } },
  },
};

test('targets: Judge.me blocks only, product ids from each section’s batched data', () => {
  assert.deepEqual(judgemeTargets(TEMPLATE, DATA), {
    reviews: ['11'],
    stars: ['11', '20', '30'],
    carousel: false,
    allReviews: true,
  });
  assert.equal(judgemeTargets({ sections: { a: { type: 'rich-text' } } }, {}), null);
  // Yotpo-only page → nothing to fetch.
  assert.equal(
    judgemeTargets(
      {
        sections: {
          m: {
            type: 'main-product',
            blocks: { y: { type: 'reviews', settings: { app: 'yotpo' } } },
          },
        },
      },
      DATA,
    ),
    null,
  );
});

test('product ids: breadth-first, deduped, capped', () => {
  const many = { nodes: Array.from({ length: 100 }, (_, i) => ({ id: gid(i + 1) })) };
  assert.equal(productIds(many, MAX_BADGES).length, MAX_BADGES);
  assert.deepEqual(productIds({ deep: { product: { id: gid(2) } }, product: { id: gid(1) } }, 1), [
    '1',
  ]);
  assert.deepEqual(productIds({ id: 'gid://shopify/Collection/1' }, 5), []);
});

test('cache server URL: one request for every widget; key never holds the token', () => {
  const targets = { reviews: ['11'], stars: ['11', '20', 'x"'], carousel: true, allReviews: true };
  const url = new URL(judgemeCacheUrl('shop.myshopify.com', 'tok_123', targets));
  assert.equal(
    url.origin + url.pathname,
    'https://cache.judge.me/widgets/shopify/shop.myshopify.com',
  );
  assert.equal(url.searchParams.get('public_token'), 'tok_123');
  assert.equal(url.searchParams.get('review_widget_product_ids'), '11');
  assert.equal(url.searchParams.get('preview_badge_product_ids'), '11,20');
  assert.equal(url.searchParams.get('featured_carousel'), '1');
  assert.equal(url.searchParams.get('all_reviews_page'), '1');
  const key = judgemeCacheKey('shop.myshopify.com', targets);
  assert.ok(!key.join('|').includes('tok_123'));
  assert.deepEqual(key, judgemeCacheKey('shop.myshopify.com', { ...targets }));
});

test('badge + reviews parsed from sanitized HTML; scripts and handlers gone', () => {
  const badge = sanitize(BADGE);
  assert.deepEqual(badgeRating(badge), { value: 4.5, count: 2 });
  assert.equal(badgeRating(sanitize(BADGE.replace("reviews='2'", "reviews='0'"))), null);
  const widget = sanitize(WIDGET);
  assert.doesNotMatch(widget, /<script|onerror|javascript:/);
  assert.deepEqual(widgetReviews(widget), [
    { author: 'Asha & Co', rating: 5, title: 'Lovely', body: 'Soft fabric', date: '2026-10-01' },
    { author: 'Ravi', rating: 4, body: 'Good' },
  ]);
});

test('vendor CSS: Judge.me hosts + data fonts only; breakouts and imports rejected', () => {
  assert.equal(
    sanitizeVendorCss(
      ".jdgm-star:before{content:'\\e000'} @font-face{src:url(https://cdnwidget.judge.me/fonts/x.woff)}",
    ),
    ".jdgm-star:before{content:'\\e000'} @font-face{src:url(https://cdnwidget.judge.me/fonts/x.woff)}",
  );
  assert.equal(
    sanitizeVendorCss('.a{background:url("data:image/svg+xml;utf8,x")}').length > 0,
    true,
  );
  assert.equal(sanitizeVendorCss('.a{background:url(https://evil.example/x.png)}'), '');
  assert.equal(sanitizeVendorCss('.a{background:\\75rl(https://evil.example/x)}'), '');
  assert.equal(sanitizeVendorCss('@import "https://cdn.judge.me/x.css";'), '');
  assert.equal(sanitizeVendorCss('</style><script>alert(1)</script>'), '');
  assert.equal(
    judgemeCss(
      "<script class='jdgm-settings-script'>jdgmSettings={}</script><style class='jdgm-settings-style'>.jdgm-x{color:red}</style>",
      '<style>.b{}</style>',
    ),
    '.jdgm-x{color:red}\n.b{}',
  );
});

test('response → only requested ids, sanitized, all-reviews body wrapper', () => {
  const targets = { reviews: ['11'], stars: ['11', '20'], carousel: true, allReviews: true };
  const widgets = parseJudgemeResponse(
    {
      settings: '<style>.s{}</style>',
      html_miracle: '',
      review_widgets: { '11': WIDGET, '99': '<p>not asked</p>' },
      preview_badges: { '11': BADGE, '20': '<p onclick="x()">x</p>' },
      featured_carousel:
        "<div class='jdgm-carousel'><iframe src='https://www.youtube.com/embed/x'></iframe></div>",
      all_reviews_header: '<div class="jdgm-all-reviews-header">H</div>',
      all_reviews: '<div class="jdgm-rev">R</div>',
    },
    targets,
    sanitize,
  );
  assert.ok(widgets);
  assert.deepEqual(Object.keys(widgets.html).sort(), [
    'judgeme:all_reviews',
    'judgeme:carousel',
    'judgeme:reviews:11',
    'judgeme:stars:11',
    'judgeme:stars:20',
  ]);
  assert.equal(widgets.html['judgeme:stars:20'], '<p>x</p>');
  assert.equal(widgets.html['judgeme:carousel'], '<div class="jdgm-carousel"></div>');
  assert.equal(
    widgets.html['judgeme:all_reviews'],
    '<div class="jdgm-all-reviews-header">H</div><div class="jdgm-all-reviews__body"><div class="jdgm-rev">R</div></div>',
  );
  assert.equal(widgets.css, '.s{}');
  assert.deepEqual(widgets.ratings, { '11': { value: 4.5, count: 2 } });
  assert.equal(widgets.reviews['11']?.length, 2);
  assert.equal(parseJudgemeResponse('nope', targets, sanitize), null);
  assert.equal(parseJudgemeResponse({}, targets, sanitize), null);
});

test('JSON-LD rating: metafields first, Judge.me badge fallback, nothing without real data', () => {
  const metafields = {
    rating: { value: '{"value":"4.8","scale_min":"1.0","scale_max":"5.0"}' },
    ratingCount: { value: '12' },
  };
  assert.deepEqual(ratingJsonLd(metafields, null, gid(11)), {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 4.8,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    },
  });
  const widgets = {
    html: {},
    css: '',
    ratings: { '11': { value: 4.5, count: 2 } },
    reviews: { '11': [{ author: 'Ravi', rating: 4, body: 'Good' }] },
  };
  const fromBadge = ratingJsonLd({}, widgets, gid(11));
  assert.equal((fromBadge.aggregateRating as { reviewCount: number }).reviewCount, 2);
  assert.deepEqual(fromBadge.review, [
    {
      '@type': 'Review',
      author: { '@type': 'Person', name: 'Ravi' },
      reviewRating: { '@type': 'Rating', ratingValue: 4, bestRating: 5, worstRating: 1 },
      reviewBody: 'Good',
    },
  ]);
  assert.deepEqual(ratingJsonLd({ ratingCount: { value: '0' } }, null, gid(11)), {});
  assert.deepEqual(ratingJsonLd({ rating: { value: 'garbage' } }, null, gid(11)), {});
});

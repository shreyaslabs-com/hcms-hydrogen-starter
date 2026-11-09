import assert from 'node:assert/strict';
import test from 'node:test';

import { trendingSearchHref, trendingSearchesFrom } from '../app/lib/hcms/trending-searches.ts';

const doc = (section: Record<string, unknown>, group = 'header') => ({
  groups: {
    [group]: {
      order: ['ann', 'ts'],
      sections: {
        ann: { type: 'announcement-bar', settings: {} },
        ts: {
          type: 'trending-searches',
          settings: { heading: ' Popular ' },
          blocks: {
            a: { type: 'term', settings: { term: '  Vitamin   C ' } },
            b: { type: 'term', settings: { term: 'vitamin c' } },
            c: { type: 'term', disabled: true, settings: { term: 'Hidden' } },
            d: { type: 'term', settings: { term: 'Onion & oil' } },
          },
          block_order: ['a', 'b', 'c', 'd'],
          ...section,
        },
      },
    },
  },
});

test('trending searches (T-2.72): first enabled section in a layout group', () => {
  assert.deepEqual(trendingSearchesFrom(doc({})), {
    heading: 'Popular',
    terms: ['Vitamin C', 'Onion & oil'],
    popular: null,
    promo: null,
    showCollections: true,
    showQueries: true,
  });
  assert.equal(trendingSearchesFrom(doc({}, 'footer'))?.terms.length, 2);
  assert.equal(trendingSearchesFrom(doc({ disabled: true })), null);
  assert.equal(trendingSearchesFrom(doc({ settings: { show_in_search: false } })), null);
  assert.equal(trendingSearchesFrom(doc({ block_order: [] })), null);
  assert.equal(trendingSearchesFrom(doc({ block_order: [], settings: {} })), null);
  assert.equal(trendingSearchesFrom(null), null);
  assert.equal(trendingSearchesFrom({ templates: {} }), null);
  assert.equal(trendingSearchesFrom(doc({ settings: {} }))?.heading, null);
});

test('trending searches: terms are URL-encoded', () => {
  assert.equal(trendingSearchHref('a&b <c>'), '/search?q=a%26b%20%3Cc%3E');
});

test('search panel (P1-8): popular collection, promo tile, suggestion toggles', () => {
  const settings = {
    popular_collection: 'best-sellers',
    popular_heading: ' Top picks ',
    promo_image: { $file: 'f1' },
    promo_heading: 'New in',
    promo_link: '/collections/new',
    promo_label: 'Shop',
    show_queries: false,
  };
  const panel = trendingSearchesFrom(doc({ block_order: [], settings }), () => 'https://cdn/x.jpg');
  assert.deepEqual(panel?.popular, { handle: 'best-sellers', heading: 'Top picks' });
  assert.equal(panel?.promo?.imageUrl, 'https://cdn/x.jpg');
  assert.equal(panel?.promo?.link, '/collections/new');
  assert.equal(panel?.showQueries, false);
  assert.equal(panel?.showCollections, true);
  // Unsafe link dropped; bad handle ignored; no resolved image = no promo.
  const bad = trendingSearchesFrom(
    doc({
      settings: {
        popular_collection: 'a b/../x',
        promo_image: {},
        promo_link: 'javascript:alert(1)',
      },
    }),
    () => 'https://cdn/x.jpg',
  );
  assert.equal(bad?.popular, null);
  assert.equal(bad?.promo?.link, null);
});

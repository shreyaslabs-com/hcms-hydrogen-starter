import assert from 'node:assert/strict';
import test from 'node:test';

import { newAssets, parseSectionRefetch, sectionSlices } from '../app/lib/hcms/section-refetch.ts';

const section = {
  type: 'rich-text',
  settings: { title: 'Welcome to {{shop.name}}' },
  blocks: { h: { type: 'heading', settings: { heading: { $source: 'shop.name' } } } },
  block_order: ['h'],
};

test('section refetch: parses the live section body with the page context', () => {
  assert.deepEqual(
    parseSectionRefetch({
      id: 'r',
      section,
      resource: { type: 'article', handle: 'hello', id: '' },
      parent: 'news',
      route: { blogHandle: 'news' },
    }),
    {
      id: 'r',
      section,
      resource: { type: 'article', handle: 'hello', parent: 'news' },
      route: { blogHandle: 'news' },
    },
  );
  assert.deepEqual(parseSectionRefetch({ id: 'r', section, resource: null }), {
    id: 'r',
    section,
    resource: null,
    route: undefined,
  });
});

test('section refetch: legacy / malformed bodies are not live refetches', () => {
  assert.equal(parseSectionRefetch({ kind: 'section', type: 'x', settings: {} }), null);
  assert.equal(parseSectionRefetch({ id: 'r', section: { ...section, blocks: [] } }), null);
  assert.equal(parseSectionRefetch({ id: '', section }), null);
  assert.equal(parseSectionRefetch({ id: 'r', section: { ...section, type: 1 } }), null);
  assert.equal(parseSectionRefetch('nope'), null);
  assert.equal(parseSectionRefetch([]), null);
});

test('section refetch: returns only this section’s request slices', () => {
  const data = {
    'section:r': { a: 1 },
    'block:r/h': { b: 2 },
    'block:rx/h': { c: 3 },
    'section:other': {},
    'source:shop': { resource: { name: 'Acme' } },
  };
  assert.deepEqual(sectionSlices(data, 'r'), { 'section:r': { a: 1 }, 'block:r/h': { b: 2 } });
});

test('section refetch: sends only assets the snapshot map lacks', () => {
  const img = (url: string) => ({ kind: 'image', url }) as never;
  assert.deepEqual(newAssets({ a: img('1'), b: img('2') }, { a: img('1') }), { b: img('2') });
});

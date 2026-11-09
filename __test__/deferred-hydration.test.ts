import assert from 'node:assert/strict';
import test from 'node:test';

import { planHydration, type SectionMark } from '../app/lib/hcms/deferred-hydration.ts';
import { createLazyRegistry } from '../app/sections/lazy-registry.ts';

const mark = (type: string, defer: string | null, blockTypes: string[] = [], inViewport = false) =>
  ({ type, defer, blockTypes, inViewport }) satisfies SectionMark;

test('ADR 011: eager sections and their blocks load before hydration, deferred ones after', () => {
  const plan = planHydration(
    [
      mark('header', null, ['mega_panel']),
      mark('main-product', null, ['sku', 'card']),
      mark('related-products', '', ['card', 'card-extras']),
      mark('footer', '', ['social']),
      mark('chat-button', 'idle'),
    ],
    [],
  );
  assert.deepEqual(plan.eager.sort(), ['card', 'header', 'main-product', 'mega_panel', 'sku']);
  assert.deepEqual(plan.deferred, [
    // `card` is used by an eager section: loaded before hydration, not gated.
    { index: 2, types: ['related-products', 'card-extras'], idle: false },
    { index: 3, types: ['footer', 'social'], idle: false },
    { index: 4, types: ['chat-button'], idle: true },
  ]);
});

test('ADR 011: a deferred section already on screen loads before hydration (idle ones do not)', () => {
  const plan = planHydration([mark('footer', '', [], true), mark('popup', 'idle', [], true)], []);
  assert.deepEqual(plan.eager, ['footer']);
  assert.deepEqual(plan.deferred, [{ index: 1, types: ['popup'], idle: true }]);
});

test('ADR 011: blocks outside sections are eager; the preview never defers', () => {
  const loose = planHydration([mark('footer', '', ['button'])], ['button']);
  assert.deepEqual(loose.deferred, [{ index: 0, types: ['footer'], idle: false }]);
  const preview = planHydration([mark('footer', ''), mark('popup', 'idle')], [], true);
  assert.deepEqual(preview.eager, ['footer', 'popup']);
  assert.deepEqual(preview.deferred, []);
});

test('lazy registry: deferred types are gated until released, once each', async () => {
  const calls: string[] = [];
  const loader = (type: string) => ({
    load: async () => {
      calls.push(type);
      return { type, name: type, component: () => null } as never;
    },
  });
  const lazy = createLazyRegistry({ a: loader('a'), b: loader('b') }, { blk: loader('blk') });
  lazy.defer(['a', 'blk']);
  await lazy.preload(['b']);
  assert.deepEqual(calls, ['b']);
  // Releasing opens gates once (and never loads by itself: React's retry does).
  assert.deepEqual(lazy.release(['a', 'b', 'a']), ['a']);
  assert.deepEqual(lazy.release(['a']), []);
  assert.deepEqual(calls, ['b']);
  assert.deepEqual(lazy.release(['blk']), ['blk']);
});

test('lazy registry: the client definition carries the official hydrate flag', () => {
  const lazy = createLazyRegistry({
    header: { hydrate: 'eager', load: async () => ({}) as never },
    footer: { load: async () => ({}) as never },
  });
  assert.equal(lazy.registry.getSection('header')?.hydrate, 'eager');
  assert.equal(lazy.registry.getSection('footer')?.hydrate, undefined);
});

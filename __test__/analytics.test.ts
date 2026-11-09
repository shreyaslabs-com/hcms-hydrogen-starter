import assert from 'node:assert/strict';
import test from 'node:test';

import { hcmsAnalytics, resetAnalyticsForTests, STANDARD_EVENTS } from '../app/lib/analytics.ts';

type Handler = (payload: unknown) => void;

function fakeBus() {
  const subs = new Map<string, Handler>();
  const published: [string, unknown][] = [];
  const destinations: string[] = [];
  const bus = {
    publish: (event: string, payload?: unknown) => {
      published.push([event, payload]);
      subs.get(event)?.(payload ?? {});
    },
    addDestination: ({
      name,
      setup,
    }: {
      name: string;
      setup: (api: { subscribe: (e: string, h: Handler) => void }) => void;
    }) => {
      destinations.push(name);
      setup({ subscribe: (e, h) => subs.set(e, h) });
    },
  };
  (globalThis as { window?: unknown }).window = { Shopify: { analytics: bus } };
  return { published, destinations };
}

test('analytics: standard events go to Shopify and fan out to adapters via one destination', () => {
  resetAnalyticsForTests();
  const { published, destinations } = fakeBus();
  assert.ok(STANDARD_EVENTS.includes('page_viewed'));
  const seen: unknown[] = [];
  const off = hcmsAnalytics.subscribe('product_viewed', (p) => seen.push(p));
  hcmsAnalytics.subscribe('page_viewed', () => {
    throw new Error('adapter bug');
  });
  assert.deepEqual(destinations, ['hcms-adapters'], 'registered once');
  const error = console.error;
  console.error = () => undefined;
  hcmsAnalytics.publish('page_viewed');
  console.error = error;
  hcmsAnalytics.publish('product_viewed', { products: [] });
  assert.deepEqual(seen, [{ products: [] }]);
  off();
  hcmsAnalytics.publish('product_viewed', { products: [1] });
  assert.equal(seen.length, 1);
  assert.equal(published.length, 3);
});

test('analytics: custom events stay local; no window = no-op', () => {
  resetAnalyticsForTests();
  const { published } = fakeBus();
  const seen: unknown[] = [];
  hcmsAnalytics.subscribe('hcms_newsletter_signup', (p) => seen.push(p));
  hcmsAnalytics.publish('hcms_newsletter_signup', { ok: true });
  assert.deepEqual(seen, [{ ok: true }]);
  assert.equal(published.length, 0);
  delete (globalThis as { window?: unknown }).window;
  hcmsAnalytics.publish('page_viewed');
});

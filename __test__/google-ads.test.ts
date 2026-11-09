import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeduper,
  ga4SendTo,
  googleAdsConfig,
  googleAdsEvents,
  googleConsentDefault,
  type CommerceEvent,
} from '../app/lib/hcms/ad-events.ts';
import { embedCspSources, parseEmbed, parseEmbeds } from '../app/lib/hcms/embeds.ts';
import { updateVendorConsent } from '../app/lib/hcms/consent-revoke.ts';
import { startGoogleTag, type GtagWin } from '../app/lib/hcms/gtag.ts';

const item = {
  productId: '1',
  variantId: '2',
  name: 'Tee',
  variant: '',
  brand: 'Acme',
  sku: '',
  price: 10,
  quantity: 2,
};
const event = (kind: CommerceEvent['kind']): CommerceEvent => ({
  kind,
  key: `${kind}:x`,
  scope: kind === 'view_item' ? 'page' : 'global',
  items: [item],
  value: 20,
  currency: 'USD',
});

test('google_ads embeds: ID + labels validated, marketing consent floor', () => {
  const parsed = parseEmbed({
    id: 'a',
    type: 'google_ads',
    enabled: true,
    tagId: 'aw-123456789',
    consent: 'none',
    addToCartLabel: 'AbC-D_efG',
    beginCheckoutLabel: 'bad label',
    remarketing: false,
  });
  assert.ok(parsed);
  assert.equal(parsed.value, 'AW-123456789');
  assert.equal(parsed.consent, 'marketing');
  assert.deepEqual(parsed.ads, { addToCart: 'AbC-D_efG', remarketing: false });
  assert.equal(
    parseEmbed({ id: 'b', type: 'google_ads', enabled: true, tagId: 'G-ABC1234' }),
    null,
  );
  // Search Console has no storefront runtime (verification is seo.verification).
  assert.equal(parseEmbed({ id: 'c', type: 'google_search_console', enabled: true }), null);
});

test('google_ads CSP hosts only when it is enabled', () => {
  const on = embedCspSources([
    { id: 'a', type: 'google_ads', enabled: true, tagId: 'AW-123456789' },
  ]);
  assert.ok(on.script.includes('https://www.googleadservices.com'));
  assert.ok(on.connect.includes('https://googleads.g.doubleclick.net'));
  assert.ok(on.frame.includes('https://td.doubleclick.net'));
  const off = embedCspSources([
    { id: 'a', type: 'google_ads', enabled: false, tagId: 'AW-123456789' },
  ]);
  assert.ok(!off.script.includes('https://www.googleadservices.com'));
  assert.equal(parseEmbeds([{ id: 'a', type: 'google_ads', enabled: false }]).length, 0);
});

test('googleAdsEvents: remarketing + conversions with send_to labels, no purchase', () => {
  const tag = { id: 'AW-1234567', addToCart: 'cartLbl1' };
  const [view] = googleAdsEvents(event('view_item'), tag, 'US');
  assert.equal(view?.[0], 'view_item');
  assert.equal(view?.[1].send_to, 'AW-1234567');
  assert.equal((view?.[1].items as { id: string }[])[0]?.id, 'shopify_US_1_2');
  const cart = googleAdsEvents(event('add_to_cart'), tag, 'US');
  assert.deepEqual(
    cart.map(([n, p]) => [n, p.send_to]),
    [
      ['add_to_cart', 'AW-1234567'],
      ['conversion', 'AW-1234567/cartLbl1'],
    ],
  );
  assert.deepEqual(cart[1]?.[1], { send_to: 'AW-1234567/cartLbl1', value: 20, currency: 'USD' });
  // No label: remarketing event only; remarketing off: conversions only.
  assert.deepEqual(
    googleAdsEvents(event('begin_checkout'), tag, 'US').map(([n]) => n),
    ['begin_checkout'],
  );
  assert.deepEqual(
    googleAdsEvents(event('add_to_cart'), { ...tag, remarketing: false }, 'US').map(([n]) => n),
    ['conversion'],
  );
  assert.deepEqual(googleAdsEvents(event('view_item'), { ...tag, remarketing: false }, 'US'), []);
  assert.deepEqual(googleAdsEvents(event('search'), tag, 'US'), []);
  assert.deepEqual(googleAdsEvents(event('view_cart'), tag, 'US'), []);
});

test('google ads dedup: a replayed add to cart fires once', () => {
  const dedupe = createDeduper();
  assert.equal(dedupe(event('add_to_cart'), 'p1'), true);
  assert.equal(dedupe(event('add_to_cart'), 'p2'), false);
});

test('GA4 events stay on GA4 when Google Ads shares gtag', () => {
  assert.deepEqual(ga4SendTo(['G-ABC1234'], true), { send_to: ['G-ABC1234'] });
  assert.deepEqual(ga4SendTo(['G-ABC1234'], false), {});
  assert.deepEqual(googleAdsConfig({ id: 'AW-1234567' }), { send_page_view: false });
  assert.deepEqual(googleAdsConfig({ id: 'AW-1234567', remarketing: false }), {
    send_page_view: false,
    allow_ad_personalization_signals: false,
  });
});

test('one gtag.js loader for GA4 + Google Ads, Consent Mode v2 defaults first', () => {
  const w: GtagWin = {};
  const scripts: string[] = [];
  const consent = { analytics: true, marketing: false };
  startGoogleTag(w, 'G-ABC1234', undefined, consent, (s) => scripts.push(s));
  startGoogleTag(w, 'AW-1234567', { send_page_view: false }, consent, (s) => scripts.push(s));
  assert.deepEqual(scripts, ['https://www.googletagmanager.com/gtag/js?id=G-ABC1234']);
  const calls = (w.dataLayer ?? []).map((a) => [...(a as ArrayLike<unknown>)]);
  assert.deepEqual(calls[0], ['consent', 'default', googleConsentDefault(consent)]);
  assert.deepEqual(googleConsentDefault(consent), {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  assert.deepEqual(calls[2], ['config', 'G-ABC1234']);
  assert.deepEqual(calls[3], ['config', 'AW-1234567', { send_page_view: false }]);
});

test('google_ads consent revoke denies ad storage only', () => {
  const sent: unknown[][] = [];
  updateVendorConsent({ gtag: (...a) => sent.push(a) }, 'google_ads', false, {
    ready: true,
    analytics: true,
    marketing: false,
    preferences: false,
  });
  assert.deepEqual(sent[0], [
    'consent',
    'update',
    { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
  ]);
});

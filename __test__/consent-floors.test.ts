import assert from 'node:assert/strict';
import test from 'node:test';

import { syncVendorConsent, type ConsentWin } from '../app/lib/hcms/consent-revoke.ts';
import {
  consentAllows,
  parseEmbeds,
  type ClientEmbed,
  type ConsentState,
} from '../app/lib/hcms/embeds.ts';

test('T-2.105: pixels need marketing, ga4/gtm at least analytics; lower stored values are raised', () => {
  const parsed = parseEmbeds([
    { id: 'meta', type: 'meta_pixel', enabled: true, tagId: '123456789012', consent: 'none' },
    {
      id: 'tt',
      type: 'tiktok_pixel',
      enabled: true,
      tagId: 'C4ABCDEF1234567890AB',
      consent: 'analytics',
    },
    {
      id: 'pin',
      type: 'pinterest_tag',
      enabled: true,
      tagId: '2612345678901',
      consent: 'preferences',
    },
    { id: 'ga', type: 'ga4', enabled: true, tagId: 'G-ABC1234', consent: 'none' },
    { id: 'gtm', type: 'gtm', enabled: true, tagId: 'GTM-ABC123', consent: 'preferences' },
    { id: 'ga-m', type: 'ga4', enabled: true, tagId: 'G-ABC1234', consent: 'marketing' },
    { id: 'js', type: 'script', enabled: true, src: 'https://x.example/a.js', consent: 'none' },
  ]);
  assert.deepEqual(Object.fromEntries(parsed.map((e) => [e.id, e.consent])), {
    meta: 'marketing',
    tt: 'marketing',
    pin: 'marketing',
    ga: 'analytics',
    gtm: 'analytics',
    'ga-m': 'marketing',
    js: 'none', // generic scripts keep the merchant's choice
  });
});

const state = (s: Partial<ConsentState>): ConsentState => ({
  ready: true,
  analytics: false,
  marketing: false,
  preferences: false,
  ...s,
});
const embed = (id: string, type: ClientEmbed['type'], consent: ClientEmbed['consent']) =>
  ({
    id,
    type,
    consent,
    templates: [],
    paths: [],
    value: 'X',
    placement: 'body_end',
  }) as ClientEmbed;

test('T-2.105: withdrawn consent calls the vendors revoke APIs for started tags', () => {
  const calls: unknown[][] = [];
  const dataLayer: unknown[] = [];
  const w: ConsentWin = {
    dataLayer,
    fbq: (...args) => calls.push(['fbq', ...args]),
    ttq: {
      revokeConsent: () => calls.push(['ttq.revokeConsent']),
      grantConsent: () => calls.push(['ttq.grantConsent']),
    },
  };
  const started = [
    embed('ga', 'ga4', 'analytics'),
    embed('meta', 'meta_pixel', 'marketing'),
    embed('tt', 'tiktok_pixel', 'marketing'),
    embed('pin', 'pinterest_tag', 'marketing'),
  ];
  const sent = new Map<string, boolean>();
  const sync = (consent: ConsentState) =>
    syncVendorConsent(w, started, (e) => consentAllows(e.consent, consent), consent, sent);

  // Granted at start: nothing to send.
  sync(state({ analytics: true, marketing: true }));
  assert.deepEqual(calls, []);
  assert.equal(dataLayer.length, 0);

  // Withdrawn.
  sync(state({}));
  assert.deepEqual(calls, [['fbq', 'consent', 'revoke'], ['ttq.revokeConsent']]);
  assert.equal(dataLayer.length, 1);
  assert.deepEqual(
    [...(dataLayer[0] as ArrayLike<unknown>)],
    [
      'consent',
      'update',
      {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      },
    ],
  );
  // Idempotent: same state sends nothing more.
  sync(state({}));
  assert.equal(calls.length, 2);
  assert.equal(dataLayer.length, 1);

  // Restored: grant again.
  sync(state({ analytics: true, marketing: true }));
  assert.deepEqual(calls.slice(2), [['fbq', 'consent', 'grant'], ['ttq.grantConsent']]);
  assert.equal((dataLayer[1] as ArrayLike<unknown>)[0], 'consent');
});

test('T-2.105: gtag is used when present; a throwing vendor never breaks the page', () => {
  const gtagCalls: unknown[][] = [];
  const w: ConsentWin = {
    gtag: (...args) => gtagCalls.push(args),
    fbq: () => {
      throw new Error('boom');
    },
  };
  const sent = new Map<string, boolean>();
  assert.doesNotThrow(() =>
    syncVendorConsent(
      w,
      [embed('gtm', 'gtm', 'analytics'), embed('meta', 'meta_pixel', 'marketing')],
      () => false,
      state({}),
      sent,
    ),
  );
  assert.equal(gtagCalls[0]?.[0], 'consent');
  assert.equal(sent.get('meta'), false);
});

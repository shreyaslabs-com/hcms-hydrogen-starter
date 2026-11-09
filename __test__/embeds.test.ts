import assert from 'node:assert/strict';
import test from 'node:test';

import { contentSecurityPolicy } from '../app/lib/csp.ts';
import {
  clientEmbeds,
  consentAllows,
  cspHost,
  embedCspSources,
  embedTargets,
  inboxEmbeds,
  parseEmbeds,
  templateTypeForPath,
} from '../app/lib/hcms/embeds.ts';

const raw = [
  { id: 'ga', type: 'ga4', enabled: true, tagId: 'g-abc1234' },
  { id: 'off', type: 'ga4', enabled: false, tagId: 'G-ABC1234' },
  {
    id: 'px',
    type: 'script',
    enabled: true,
    src: 'https://cdn.pixel.test/p.js?k=1',
    consent: 'analytics',
    targeting: { templates: ['product', 'BAD!'], countries: ['ca'], paths: [] },
    hosts: ['api.pixel.test', 'javascript:alert(1)', 'https://*.pixel.test/'],
  },
  { id: 'http', type: 'script', enabled: true, src: 'http://insecure.test/a.js' },
  {
    id: 'html',
    type: 'html',
    enabled: true,
    html: '<p>Hi</p><script>x()</script>',
    consent: 'none',
    placement: 'body_start',
  },
  { id: 'meta', type: 'meta_pixel', enabled: true, tagId: '123456789012' },
  { id: 'bad', type: 'gtm', enabled: true, tagId: 'GTM-<x>' },
  { id: 'klaviyo', type: 'klaviyo', enabled: true, settings: {} },
];

test('parseEmbeds keeps valid enabled embeds with defaults', () => {
  const parsed = parseEmbeds(raw);
  assert.deepEqual(
    parsed.map((e) => [e.id, e.consent]),
    [
      ['ga', 'analytics'],
      ['px', 'analytics'],
      ['html', 'none'],
      ['meta', 'marketing'],
    ],
  );
  assert.equal(parsed[0]?.value, 'G-ABC1234');
  const px = parsed[1];
  assert.ok(px);
  assert.deepEqual(px.targeting, { templates: ['product'], countries: ['CA'], paths: [] });
  assert.deepEqual(px.hosts, ['https://api.pixel.test', 'https://*.pixel.test']);
  assert.equal(cspHost('https://evil.test; script-src *'), null);
});

test('clientEmbeds filters by country, sanitizes HTML, drops tags in preview', () => {
  const sanitize = (html: string) => html.replace(/<script>.*?<\/script>/g, '');
  const us = clientEmbeds(raw, { country: 'US', sanitize });
  assert.deepEqual(
    us.map((e) => e.id),
    ['ga', 'html', 'meta'],
  );
  assert.equal(us[1]?.value, '<p>Hi</p>');
  assert.equal(us[1]?.placement, 'body_start');
  assert.ok(clientEmbeds(raw, { country: 'CA', sanitize }).some((e) => e.id === 'px'));
  assert.deepEqual(
    clientEmbeds(raw, { country: 'US', preview: true, sanitize }).map((e) => e.id),
    ['html'],
  );
});

test('targeting by template type and path (market prefix ignored)', () => {
  assert.equal(templateTypeForPath('/'), 'index');
  assert.equal(templateTypeForPath('/fr-ca'), 'index');
  assert.equal(templateTypeForPath('/fr-ca/products/hat'), 'product');
  assert.equal(templateTypeForPath('/collections'), 'list_collections');
  assert.equal(templateTypeForPath('/blogs/news/tagged/x'), 'blog');
  assert.equal(templateTypeForPath('/blogs/news/post'), 'article');
  assert.equal(templateTypeForPath('/pages/faq/q1'), 'metaobject');
  assert.equal(templateTypeForPath('/nope'), '404');
  const base = {
    id: 'x',
    type: 'script' as const,
    consent: 'none' as const,
    value: '',
    placement: 'body_end' as const,
  };
  const product = { ...base, templates: ['product'], paths: [] };
  assert.equal(embedTargets(product, '/fr-ca/products/hat'), true);
  assert.equal(embedTargets(product, '/cart'), false);
  const landing = { ...base, templates: [], paths: ['/pages/sale'] };
  assert.equal(embedTargets(landing, '/en-ca/pages/sale'), true);
  assert.equal(embedTargets(landing, '/pages/sale/x'), true);
  assert.equal(embedTargets(landing, '/pages/salesman'), false);
});

test('consent gating per category', () => {
  const none = { ready: false, analytics: false, marketing: false, preferences: false };
  const analytics = { ...none, ready: true, analytics: true };
  assert.equal(consentAllows('none', none), true);
  assert.equal(consentAllows('analytics', none), false);
  assert.equal(consentAllows('analytics', analytics), true);
  assert.equal(consentAllows('marketing', analytics), false);
});

test('CSP merges embed hosts into script-src and connect-src', () => {
  const sources = embedCspSources(raw);
  assert.ok(sources.script.includes('https://www.googletagmanager.com'));
  assert.ok(sources.script.includes('https://cdn.pixel.test'));
  assert.ok(sources.script.includes('https://connect.facebook.net'));
  assert.ok(!sources.script.some((s) => s.includes('insecure')));
  const policy = contentSecurityPolicy({
    nonce: 'n',
    embeds: { script: [...sources.script, "'unsafe-eval'"], connect: sources.connect },
  });
  const scriptSrc = policy.split('; ').find((d) => d.startsWith('script-src')) ?? '';
  assert.ok(scriptSrc.includes('https://cdn.pixel.test'));
  assert.ok(!scriptSrc.includes('unsafe-eval'));
  const connect = policy.split('; ').find((d) => d.startsWith('connect-src')) ?? '';
  assert.ok(connect.includes('https://*.google-analytics.com'));
  assert.ok(connect.includes('https://api.pixel.test'));
});

test('Shopify Inbox embed (T-2.54): no fields, Shopify-managed consent, never in preview', () => {
  const inbox = [
    { id: 'chat', type: 'shopify_inbox', enabled: true, consent: 'marketing' },
    { id: 'chat-off', type: 'shopify_inbox', enabled: false },
    {
      id: 'chat-ca',
      type: 'shopify_inbox',
      enabled: true,
      targeting: { countries: ['CA'], templates: ['product'] },
    },
  ];
  const [chat] = parseEmbeds(inbox);
  assert.equal(chat?.consent, 'none');
  assert.equal(chat?.value, 'shopify_inbox');
  const us = clientEmbeds(inbox, { country: 'US', sanitize: (h) => h });
  assert.deepEqual(
    inboxEmbeds(us).map((e) => e.id),
    ['chat'],
  );
  const ca = inboxEmbeds(clientEmbeds(inbox, { country: 'CA', sanitize: (h) => h }));
  assert.deepEqual(
    ca.map((e) => e.id),
    ['chat', 'chat-ca'],
  );
  const targeted = ca.find((e) => e.id === 'chat-ca');
  assert.ok(targeted);
  assert.equal(embedTargets(targeted, '/collections/all'), false);
  assert.equal(embedTargets(targeted, '/fr-ca/products/hat'), true);
  assert.deepEqual(clientEmbeds(inbox, { country: 'US', preview: true, sanitize: (h) => h }), []);
  // Loaded by ShopifyScripts from Shopify's CDN: no extra CSP hosts.
  assert.deepEqual(embedCspSources(inbox).script, []);
});

test('TikTok + Pinterest tags (T-2.66): ids, marketing consent, CSP hosts, ad options', () => {
  const tags = [
    { id: 'tt', type: 'tiktok_pixel', enabled: true, tagId: 'c4abcdef1234567890ab' },
    { id: 'tt-bad', type: 'tiktok_pixel', enabled: true, tagId: 'short' },
    {
      id: 'pin',
      type: 'pinterest_tag',
      enabled: true,
      tagId: '2612345678901',
      checkoutEvent: false,
    },
    { id: 'pin-bad', type: 'pinterest_tag', enabled: true, tagId: 'abc' },
    { id: 'ga', type: 'ga4', enabled: true, tagId: 'AW-123456789', feedCountry: 'zz' },
    { id: 'ga-bad', type: 'ga4', enabled: true, tagId: 'G-ABCDE12', feedCountry: 'USA' },
    { id: 's', type: 'script', enabled: true, src: 'https://x.test/a.js', feedCountry: 'US' },
  ];
  const parsed = parseEmbeds(tags);
  assert.deepEqual(
    parsed.map((e) => e.id),
    ['tt', 'pin', 'ga', 'ga-bad', 's'],
  );
  const byId = Object.fromEntries(parsed.map((e) => [e.id, e]));
  assert.equal(byId.tt?.value, 'C4ABCDEF1234567890AB');
  assert.equal(byId.tt?.consent, 'marketing');
  assert.equal(byId.pin?.consent, 'marketing');
  assert.equal(byId.pin?.checkoutEvent, false);
  assert.equal(byId.ga?.feedCountry, 'ZZ');
  assert.equal(byId['ga-bad']?.feedCountry, undefined);
  assert.equal(byId.s?.feedCountry, undefined, 'only ad tags carry ad options');
  const client = clientEmbeds(tags, { country: 'US', sanitize: (h) => h });
  assert.equal(client.find((e) => e.id === 'pin')?.checkoutEvent, false);
  assert.equal(client.find((e) => e.id === 'ga')?.feedCountry, 'ZZ');
  const csp = embedCspSources(tags);
  for (const host of ['https://analytics.tiktok.com', 'https://s.pinimg.com'])
    assert.ok(csp.script.includes(host), host);
  for (const host of ['https://analytics.tiktok.com', 'https://ct.pinterest.com'])
    assert.ok(csp.connect.includes(host), host);
  assert.deepEqual(csp.frame, ['https://ct.pinterest.com']);
  const policy = contentSecurityPolicy({ nonce: 'n', embeds: csp });
  assert.match(policy, /script-src[^;]*https:\/\/s\.pinimg\.com/);
  assert.match(policy, /connect-src[^;]*https:\/\/analytics\.tiktok\.com/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { contentSecurityPolicy } from '../app/lib/csp.ts';
import {
  DEFAULT_CONSENT,
  EMBED_TYPES,
  clientEmbeds,
  embedCspSources,
  enabledIntegrations,
  parseEmbeds,
} from '../app/lib/hcms/embeds.ts';
import { __test, handleFormPost } from '../app/lib/hcms/forms.ts';
import {
  VENDORS,
  VENDOR_CONFIG,
  klaviyoAddedToCart,
  klaviyoBackInStockRequest,
  klaviyoViewedProduct,
  vendorConfig,
  vendorScripts,
} from '../app/lib/hcms/integrations.ts';

const SHOP = 'bagru.myshopify.com';
const UUID = '0d4e0e62-1a2b-4c3d-8e9f-0123456789ab';
const raw = [
  { id: 'j', type: 'judgeme', enabled: true, publicToken: 'abcDEF123_-x' },
  {
    id: 'k',
    type: 'klaviyo',
    enabled: true,
    companyId: 'AbC123',
    targeting: { countries: ['US'] },
  },
  { id: 'y', type: 'yotpo', enabled: true, appKey: 'not valid!' },
  { id: 'o', type: 'okendo', enabled: true, subscriberId: UUID.toUpperCase() },
  { id: 'r', type: 'rebuy', enabled: false },
];

test('T-2.8: every vendor is an embed type with a matching default consent', () => {
  for (const vendor of VENDORS) {
    assert.ok(EMBED_TYPES.includes(vendor), vendor);
    assert.equal(DEFAULT_CONSENT[vendor], VENDOR_CONFIG[vendor].consent, vendor);
    for (const list of Object.values(VENDOR_CONFIG[vendor].hosts))
      for (const host of list) assert.match(host, /^https:\/\/(\*\.)?[a-z0-9.-]+$/, host);
  }
});

test('vendor config: validated public fields, shop domain fallback', () => {
  assert.deepEqual(vendorConfig('judgeme', { publicToken: 'abcDEF123_-x' }, SHOP), {
    shopDomain: SHOP,
    publicToken: 'abcDEF123_-x',
  });
  assert.equal(vendorConfig('judgeme', { publicToken: 'abcDEF123' }, 'mock.shop'), null);
  assert.deepEqual(vendorConfig('rebuy', { shopDomain: ' Other.MyShopify.com ' }, SHOP), {
    shopDomain: 'other.myshopify.com',
  });
  assert.equal(vendorConfig('klaviyo', { companyId: 'AbC12' }), null);
  assert.equal(vendorConfig('okendo', { subscriberId: 'x' }), null);
});

test('parse: invalid/disabled integrations are skipped; config goes to the client', () => {
  const parsed = parseEmbeds(raw, SHOP);
  assert.deepEqual(
    parsed.map((e) => e.type),
    ['judgeme', 'klaviyo', 'okendo'],
  );
  assert.equal(parsed[0]?.consent, 'preferences');
  const client = clientEmbeds(raw, { country: 'CA', sanitize: (h) => h, shopDomain: SHOP });
  assert.deepEqual(
    client.map((e) => [e.type, e.config]),
    [
      ['judgeme', { shopDomain: SHOP, publicToken: 'abcDEF123_-x' }],
      ['okendo', { subscriberId: UUID }],
    ],
  );
  // No third-party code in the editor preview.
  assert.deepEqual(
    clientEmbeds(raw, { country: 'US', preview: true, sanitize: (h) => h, shopDomain: SHOP }),
    [],
  );
});

test('enabled integrations per market (adapter `integrations`)', () => {
  assert.deepEqual(enabledIntegrations(raw, { country: 'US', shopDomain: SHOP }), [
    'judgeme',
    'klaviyo',
    'okendo',
  ]);
  assert.deepEqual(enabledIntegrations(raw, { country: 'CA', shopDomain: SHOP }), [
    'judgeme',
    'okendo',
  ]);
  assert.deepEqual(enabledIntegrations(raw, { country: 'CA' }), ['okendo']);
  assert.deepEqual(enabledIntegrations('nope', { country: 'CA' }), []);
});

test('CSP: vendor script/connect/style/font/frame hosts merge into the policy', () => {
  const hosts = embedCspSources(raw, SHOP);
  assert.ok(hosts.script.includes('https://cdn.judge.me'));
  assert.ok(hosts.script.includes('https://static.klaviyo.com'));
  assert.ok(hosts.connect.includes('https://api.okendo.io'));
  assert.ok(!hosts.script.some((h) => h.includes('yotpo')));
  const policy = contentSecurityPolicy({ nonce: 'n', embeds: hosts });
  assert.match(policy, /style-src [^;]*https:\/\/cdn-static\.okendo\.io/);
  assert.match(policy, /font-src [^;]*https:\/\/static-forms\.klaviyo\.com/);
  assert.match(policy, /frame-src [^;]*https:\/\/www\.recaptcha\.net/);
  assert.doesNotMatch(policy, /unsafe-eval/);
});

test('script URLs encode the public keys', () => {
  assert.deepEqual(vendorScripts('klaviyo', { companyId: 'AbC123' }), [
    'https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=AbC123',
  ]);
  assert.deepEqual(vendorScripts('yotpo', { appKey: 'KEY123abcd' }), [
    'https://cdn-widgetsrepository.yotpo.com/v1/loader/KEY123abcd',
  ]);
  assert.deepEqual(vendorScripts('rebuy', { shopDomain: SHOP }), [
    `https://cdn.rebuyengine.com/onsite/js/rebuy.js?shop=${SHOP}`,
  ]);
  assert.equal(vendorScripts('judgeme', {}).length, 0); // started by startJudgeme (T-2.103)
  assert.equal(vendorScripts('okendo', {}).length, 1);
});

test('Klaviyo events from the analytics bus', () => {
  const viewed = klaviyoViewedProduct(
    {
      products: [
        {
          id: 'gid://shopify/Product/42',
          title: 'Shirt',
          vendor: 'Bagru',
          price: { amount: '25.00', currencyCode: 'USD' },
          sku: 'S-1',
        },
      ],
    },
    'https://s.test/products/shirt',
  );
  assert.deepEqual(viewed[0], [
    'Viewed Product',
    {
      ProductName: 'Shirt',
      ProductID: '42',
      SKU: 'S-1',
      URL: 'https://s.test/products/shirt',
      Brand: 'Bagru',
      Price: 25,
    },
  ]);
  assert.equal(viewed[1]?.[0], 'trackViewedItem');
  assert.deepEqual(klaviyoViewedProduct(null, 'x'), []);

  const line = (qty: number) => ({
    quantity: qty,
    merchandise: {
      id: 'gid://shopify/ProductVariant/7',
      sku: 'S-1',
      price: { amount: '10.00' },
      product: { id: 'gid://shopify/Product/42', title: 'Shirt', handle: 'shirt' },
    },
  });
  const added = klaviyoAddedToCart(
    { cart: { lines: { nodes: [line(3)] } }, currentLine: line(3), prevLine: line(1) },
    'https://s.test',
  );
  assert.equal(added?.AddedItemQuantity, 2);
  assert.equal(added?.$value, 30);
  assert.equal(added?.AddedItemURL, 'https://s.test/products/shirt');
  assert.deepEqual(added?.ItemNames, ['Shirt']);
  assert.equal(klaviyoAddedToCart({ currentLine: line(1), prevLine: line(2) }, 'x'), null);
  assert.equal(klaviyoAddedToCart({}, 'x'), null);
});

test('Klaviyo back-in-stock request (Client API, public key)', () => {
  const { url, init } = klaviyoBackInStockRequest('AbC123', 'a@b.co', '7');
  assert.equal(url, 'https://a.klaviyo.com/client/back-in-stock-subscriptions?company_id=AbC123');
  assert.equal((init.headers as Record<string, string>).revision, '2026-10-15');
  const body = JSON.parse(init.body as string) as {
    data: { relationships: { variant: { data: { id: string } } } };
  };
  assert.equal(body.data.relationships.variant.data.id, '$shopify:::$default:::7');
});

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request('https://store.test/__hcms/back-in-stock', {
    method: 'POST',
    body,
    headers: { Accept: 'application/json' },
  });
}

test('back-in-stock form: validates, delivers, maps upstream status', async () => {
  __test.resetRateLimit();
  const sent: Record<string, string>[] = [];
  const deliver = (status: number) => async (fields: Record<string, string>) => {
    sent.push(fields);
    return status;
  };
  const ok = await handleFormPost(
    post({ email: 'A@b.co', variant: '7' }),
    'back_in_stock',
    {},
    fetch,
    deliver(202),
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(sent[0], { email: 'a@b.co', variant: '7' });
  const bad = await handleFormPost(
    post({ email: 'a@b.co', variant: 'gid://x' }),
    'back_in_stock',
    {},
    fetch,
    deliver(202),
  );
  assert.equal(bad.status, 422);
  const off = await handleFormPost(
    post({ email: 'a@b.co', variant: '7' }),
    'back_in_stock',
    {},
    fetch,
    deliver(503),
  );
  assert.equal(off.status, 503);
  const upstream = await handleFormPost(
    post({ email: 'a@b.co', variant: '7' }),
    'back_in_stock',
    {},
    fetch,
    deliver(400),
  );
  assert.equal(upstream.status, 502);
  const trap = await handleFormPost(
    post({ email: 'a@b.co', variant: '7', hcms_hp: 'x' }),
    'back_in_stock',
    {},
    fetch,
    deliver(202),
  );
  assert.equal(trap.status, 200);
  // Invalid and trapped posts never reach Klaviyo.
  assert.equal(sent.length, 3);
});

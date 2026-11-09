/**
 * Storefront QA pass 2 fixes: slow-upstream fallbacks (S2-2), box price comparison (S2-5),
 * upsell exclusions (S2-10), drawer Checkout scheme (S2-11), page h1 (S2-7).
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'node:test';

const APP_ROOT = new URL('../app/', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('~/')) return nextResolve(specifier, context);
    return nextResolve(new URL(`${specifier.slice(2)}.ts`, APP_ROOT).href, context);
  },
});

const { loadRootLayout, fallbackRootLayout } = await import('../app/lib/root-layout.ts');
const { withBudget } = await import('../app/lib/hcms/budget.ts');
const { shopifyRouteErrorResponse, SHOPIFY_ROUTE_ERROR_MESSAGE } =
  await import('../app/lib/hcms/shopify-route-error.ts');
const { groupCartLines } = await import('../app/lib/hcms/cart-boxes.ts');
const { cartSavings } = await import('../app/lib/hcms/cart-savings.ts');
const { upsellSeed, mainCartSchemeClass } = await import('../app/lib/hcms/upsell.ts');
const { needsPageHeading } = await import('../app/lib/hcms/page-heading.ts');
const { resolveShopIdentity } = await import('../app/lib/shop.ts');

type Client = Parameters<typeof loadRootLayout>[0];
const quiet = <T>(run: () => Promise<T>): Promise<T> => {
  const original = console.error;
  console.error = () => undefined;
  return run().finally(() => {
    console.error = original;
  });
};

describe('root layout under a slow or failing Storefront API (S2-2)', () => {
  it('passes an abort signal and falls back when the query hangs past the budget', async () => {
    let signal: AbortSignal | undefined;
    const client = {
      graphql: (_query: unknown, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
    } as unknown as Client;
    const started = Date.now();
    const layout = await quiet(() =>
      loadRootLayout(client, { timeoutMs: 30, fallbackCurrency: 'INR' }),
    );
    assert.ok(signal, 'per-call signal passed');
    assert.ok(Date.now() - started < 1000);
    assert.deepEqual(layout, fallbackRootLayout('INR'));
    assert.equal(layout.shopInfo.name, 'Store');
  });

  it('falls back on a transport error or GraphQL errors without data', async () => {
    const throwing = { graphql: async () => Promise.reject(new Error('504')) } as Client;
    assert.equal((await quiet(() => loadRootLayout(throwing))).shopId, '');
    const empty = {
      graphql: async () => ({ data: null, errors: [{ message: 'Throttled' }] }),
    } as unknown as Client;
    assert.equal((await quiet(() => loadRootLayout(empty))).currency, 'USD');
  });

  it('withBudget returns the work, or the fallback on timeout/rejection', async () => {
    assert.equal(await withBudget(Promise.resolve(1), 50, () => 0), 1);
    const hang = new Promise<number>(() => undefined);
    assert.equal(await quiet(() => withBudget(hang, 10, () => 0)), 0);
    assert.equal(await quiet(() => withBudget(Promise.reject(new Error('x')), 50, () => 2)), 2);
  });

  it('a failed Shopify route answers 503 JSON for fetch, a page with a way back for forms', async () => {
    const quietError = console.error;
    console.error = () => undefined;
    try {
      const fetchCall = shopifyRouteErrorResponse(
        new Request('https://shop.test/api/cart', { method: 'POST' }),
        new Error('timed out'),
      );
      assert.equal(fetchCall.status, 503);
      assert.equal(fetchCall.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await fetchCall.json(), {
        errors: [{ message: SHOPIFY_ROUTE_ERROR_MESSAGE }],
      });
      const form = shopifyRouteErrorResponse(
        new Request('https://shop.test/api/cart', {
          method: 'POST',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            Referer: 'https://shop.test/products/a?x="1"',
          },
        }),
        new Error('timed out'),
      );
      assert.equal(form.status, 503);
      const html = await form.text();
      assert.match(html, /href="\/products\/a\?x=%221%22"/);
      const foreign = shopifyRouteErrorResponse(
        new Request('https://shop.test/api/cart', {
          method: 'POST',
          headers: { 'Sec-Fetch-Mode': 'navigate', Referer: 'https://evil.test/x' },
        }),
        new Error('x'),
      );
      assert.match(await foreign.text(), /href="\/cart"/);
    } finally {
      console.error = quietError;
    }
  });

  it('no shop id → events stay local (no analytics against an empty shop)', () => {
    const identity = resolveShopIdentity(
      {
        PUBLIC_STORE_DOMAIN: 'shop.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 't',
        PUBLIC_STOREFRONT_ID: '123',
      },
      '',
    );
    assert.equal(identity.shopifyAnalytics, false);
    assert.equal(identity.analyticsShop.channel, 'headless');
  });
});

const inr = (amount: string) => ({ amount, currencyCode: 'INR' });
const component = (handle: string, price: string, share: string) => ({
  id: `c-${handle}`,
  quantity: 1,
  cost: { totalAmount: inr(share), amountPerQuantity: inr(share) },
  merchandise: { price: inr(price), product: { title: handle, handle } },
});
const bundleLine = {
  id: 'gid://shopify/CartLine/bundle',
  quantity: 1,
  cost: { totalAmount: inr('1999.00'), amountPerQuantity: inr('1999.00') },
  attributes: [
    { key: '_hcms_bundle', value: 'buy3' },
    { key: '_hcms_box_name', value: 'Build your box #ab12' },
  ],
  merchandise: { product: { handle: 'box-bundle' } },
  // Components carry their share of the bundle price; list prices come from the variant.
  lineComponents: [
    component('liquid', '749.95', '710.50'),
    component('managed', '629.95', '596.80'),
    component('location', '729.95', '691.70'),
  ],
};

describe('Build a box cart row (S2-5) and upsell (S2-10)', () => {
  it('merged box row strikes the components list-price total', () => {
    const [row] = groupCartLines([bundleLine]);
    assert.equal(row?.kind, 'box');
    if (row?.kind !== 'box') return;
    assert.equal(row.name, 'Build your box');
    assert.deepEqual(row.total, inr('1999.00'));
    assert.deepEqual(row.original, inr('2109.850'));
  });

  it('cart savings include the bundle saving', () => {
    assert.deepEqual(
      cartSavings([bundleLine], { subtotalAmount: inr('1999.00'), totalAmount: inr('1999.00') }),
      inr('110.850'),
    );
  });

  it('products inside a merged box count as in the cart', () => {
    assert.deepEqual(upsellSeed([bundleLine]).inCart, [
      'box-bundle',
      'liquid',
      'managed',
      'location',
    ]);
  });
});

describe('cart scheme (S2-11) and page h1 (S2-7)', () => {
  it('drawer Checkout uses the main-cart colour scheme (default scheme-1)', () => {
    const doc = (settings: Record<string, unknown>) => ({
      templates: { cart: { sections: { main: { type: 'main-cart', settings } } } },
    });
    assert.equal(mainCartSchemeClass(doc({ color_scheme: 'scheme-3' })), 'color-scheme-3');
    assert.equal(mainCartSchemeClass(doc({})), 'color-scheme-1');
    assert.equal(mainCartSchemeClass(doc({ color_scheme: 'x"><b' })), 'color-scheme-1');
    assert.equal(mainCartSchemeClass(null), 'color-scheme-1');
  });

  it('page templates without an enabled main-page need a hidden h1', () => {
    assert.equal(
      needsPageHeading({ order: ['form'], sections: { form: { type: 'contact-form' } } }),
      true,
    );
    assert.equal(
      needsPageHeading({ order: ['main'], sections: { main: { type: 'main-page' } } }),
      false,
    );
    assert.equal(
      needsPageHeading({
        order: ['main'],
        sections: { main: { type: 'main-page', disabled: true } },
      }),
      true,
    );
  });
});

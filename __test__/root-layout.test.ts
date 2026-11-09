import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Resolve the template's `~/*` tsconfig path alias so the app module can run
// directly under `node --test`.
const APP_ROOT = new URL('../app/', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('~/')) return nextResolve(specifier, context);
    return nextResolve(new URL(`${specifier.slice(2)}.ts`, APP_ROOT).href, context);
  },
});

// Dynamic import: static imports are linked before this module body registers the hook.
const { ROOT_LAYOUT_TIMEOUT_MS, loadRootLayout } = await import('../app/lib/root-layout.ts');

const MOCK_SHOP_LAYOUT = {
  shop: {
    id: 'gid://shopify/Shop/68817551382',
    name: 'Mock Shop',
    brand: null,
    paymentSettings: { acceptedCardBrands: [], supportedDigitalWallets: [] },
  },
  localization: { country: { currency: { isoCode: 'CAD' } } },
};

test('root layout exposes the Storefront API localization currency', async () => {
  const layout = await loadRootLayout({
    graphql: async () => ({ data: MOCK_SHOP_LAYOUT }),
  } as Pick<import('@shopify/hydrogen').StorefrontClient, 'graphql'>);

  assert.equal(layout.currency, 'CAD');
});

type LayoutClient = Pick<import('@shopify/hydrogen').StorefrontClient, 'graphql'>;

/** A Storefront API that never answers, except by honouring the abort signal (slow upstream). */
const hangingClient = (seen: { signal?: AbortSignal }) =>
  ({
    graphql: (_query: unknown, options?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        seen.signal = options?.signal;
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
      }),
  }) as unknown as LayoutClient;

/** Runs `fn` with console.error captured (the loader logs upstream failures). */
async function quietly<T>(fn: (errors: string[]) => Promise<T>): Promise<T> {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args.join(' '));
  try {
    return await fn(errors);
  } finally {
    console.error = original;
  }
}

// S2-2: a slow upstream never holds the page; the root renders the fallback layout instead.
test('slow Storefront API: root layout gives up at the timeout and falls back', async () => {
  await quietly(async (errors) => {
    const seen: { signal?: AbortSignal } = {};
    const started = Date.now();
    const layout = await loadRootLayout(hangingClient(seen), {
      fallbackCurrency: 'CAD',
      timeoutMs: 50,
    });
    assert.ok(Date.now() - started < 1000, 'returned soon after the timeout');
    assert.equal(seen.signal?.aborted, true);
    assert.equal(layout.shopId, '');
    assert.equal(layout.currency, 'CAD');
    assert.equal(layout.shopDescription, null);
    assert.match(errors[0] ?? '', /Root layout query failed/);
  });
});

test('root layout waits at most 3 s by default', async () => {
  assert.equal(ROOT_LAYOUT_TIMEOUT_MS, 3000);
  await quietly(async () => {
    const seen: { signal?: AbortSignal } = {};
    const pending = loadRootLayout(hangingClient(seen));
    // The query got a timeout signal that hasn't fired yet (the default budget is running).
    assert.ok(seen.signal instanceof AbortSignal);
    assert.equal(seen.signal.aborted, false);
    const started = Date.now();
    const layout = await pending;
    assert.ok(Date.now() - started >= 2500, 'held for the default budget, not less');
    assert.equal(seen.signal.aborted, true);
    assert.equal(layout.shopId, '');
    assert.equal(layout.currency, 'USD');
  });
});

test('root layout falls back when the API answers errors without data', async () => {
  await quietly(async () => {
    const layout = await loadRootLayout(
      {
        graphql: async () => ({ data: null, errors: [{ message: 'Throttled' }] }),
      } as unknown as LayoutClient,
      { fallbackCurrency: 'EUR' },
    );
    assert.equal(layout.shopId, '');
    assert.equal(layout.currency, 'EUR');
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkShiprocket,
  createShiprocketState,
  parseServiceability,
  serviceabilityUrl,
  validPincode,
} from '../app/lib/hcms/delivery.ts';

const ENV = {
  SHIPROCKET_EMAIL: 'api@shop.test',
  SHIPROCKET_PASSWORD: 'secret',
  SHIPROCKET_PICKUP_PINCODE: '560001',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(handlers: { login?: () => Response; service?: () => Response }) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('authorization');
    calls.push({ url, auth });
    if (url.endsWith('/auth/login')) return handlers.login?.() ?? reply({ token: 'tok' });
    return handlers.service?.() ?? reply({ data: { available_courier_companies: [] } });
  };
  return { fetcher, calls };
}

test('pincode validation: six digits, no leading zero', () => {
  assert.equal(validPincode('110001'), true);
  for (const bad of ['011001', '1100', '1100011', 'abcdef', '', null, undefined])
    assert.equal(validPincode(bad), false);
});

test('serviceability URL carries pickup, delivery, weight', () => {
  const url = new URL(serviceabilityUrl('110001', { ...ENV, SHIPROCKET_WEIGHT_KG: '1.5' }));
  assert.equal(url.searchParams.get('pickup_postcode'), '560001');
  assert.equal(url.searchParams.get('delivery_postcode'), '110001');
  assert.equal(url.searchParams.get('weight'), '1.5');
});

test('parseServiceability: fastest..slowest (capped), COD, none = unserviceable', () => {
  assert.deepEqual(
    parseServiceability({
      data: {
        available_courier_companies: [
          { estimated_delivery_days: '3', cod: 1 },
          { estimated_delivery_days: '9', cod: 0 },
        ],
      },
    }),
    { status: 'ok', min: 3, max: 6, cod: true },
  );
  assert.deepEqual(parseServiceability({ data: { available_courier_companies: [] } }), {
    status: 'unserviceable',
  });
  assert.deepEqual(parseServiceability({ nope: 1 }), { status: 'unavailable' });
});

test('checkShiprocket logs in once, caches answers, sends the bearer token', async () => {
  const state = createShiprocketState();
  const { fetcher, calls } = fakeFetch({
    service: () =>
      reply({ data: { available_courier_companies: [{ estimated_delivery_days: 2 }] } }),
  });
  const first = await checkShiprocket('110001', ENV, fetcher, state, 1000);
  const second = await checkShiprocket('110001', ENV, fetcher, state, 2000);
  assert.deepEqual(first, { status: 'ok', min: 2, max: 2 });
  assert.deepEqual(second, first);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.auth, 'Bearer tok');
});

test('checkShiprocket: 401 renews the token once; 404 = unserviceable', async () => {
  const state = createShiprocketState();
  state.token = { value: 'stale', expires: Date.now() + 1e6 };
  let n = 0;
  const { fetcher } = fakeFetch({
    service: () => (n++ === 0 ? reply({}, 401) : reply({ message: 'none' }, 404)),
  });
  assert.deepEqual(await checkShiprocket('400001', ENV, fetcher, state), {
    status: 'unserviceable',
  });
  assert.equal(state.token?.value, 'tok');
});

test('checkShiprocket degrades to unavailable: no config, bad pincode, network error, login failure', async () => {
  const state = createShiprocketState();
  const { fetcher } = fakeFetch({});
  assert.equal((await checkShiprocket('110001', {}, fetcher, state)).status, 'unavailable');
  assert.equal((await checkShiprocket('1', ENV, fetcher, state)).status, 'unavailable');
  const boom = async (): Promise<Response> => {
    throw new Error('down');
  };
  assert.equal(
    (await checkShiprocket('110001', ENV, boom, createShiprocketState())).status,
    'unavailable',
  );
  const bad = fakeFetch({ login: () => reply({}, 403) });
  const s2 = createShiprocketState();
  assert.equal((await checkShiprocket('110001', ENV, bad.fetcher, s2)).status, 'unavailable');
  assert.equal(s2.answers.size, 0);
});

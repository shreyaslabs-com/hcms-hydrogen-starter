import assert from 'node:assert/strict';
import test from 'node:test';

import { createCartCookie, getCartId } from '@shopify/hydrogen';

import {
  cartCookieValues,
  cartToken,
  cookieDomains,
  reconcileCartCookie,
  withReconciledCartCookie,
} from '../app/lib/cart-cookie.ts';

// Online Store `cart` cookie values (token format from the AJAX Cart API reference).
const OS_TOKEN =
  'Z2NwLXVzLXdlc3QxOjAxSjBQTVk1Sjc5NVFKTjNOVlhLWENXQUI1?key=0d9909213054e22d092152de385763f0';
const OS_COOKIE = encodeURIComponent(OS_TOKEN);
const NEW_TOKEN = 'Z2NwLWV1cm9wZS13ZXN0NDowMUpCTkVX?key=aa11';

test('cart cookie (T-2.53): canonical value equals what Hydrogen writes and reads', () => {
  // Our canonical form is byte-for-byte Hydrogen's createCartCookie value…
  assert.ok(createCartCookie(`gid://shopify/Cart/${OS_TOKEN}`).startsWith(`cart=${OS_COOKIE};`));
  // …and an Online Store cookie needs no rewrite: Hydrogen reads it as the same cart.
  assert.equal(reconcileCartCookie(`_shopify_y=1; cart=${OS_COOKIE}`, 'www.example.com'), null);
  const request = new Request('https://www.example.com/', {
    headers: { cookie: `cart=${OS_COOKIE}` },
  });
  assert.equal(getCartId(request), `gid://shopify/Cart/${OS_TOKEN}`);
  // Legacy short tokens too.
  assert.equal(reconcileCartCookie('cart=c1-7a2c9d', 'example.com'), null);
});

test('cart cookie (T-2.53): no cart cookie → untouched', () => {
  assert.equal(reconcileCartCookie(null, 'example.com'), null);
  assert.equal(reconcileCartCookie('', 'example.com'), null);
  assert.equal(reconcileCartCookie('cart_ts=1; cart_sig=abc', 'example.com'), null);
});

test('cart cookie (T-2.53): token parsing tolerates every format both channels have used', () => {
  assert.equal(cartToken(OS_COOKIE), OS_TOKEN);
  assert.equal(cartToken(OS_TOKEN), OS_TOKEN);
  assert.equal(cartToken(`"${OS_COOKIE}"`), OS_TOKEN);
  assert.equal(cartToken(encodeURIComponent(`gid://shopify/Cart/${OS_TOKEN}`)), OS_TOKEN);
  assert.equal(cartToken('c1-7a2c9d'), 'c1-7a2c9d');
  for (const junk of ['', 'undefined', 'null', 'a b', 'x'.repeat(2000), '<script>', 'a;b']) {
    assert.equal(cartToken(junk), null, junk);
  }
});

test('cart cookie (T-2.53): duplicates keep the newest and clear the domain-scoped copies', () => {
  // Browser order for equal paths = creation order: Online Store (older) first, Hydrogen last.
  const header = `cart=${OS_COOKIE}; _shopify_y=1; cart=${encodeURIComponent(NEW_TOKEN)}`;
  assert.deepEqual(cartCookieValues(header), [OS_COOKIE, encodeURIComponent(NEW_TOKEN)]);
  const fix = reconcileCartCookie(header, 'www.example.com');
  assert.ok(fix);
  assert.equal(fix.token, NEW_TOKEN);
  assert.equal(fix.cookie, `_shopify_y=1; cart=${encodeURIComponent(NEW_TOKEN)}`);
  assert.deepEqual(fix.setCookies, [
    'cart=; Path=/; SameSite=Lax; Max-Age=0',
    'cart=; Domain=www.example.com; Path=/; SameSite=Lax; Max-Age=0',
    'cart=; Domain=example.com; Path=/; SameSite=Lax; Max-Age=0',
    `cart=${encodeURIComponent(NEW_TOKEN)}; Path=/; SameSite=Lax; Max-Age=1209600`,
  ]);
  // A junk duplicate never wins.
  assert.equal(
    reconcileCartCookie(`cart=${OS_COOKIE}; cart=undefined`, 'example.com')?.token,
    OS_TOKEN,
  );
});

test('cart cookie (T-2.53): junk is dropped; non-canonical single values are fixed in the request only', () => {
  const junk = reconcileCartCookie('a=1; cart=undefined', 'shop.example.co.uk');
  assert.ok(junk);
  assert.equal(junk.cookie, 'a=1');
  assert.equal(junk.token, null);
  assert.equal(junk.setCookies.length, 1 + cookieDomains('shop.example.co.uk').length);

  const quoted = reconcileCartCookie(`cart="${OS_COOKIE}"`, 'example.com');
  assert.deepEqual(quoted, { cookie: `cart=${OS_COOKIE}`, setCookies: [], token: OS_TOKEN });
});

test('cart cookie (T-2.53): cookie domains', () => {
  assert.deepEqual(cookieDomains('www.shop.example.com:443'), [
    'www.shop.example.com',
    'shop.example.com',
    'example.com',
  ]);
  assert.deepEqual(cookieDomains('localhost:3000'), []);
  assert.deepEqual(cookieDomains('127.0.0.1:3000'), []);
});

test('cart cookie (T-2.53): request/response wrapper', async () => {
  const plain = new Request('https://www.example.com/', {
    headers: { cookie: `cart=${OS_COOKIE}` },
  });
  const same = withReconciledCartCookie(plain);
  assert.equal(same.request, plain);
  const untouched = new Response('ok');
  assert.equal(same.finish(untouched), untouched);

  const dup = new Request('https://www.example.com/cart', {
    method: 'POST',
    body: 'x=1',
    headers: { cookie: `cart=${OS_COOKIE}; cart=${encodeURIComponent(NEW_TOKEN)}` },
  });
  const wrapped = withReconciledCartCookie(dup);
  assert.equal(getCartId(wrapped.request), `gid://shopify/Cart/${NEW_TOKEN}`);
  assert.equal(await wrapped.request.text(), 'x=1');

  // The app's own cart cookie (e.g. a new cart) comes after ours, so it wins.
  const appResponse = new Response('ok', { status: 201, headers: { 'x-a': '1' } });
  appResponse.headers.append('set-cookie', createCartCookie('gid://shopify/Cart/newer?key=1'));
  const response = wrapped.finish(appResponse);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-a'), '1');
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 5);
  assert.match(cookies[0] ?? '', /Max-Age=0/);
  assert.match(cookies.at(-1) ?? '', /^cart=newer%3Fkey%3D1;/);
  assert.equal(await response.text(), 'ok');
});

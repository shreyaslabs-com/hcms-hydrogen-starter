import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addToCart,
  cartAddDestination,
  cartIdFromCookie,
  marketRedirectPrefix,
  parseBoxForm,
  parseCartAddForm,
  randomBoxInstance,
  safeReturnTo,
  type CartAddLine,
  type CartAddOps,
} from '../app/lib/hcms/cart-add.ts';

const VARIANT = 'gid://shopify/ProductVariant/42';
const PLAN = 'gid://shopify/SellingPlan/7';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

/** Records the lines each mutation receives (what the Storefront API would get). */
function fakeOps(results: { add?: unknown; create?: unknown } = {}) {
  const calls: { op: 'add' | 'create'; cartId?: string; lines: CartAddLine[] }[] = [];
  const ops: CartAddOps = {
    add: async (cartId, lines) => {
      calls.push({ op: 'add', cartId, lines });
      return (results.add ?? { cart: { id: cartId }, userErrors: [] }) as never;
    },
    create: async (lines) => {
      calls.push({ op: 'create', lines });
      return (
        'create' in results
          ? results.create
          : { cart: { id: 'gid://shopify/Cart/new-token?key=k1' }, userErrors: [] }
      ) as never;
    },
  };
  return { ops, calls };
}

test('cart add (T-2.44): the form carries sellingPlanId; empty = one-time purchase', () => {
  assert.deepEqual(
    parseCartAddForm(
      form({
        merchandiseId: VARIANT,
        quantity: '2',
        sellingPlanId: PLAN,
        return_to: '/fr-ca/products/kurta?Size=S',
      }),
    ),
    {
      line: { merchandiseId: VARIANT, quantity: 2, sellingPlanId: PLAN },
      returnTo: '/fr-ca/products/kurta?Size=S',
    },
  );
  assert.deepEqual(parseCartAddForm(form({ merchandiseId: VARIANT, sellingPlanId: '' }))?.line, {
    merchandiseId: VARIANT,
    quantity: 1,
  });
  assert.equal(
    parseCartAddForm(form({ merchandiseId: VARIANT, quantity: '500' }))?.line.quantity,
    99,
  );
});

test('cart add: rejects junk ids, quantities and off-site return paths', () => {
  assert.equal(parseCartAddForm(form({ merchandiseId: 'gid://shopify/Product/1' })), null);
  assert.equal(parseCartAddForm(form({ merchandiseId: VARIANT, quantity: '0' })), null);
  assert.equal(parseCartAddForm(form({ merchandiseId: VARIANT, sellingPlanId: 'x' })), null);
  assert.equal(
    parseCartAddForm(form({ merchandiseId: VARIANT, return_to: '//evil.example' }))?.returnTo,
    '/',
  );
  for (const bad of ['https://evil.example', '/\\evil', 'products', '/a\nb', 42])
    assert.equal(safeReturnTo(bad), null);
});

test('cart add: adds to the cookie cart with the selling plan; no new cookie', async () => {
  assert.equal(cartIdFromCookie('a=1; cart=tok%3Fkey%3Dk'), 'gid://shopify/Cart/tok?key=k');
  assert.equal(cartIdFromCookie('a=1'), null);
  const { ops, calls } = fakeOps();
  const outcome = await addToCart(
    { merchandiseId: VARIANT, quantity: 1, sellingPlanId: PLAN },
    'cart=tok%3Fkey%3Dk',
    ops,
  );
  assert.deepEqual(outcome, { ok: true, cartId: 'gid://shopify/Cart/tok?key=k', setCookie: null });
  assert.deepEqual(calls, [
    {
      op: 'add',
      cartId: 'gid://shopify/Cart/tok?key=k',
      lines: [{ merchandiseId: VARIANT, quantity: 1, sellingPlanId: PLAN }],
    },
  ]);
});

test('cart add: no cart (or a dead one) → cartCreate and the shared cart cookie', async () => {
  const fresh = fakeOps();
  const outcome = await addToCart(
    { merchandiseId: VARIANT, quantity: 1, sellingPlanId: PLAN },
    '',
    fresh.ops,
  );
  assert.equal(outcome.ok, true);
  assert.equal(
    outcome.ok && outcome.setCookie,
    'cart=new-token%3Fkey%3Dk1; Path=/; SameSite=Lax; Max-Age=1209600',
  );
  assert.deepEqual(
    fresh.calls.map((c) => c.op),
    ['create'],
  );
  assert.equal(fresh.calls[0]?.lines[0]?.sellingPlanId, PLAN);

  const dead = fakeOps({
    add: { cart: null, userErrors: [{ message: 'The specified cart does not exist.' }] },
  });
  const recovered = await addToCart({ merchandiseId: VARIANT, quantity: 1 }, 'cart=gone', dead.ops);
  assert.equal(recovered.ok, true);
  assert.deepEqual(
    dead.calls.map((c) => c.op),
    ['add', 'create'],
  );
});

test('cart add: Shopify user errors come back (e.g. a plan the variant does not have)', async () => {
  const { ops } = fakeOps({
    add: {
      cart: { id: 'gid://shopify/Cart/tok' },
      userErrors: [{ code: 'INVALID', message: 'Selling plan is not applicable' }],
    },
  });
  assert.deepEqual(
    await addToCart({ merchandiseId: VARIANT, quantity: 1, sellingPlanId: PLAN }, 'cart=tok', ops),
    {
      ok: false,
      errors: ['Selling plan is not applicable'],
    },
  );
  const failed = fakeOps({ create: null });
  assert.deepEqual(await addToCart({ merchandiseId: VARIANT, quantity: 1 }, null, failed.ops), {
    ok: false,
    errors: ['Could not add to cart'],
  });
});

test('T-2.105: redirect prefix comes from the market, never the raw locale param', () => {
  // POST /%5Cevil.com/__hcms/cart/add: the path resolves to the primary market (pathPrefix ''),
  // params.locale = '\evil.com' → 404 instead of `Location: /\evil.com/cart`.
  const url = new URL('https://shop.example/%5Cevil.com/__hcms/cart/add');
  const locale = decodeURIComponent(url.pathname.split('/')[1] as string);
  assert.equal(locale, '\\evil.com');
  assert.equal(marketRedirectPrefix(locale, { valid: true, pathPrefix: '' }), null);
  assert.equal(marketRedirectPrefix('/evil.com', { valid: true, pathPrefix: '' }), null);
  assert.equal(marketRedirectPrefix('fr-ca', { valid: false, pathPrefix: '' }), null);
  assert.equal(marketRedirectPrefix('fr-ca', { valid: true, pathPrefix: '/en-ca' }), null);
  // Valid market prefixes and unprefixed requests keep working.
  assert.equal(marketRedirectPrefix('fr-ca', { valid: true, pathPrefix: '/fr-ca' }), '/fr-ca');
  assert.equal(marketRedirectPrefix(undefined, { valid: true, pathPrefix: '' }), '');
});

test('line item properties (T-2.95): properties[<label>] fields become line attributes', () => {
  const data = form({ merchandiseId: VARIANT, quantity: '1' });
  data.set('properties[Engraving]', '  Happy\r\nBirthday\u0000 ');
  data.set('properties[Gift]', 'Yes');
  data.set('properties[Empty]', '   ');
  data.set('properties[__shopify_send_gift_card_to_recipient]', 'true');
  data.set('properties[' + 'k'.repeat(100) + ']', 'v'.repeat(400));
  data.set('other', 'ignored');
  const parsed = parseCartAddForm(data);
  assert.deepEqual(parsed?.line.attributes?.slice(0, 2), [
    { key: 'Engraving', value: 'Happy Birthday' },
    { key: 'Gift', value: 'Yes' },
  ]);
  assert.equal(parsed?.line.attributes?.length, 3);
  assert.equal(parsed?.line.attributes?.[2]?.key.length, 60);
  assert.equal(parsed?.line.attributes?.[2]?.value.length, 255);
});

test('line item properties: capped at 20 and absent when none are posted', () => {
  const data = form({ merchandiseId: VARIANT });
  for (let i = 0; i < 30; i++) data.set(`properties[F${i}]`, 'x');
  assert.equal(parseCartAddForm(data)?.line.attributes?.length, 20);
  const none = parseCartAddForm(form({ merchandiseId: VARIANT }));
  assert.equal(none !== null && 'attributes' in none.line, false);
});

// "Build a box" (replica P1-5): multi-line no-JS add.
const V1 = 'gid://shopify/ProductVariant/1';
const V2 = 'gid://shopify/ProductVariant/2';
const boxForm = (fields: [string, string][]) => {
  const data = new FormData();
  for (const [key, value] of fields) data.append(key, value);
  return data;
};
const BOX_BASE: [string, string][] = [
  ['box_id', 'box-3'],
  ['box_size', '3'],
  ['box_name', 'Any 3\n<b>box</b>'],
  ['return_to', '/pages/build'],
];
const fixedInstance = () => 'abcdef123456';

test('box form: lines share the box attributes; zeros and duplicates ignored', () => {
  const parsed = parseBoxForm(
    boxForm([
      ...BOX_BASE,
      [`box[${V1}]`, '1'],
      [`box[${V2}]`, '2'],
      [`box[${V1}]`, '3'],
      ['box[gid://shopify/ProductVariant/3]', '0'],
      ['box[gid://shopify/Product/9]', '1'],
    ]),
    fixedInstance,
  );
  const attributes = [
    { key: '_hcms_box', value: 'box-3:abcdef123456' },
    { key: '_hcms_box_name', value: 'Any 3 <b>box</b> #abcd' },
  ];
  assert.deepEqual(parsed, {
    lines: [
      { merchandiseId: V1, quantity: 1, attributes },
      { merchandiseId: V2, quantity: 2, attributes },
    ],
    returnTo: '/pages/build',
  });
});

test('box form: incomplete, overfull or malformed boxes are refused', () => {
  const refused = (fields: [string, string][]) =>
    assert.equal(parseBoxForm(boxForm(fields), fixedInstance), null);
  refused([...BOX_BASE, [`box[${V1}]`, '2']]);
  refused([...BOX_BASE, [`box[${V1}]`, '2'], [`box[${V2}]`, '2']]);
  refused([...BOX_BASE, [`box[${V1}]`, '1.5'], [`box[${V2}]`, '1.5']]);
  refused([...BOX_BASE, [`box[${V1}]`, '-1'], [`box[${V2}]`, '4']]);
  refused([
    ['box_id', 'x y'],
    ['box_size', '3'],
    [`box[${V1}]`, '3'],
  ]);
  refused([
    ['box_id', 'b'],
    ['box_size', '99'],
    [`box[${V1}]`, '99'],
  ]);
  const many: [string, string][] = [
    ['box_id', 'b'],
    ['box_size', '24'],
    ...Array.from({ length: 25 }, (_, i): [string, string] => [
      `box[gid://shopify/ProductVariant/${i + 1}]`,
      i === 0 ? '0' : '1',
    ]),
  ];
  assert.ok(parseBoxForm(boxForm(many), fixedInstance));
  refused([...many.slice(1), ['box_id', 'b'], ['box[gid://shopify/ProductVariant/99]', '1']]);
  // The instance id is minted on the server; a bad generator is refused.
  assert.equal(
    parseBoxForm(boxForm([...BOX_BASE, [`box[${V1}]`, '3']]), () => 'X'),
    null,
  );
});

test('box form: unsafe return_to falls back', () => {
  const parsed = parseBoxForm(
    boxForm([
      ['box_id', 'b'],
      ['box_size', '2'],
      ['return_to', '//evil.com'],
      [`box[${V1}]`, '2'],
    ]),
    fixedInstance,
  );
  assert.equal(parsed?.returnTo, '/');
  assert.equal(parsed?.lines[0]?.attributes?.length, 1);
});

test('box instance ids are lowercase alphanumerics', () => {
  assert.match(randomBoxInstance(), /^[a-z0-9]{12}$/);
});

test('a whole box is ONE cartLinesAdd', async () => {
  const { ops, calls } = fakeOps();
  const parsed = parseBoxForm(boxForm([...BOX_BASE, [`box[${V1}]`, '1'], [`box[${V2}]`, '2']]));
  assert.ok(parsed);
  const outcome = await addToCart(parsed.lines, 'cart=tok', ops);
  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.lines.length, 2);
});

test('plain Buy now (T-2.156): checkout=1 goes to /checkout, never for a box', () => {
  assert.equal(cartAddDestination(form({ merchandiseId: VARIANT })), '/cart');
  assert.equal(cartAddDestination(form({ merchandiseId: VARIANT, checkout: '1' })), '/checkout');
  assert.equal(cartAddDestination(form({ box_id: 'b', checkout: '1' })), '/cart');
  assert.equal(cartAddDestination(form({ merchandiseId: VARIANT, checkout: 'yes' })), '/cart');
});

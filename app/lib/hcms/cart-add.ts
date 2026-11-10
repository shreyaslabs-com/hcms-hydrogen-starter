/**
 * Add to cart with a selling plan (T-2.44), pure. Hydrogen 2026-10's product form store can't add
 * selling plans (`canAddToCart` rejects `requiresSellingPlan`), so products with purchase options
 * use our own path (owner decision 2026-11-07):
 * - JS: Standard Actions `updateCart({ lines: [{ merchandiseId, quantity, sellingPlanId }] })` —
 *   the cart store observes it (optimistic line, pending, errors) like any form add.
 * - No JS / runtime not ready: the form POSTs here (`/__hcms/cart/add`) → Storefront
 *   `cartLinesAdd` (or `cartCreate` when there's no usable cart) → 303 to `/cart`, setting the
 *   shared `cart` cookie when a cart was created (the same cookie Hydrogen reads, T-2.53).
 */
import { cartCookieValues, cartSetCookie, cartToken } from '../cart-cookie.ts';

export type CartLineAttribute = { key: string; value: string };
export type CartAddLine = {
  merchandiseId: string;
  quantity: number;
  sellingPlanId?: string;
  /** Line item properties (T-2.95). */
  attributes?: CartLineAttribute[];
};

export type CartAddForm = { line: CartAddLine; returnTo: string };
/** A "Build a box" add (replica P1-5): every chosen line, all sharing the box attributes. */
export type BoxAddForm = { lines: CartAddLine[]; returnTo: string };

export type CartMutationResult = {
  cart?: { id: string } | null;
  userErrors?: { code?: string | null; message: string }[] | null;
};

export type CartAddOps = {
  add: (cartId: string, lines: CartAddLine[]) => Promise<CartMutationResult | null | undefined>;
  create: (lines: CartAddLine[]) => Promise<CartMutationResult | null | undefined>;
};

const VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const SELLING_PLAN_GID = /^gid:\/\/shopify\/SellingPlan\/\d+$/;
const CART_GID_PREFIX = 'gid://shopify/Cart/';
export const MAX_QUANTITY = 99;

/** A same-origin path to go back to (never `//host` or a scheme), else `null`. */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if ([...value].some((c) => c.charCodeAt(0) < 0x20)) return null;
  return value;
}

/**
 * Path prefix for the redirect after a resource-route action under `:locale?` (T-2.105): the
 * resolved market's `pathPrefix`, never the raw `params.locale` (`/%5Cevil.com/__hcms/cart/add`
 * would give `Location: /\evil.com/cart`, which browsers follow off-site). `null` = 404: the URL's
 * locale segment isn't the current market's prefix (or the market is unknown).
 */
export function marketRedirectPrefix(
  locale: string | undefined,
  market: { valid: boolean; pathPrefix: string },
): string | null {
  if (!market.valid) return null;
  if (locale === undefined) return market.pathPrefix === '' ? '' : null;
  if (`/${locale}` !== market.pathPrefix) return null;
  return /^\/[a-z]{2,3}-[a-z]{2}$/i.test(market.pathPrefix) ? market.pathPrefix : null;
}

export const MAX_PROPERTIES = 20;
const MAX_PROPERTY_KEY = 60;
const MAX_PROPERTY_VALUE = 255;
const PROPERTY_FIELD = /^properties\[([^\]]{1,200})\]$/;

const cleanText = (value: string): string =>
  [...value.replace(/[\r\n\t]+/g, ' ')]
    .filter((c) => c.charCodeAt(0) >= 0x20 && c !== '\x7f')
    .join('')
    .trim();

/**
 * Line item properties (T-2.95) from `properties[<label>]` fields: control characters stripped,
 * key ≤ 60 / value ≤ 255 characters, empty values dropped (an unticked checkbox posts nothing),
 * reserved `__shopify*` keys refused, at most 20, first value per key wins.
 */
export function parseLineProperties(form: FormData): CartLineAttribute[] {
  const out = new Map<string, string>();
  for (const [name, raw] of form.entries()) {
    const match = PROPERTY_FIELD.exec(name);
    if (!match || typeof raw !== 'string') continue;
    const key = cleanText(match[1] ?? '').slice(0, MAX_PROPERTY_KEY);
    const value = cleanText(raw).slice(0, MAX_PROPERTY_VALUE);
    if (!key || !value || key.toLowerCase().startsWith('__shopify') || out.has(key)) continue;
    out.set(key, value);
    if (out.size >= MAX_PROPERTIES) break;
  }
  return [...out].map(([key, value]) => ({ key, value }));
}

/**
 * The add-to-cart form (`merchandiseId`, `quantity`, `sellingPlanId` — empty = one-time,
 * `return_to`). `null` when it isn't a valid add.
 */
export function parseCartAddForm(form: FormData): CartAddForm | null {
  const merchandiseId = String(form.get('merchandiseId') ?? '');
  if (!VARIANT_GID.test(merchandiseId)) return null;
  const quantity = Number.parseInt(String(form.get('quantity') ?? '1'), 10);
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  const plan = String(form.get('sellingPlanId') ?? '');
  if (plan && !SELLING_PLAN_GID.test(plan)) return null;
  const attributes = parseLineProperties(form);
  return {
    line: {
      merchandiseId,
      quantity: Math.min(quantity, MAX_QUANTITY),
      ...(plan ? { sellingPlanId: plan } : {}),
      ...(attributes.length ? { attributes } : {}),
    },
    returnTo: safeReturnTo(form.get('return_to')) ?? '/',
  };
}

/** Hidden attribute the "Build a box" Cart Transform groups lines by (`<box id>:<instance>`). */
export const BOX_ATTRIBUTE = '_hcms_box';
export const BOX_NAME_ATTRIBUTE = '_hcms_box_name';
export const MAX_BOX_LINES = 24;
export const MAX_BOX_ITEMS = 24;
const BOX_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const BOX_FIELD = /^box\[(gid:\/\/shopify\/ProductVariant\/\d+)\]$/;
const BOX_INSTANCE = /^[a-z0-9]{6,16}$/;

/** A random box instance id (lowercase alphanumerics), from Web Crypto. */
export function randomBoxInstance(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

/**
 * The "Build a box" no-JS form (`@hcms/sections` `bundle-builder`): `box_id` (the store-wide box
 * offer's handle), `box_name`, `box_size`, `return_to` and one `box[<variant GID>]` quantity per
 * product. Valid only when the quantities add up to exactly `box_size` (2–24) with at most
 * `MAX_BOX_LINES` variants; zero quantities are ignored and the first value per variant wins (a
 * product shown in two tabs posts twice). Every line gets `_hcms_box` = `<box id>:<instance>`
 * (instance minted here, never taken from the browser) and the sanitized `Box` name.
 *
 * `box_size` comes from the form on purpose (no extra Storefront query per add): it is only a UX
 * check. The box offer is the source of truth at checkout — the Cart Transform reads size, price
 * and collections from its own config (ADR 010) and leaves a group whose quantity or products
 * don't match at normal prices, so a forged size can't lower a price. `null` = not a valid box.
 */
export function parseBoxForm(
  form: FormData,
  instance: () => string = randomBoxInstance,
): BoxAddForm | null {
  const id = String(form.get('box_id') ?? '').trim();
  if (!BOX_ID.test(id)) return null;
  const size = Number.parseInt(String(form.get('box_size') ?? ''), 10);
  if (!Number.isInteger(size) || size < 2 || size > MAX_BOX_ITEMS) return null;
  const quantities = new Map<string, number>();
  for (const [name, raw] of form.entries()) {
    const variant = BOX_FIELD.exec(name)?.[1];
    if (!variant || typeof raw !== 'string' || quantities.has(variant)) continue;
    const quantity = Number(raw.trim() || '0');
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > size) return null;
    if (quantity === 0) continue;
    quantities.set(variant, quantity);
    if (quantities.size > MAX_BOX_LINES) return null;
  }
  const total = [...quantities.values()].reduce((sum, qty) => sum + qty, 0);
  if (total !== size) return null;
  const key = instance();
  if (!BOX_INSTANCE.test(key)) return null;
  const name = cleanText(String(form.get('box_name') ?? '')).slice(0, 80);
  const attributes: CartLineAttribute[] = [
    { key: BOX_ATTRIBUTE, value: `${id}:${key}` },
    ...(name ? [{ key: BOX_NAME_ATTRIBUTE, value: `${name} #${key.slice(0, 4)}` }] : []),
  ];
  return {
    lines: [...quantities].map(([merchandiseId, quantity]) => ({
      merchandiseId,
      quantity,
      attributes,
    })),
    returnTo: safeReturnTo(form.get('return_to')) ?? '/',
  };
}

/** The cart GID from the request's `cart` cookie (newest valid value), or `null`. */
export function cartIdFromCookie(cookieHeader: string | null | undefined): string | null {
  const token = cartCookieValues(cookieHeader)
    .map(cartToken)
    .filter((t): t is string => t !== null)
    .at(-1);
  return token ? `${CART_GID_PREFIX}${token}` : null;
}

const tokenOf = (cartId: string) =>
  cartId.startsWith(CART_GID_PREFIX) ? cartId.slice(CART_GID_PREFIX.length) : cartId;

export type CartAddOutcome =
  { ok: true; cartId: string; setCookie: string | null } | { ok: false; errors: string[] };

/**
 * Adds the line(s) — one mutation for a whole box — to the shopper's cart, or creates one when there is none (or it's gone: Shopify
 * answers a missing/completed cart with no `cart`). `setCookie` is set when a new cart was made.
 */
export async function addToCart(
  input: CartAddLine | CartAddLine[],
  cookieHeader: string | null | undefined,
  ops: CartAddOps,
): Promise<CartAddOutcome> {
  const lines = Array.isArray(input) ? input : [input];
  const existing = cartIdFromCookie(cookieHeader);
  if (existing) {
    const result = await ops.add(existing, lines);
    if (result?.cart?.id && !result.userErrors?.length)
      return { ok: true, cartId: result.cart.id, setCookie: null };
    if (result?.cart?.id) return { ok: false, errors: messages(result) };
    // No cart back: the cookie points at a cart that can't be used → start a new one.
  }
  const created = await ops.create(lines);
  if (created?.cart?.id && !created.userErrors?.length)
    return {
      ok: true,
      cartId: created.cart.id,
      setCookie: cartSetCookie(tokenOf(created.cart.id)),
    };
  return { ok: false, errors: messages(created) };
}

function messages(result: CartMutationResult | null | undefined): string[] {
  const list = (result?.userErrors ?? []).map((e) => e.message).filter(Boolean);
  return list.length ? list : ['Could not add to cart'];
}

/**
 * Where a successful no-JS add goes (T-2.156): `checkout=1` (plain "Buy now", never a box) →
 * `/checkout` (Hydrogen's handler redirects it to the cart's checkout), else the cart page.
 */
export function cartAddDestination(form: FormData): '/checkout' | '/cart' {
  return form.get('checkout') === '1' && !form.has('box_id') ? '/checkout' : '/cart';
}

import { gql } from '@shopify/hydrogen';

import {
  addToCart,
  cartAddDestination,
  marketRedirectPrefix,
  parseBoxForm,
  safeReturnTo,
  parseCartAddForm,
  type CartAddLine,
} from '~/lib/hcms/cart-add';
import { marketContext } from '~/lib/localization';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/cart-add';

const CART_LINES_ADD = gql(`
  mutation HcmsCartLinesAdd(
    $cartId: ID!
    $lines: [CartLineInput!]!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { id }
      userErrors { code message }
    }
  }
`);

const CART_CREATE = gql(`
  mutation HcmsCartCreate(
    $lines: [CartLineInput!]!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    cartCreate(input: { lines: $lines, buyerIdentity: { countryCode: $country } }) {
      cart { id }
      userErrors { code message }
    }
  }
`);

/**
 * `/{market?}/__hcms/cart/add` (T-2.44): the no-JS path of the selling-plan add-to-cart form
 * (`components/product/HcmsProductForm.tsx` `SellingPlanBuyButtons`). Adds `merchandiseId` ×
 * `quantity` with the chosen `sellingPlanId` and 303s to the cart page (Online Store `/cart/add`
 * behaviour); on failure back to the product page. With JS the form uses Standard Actions instead.
 * Also the no-JS path of the "Build a box" section (`box_id` + `box[<variant>]` fields →
 * `parseBoxForm`, validated server-side; replica P1-5).
 */
export async function action({ request, context, params }: Route.ActionArgs) {
  // Never the raw `params.locale` (T-2.105: `/%5Cevil.com/…` → `Location: /\evil.com/cart`).
  const { market, valid } = context.get(marketContext);
  const prefix = marketRedirectPrefix(params.locale, { valid, pathPrefix: market.pathPrefix });
  if (prefix === null) return new Response('Not Found', { status: 404 });
  const form = await request.formData().catch(() => new FormData());
  // "Build a box" (replica P1-5): all chosen lines in ONE mutation; an incomplete box goes back.
  const box = form.has('box_id') ? parseBoxForm(form) : null;
  if (form.has('box_id') && !box) {
    const back = safeReturnTo(form.get('return_to')) ?? '/';
    return new Response(null, {
      status: 303,
      headers: { Location: back, 'Cache-Control': 'no-store' },
    });
  }
  const single = box ? null : parseCartAddForm(form);
  const parsed = box ?? (single ? { lines: [single.line], returnTo: single.returnTo } : null);
  if (!parsed) return new Response('Bad Request', { status: 400 });
  const storefront = context.get(storefrontClientContext);
  const lines = (input: CartAddLine[]) =>
    input.map((line) => ({
      merchandiseId: line.merchandiseId,
      quantity: line.quantity,
      ...(line.sellingPlanId ? { sellingPlanId: line.sellingPlanId } : {}),
      ...(line.attributes?.length ? { attributes: line.attributes } : {}),
    }));
  try {
    const outcome = await addToCart(parsed.lines, request.headers.get('cookie'), {
      add: async (cartId, input) =>
        (await storefront.graphql(CART_LINES_ADD, { variables: { cartId, lines: lines(input) } }))
          .data?.cartLinesAdd,
      create: async (input) =>
        (await storefront.graphql(CART_CREATE, { variables: { lines: lines(input) } })).data
          ?.cartCreate,
    });
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    if (outcome.ok) {
      // T-2.156 plain "Buy now" (`checkout=1`): Hydrogen's `/checkout` → the cart's checkout.
      headers.set('Location', `${prefix}${cartAddDestination(form)}`);
      if (outcome.setCookie) headers.append('Set-Cookie', outcome.setCookie);
    } else {
      headers.set('Location', parsed.returnTo);
    }
    return new Response(null, { status: 303, headers });
  } catch {
    return new Response(null, {
      status: 303,
      headers: { Location: parsed.returnTo, 'Cache-Control': 'no-store' },
    });
  }
}

export function loader() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

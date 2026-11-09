/**
 * The cart page's lines + summary (`CartPageLines`) load only when the cart has lines (D-26 `/cart`
 * budget: an empty cart page skips the row, gift, offers and summary code). Same pattern as the
 * product form (`product/product-slots.ts`): `entry.client.tsx` preloads it before hydrating when
 * the server HTML has `CART_LINES_ATTRIBUTE`, so hydration never suspends; `entry.server.tsx`
 * loads it before rendering. A cart that fills after hydration suspends in `CartPageBody`'s own
 * `<Suspense>` until loaded (prefetched when idle).
 */
import { createElement, use } from 'react';

import type * as Lines from './CartPageLines';

type Module = typeof Lines;

/** Set on the server-rendered lines grid; `budgets.mjs` mirrors the rule. */
export const CART_LINES_ATTRIBUTE = 'data-hcms-cart-lines';

let mod: Module | null = null;
let pending: Promise<Module> | null = null;

export function loadCartLines(): Promise<Module> {
  pending ??= import('./CartPageLines').then((m) => (mod = m));
  return pending;
}

export function CartLinesSlot(props: Lines.CartPageLinesProps) {
  return createElement((mod ?? use(loadCartLines())).CartPageLines, props);
}

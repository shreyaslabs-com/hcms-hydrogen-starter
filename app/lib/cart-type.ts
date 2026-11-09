/**
 * Cart type (T-2.43, Dawn theme setting "Cart type"): what happens after add to cart and when the
 * cart icon is clicked. `drawer` opens the drawer; `page` goes to /cart; `notification` shows an
 * "Added to your cart" popup (the icon then links to /cart, like Dawn). Theme setting
 * `settings.cart.type`, read once by the root loader. `useAfterAddToCart` (product form only) is in
 * `./after-add-to-cart.ts`, so the root chunk doesn't carry it (JS budget).
 */
import { useRouteLoaderData } from 'react-router';

import type { CartType } from '~/lib/hcms/cart-type-setting';

export { cartTypeFrom, type CartType } from '~/lib/hcms/cart-type-setting';
export const CART_NOTIFICATION_EVENT = 'hcms:cart-notification';

export function useCartType(): CartType {
  return useRouteLoaderData<{ cartType?: CartType }>('root')?.cartType ?? 'drawer';
}

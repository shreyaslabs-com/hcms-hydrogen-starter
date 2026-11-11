import { AnalyticsEvent, type AnalyticsCart } from '@shopify/hydrogen';

import type { CartData } from '~/lib/cart';
import { dispatchCheckoutStarted, publishAfterSettle } from '~/lib/hcms/checkout-started';

/**
 * Cart analytics events published from cart UI (drawer, notification, cart page, product form's
 * plain Buy now). Kept out of `components/AnalyticsTrackers.tsx` (root chunk) so only the lazy
 * cart chunks that publish them load this code (JS budget).
 */
function toAnalyticsCart(cart: CartData): AnalyticsCart | null {
  if (!cart.id || !cart.updatedAt) return null;

  return {
    id: cart.id,
    updatedAt: cart.updatedAt,
    lines: {
      nodes: cart.lines.nodes.flatMap((line) => {
        const merchandise = line.merchandise;
        const product = merchandise?.product;
        // Optimistic lines may not have product details yet.
        if (!merchandise?.id || !product?.id || !product.title || !product.vendor) {
          return [];
        }
        return [
          {
            id: line.id,
            quantity: line.quantity,
            merchandise: {
              id: merchandise.id,
              title: merchandise.title ?? product.title,
              sku: merchandise.sku,
              price: line.cost.amountPerQuantity,
              product: {
                id: product.id,
                title: product.title,
                vendor: product.vendor,
                productType: product.productType,
                handle: product.handle,
              },
            },
          },
        ];
      }),
    },
  };
}

/**
 * Checkout link clicked (T-2.66) → ad tags' begin checkout. A window event, not a Shopify bus
 * event (Shopify's own checkout pixels see `checkout_started` on checkout); name =
 * `CHECKOUT_STARTED` in lib/hcms/ad-events.ts (not imported: the mapping stays in its lazy chunk).
 */
export function publishCheckoutStarted(cart: CartData) {
  dispatchCheckoutStarted(window, toAnalyticsCart(cart));
}

/** T-2.159 plain Buy now: publishes once the cart store settled (`read` = the freshest cart). */
export function publishCheckoutStartedAfterSettle(read: () => CartData): Promise<void> {
  return publishAfterSettle(read, publishCheckoutStarted);
}

export function publishCartViewed(cart: CartData) {
  window.Shopify?.analytics?.publish(AnalyticsEvent.CART_VIEWED, {
    cart: toAnalyticsCart(cart),
  });
}

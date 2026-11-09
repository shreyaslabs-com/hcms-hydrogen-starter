/**
 * Free-shipping bar settings (T-2.43) for the root loader; pure so `node:test` can load it.
 * Thresholds: theme setting `cart.free_shipping_thresholds` (one amount per currency, validated by
 * `@hcms/schema`); drawer toggle: the cart page's `main-cart` `show_free_shipping` (default on).
 */
import { freeShippingThresholdsFrom, type CartGoals } from '@hcms/schema';

import { mainCartToggle } from './upsell.ts';

export type CartFreeShipping = {
  /** Currency code → goals (T-2.69; one amount = one goal); `null` when none (no bar anywhere). */
  thresholds: CartGoals | null;
  /** Show it in the cart drawer (follows `main-cart` `show_free_shipping`). */
  drawer: boolean;
};

export function cartFreeShippingFrom(document: unknown): CartFreeShipping {
  const thresholds = freeShippingThresholdsFrom(
    (document as { settings?: unknown } | null)?.settings,
  );
  return {
    thresholds: Object.keys(thresholds).length ? thresholds : null,
    drawer: mainCartToggle(document, 'show_free_shipping', true),
  };
}

/**
 * Free-shipping bar settings (T-2.43) for the root loader; pure so `node:test` can load it.
 * Thresholds: theme setting `cart.free_shipping_thresholds` (one amount per currency, validated by
 * `@hcms/schema`); drawer toggle: the cart page's `main-cart` `show_free_shipping` (default on).
 * T-2.159: `cart.cart_goal_type: item_count` + `cart.item_count_goals` → `itemGoals` (the bar
 * counts items instead of the subtotal).
 */
import {
  cartDrawerFrom,
  freeShippingThresholdsFrom,
  type CartGoals,
  type ItemGoal,
} from '@hcms/schema';

import { mainCartToggle } from './upsell.ts';

export type CartFreeShipping = {
  /** Currency code → goals (T-2.69; one amount = one goal); `null` when none (no bar anywhere). */
  thresholds: CartGoals | null;
  /** Show it in the cart drawer (follows `main-cart` `show_free_shipping`). */
  drawer: boolean;
  /** Item-count goals (T-2.159); only set when the goal type is `item_count` and goals exist. */
  itemGoals?: ItemGoal[];
};

export function cartFreeShippingFrom(document: unknown): CartFreeShipping {
  const settings = (document as { settings?: unknown } | null)?.settings;
  const thresholds = freeShippingThresholdsFrom(settings);
  const { goalType, itemGoals } = cartDrawerFrom(settings);
  return {
    thresholds: Object.keys(thresholds).length ? thresholds : null,
    drawer: mainCartToggle(document, 'show_free_shipping', true),
    ...(goalType === 'item_count' && itemGoals.length ? { itemGoals } : {}),
  };
}

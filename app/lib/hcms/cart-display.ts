/**
 * Richer cart settings (replica P1-6/P1-7), pure so `node:test` can load it: theme
 * `settings.cart` message strips / trust + payment icons / savings toggle / upsell rails
 * (`@hcms/schema` `cart-display.ts`) → root loader `cartDisplay` + `cartRails`.
 */
import {
  cartDisplayFrom,
  cartDrawerFrom,
  cartEmptyFrom,
  upsellRailsFrom,
  type CartDisplay,
  type CartDrawerConfig,
  type CartEmpty,
  type UpsellRail,
} from '@hcms/schema';

import { mainCartToggle } from './upsell.ts';

export type { CartDisplay, CartEmpty };
/** A rail with its background image resolved to a Shopify CDN URL. */
export type CartRail = Omit<UpsellRail, 'image'> & { imageUrl: string | null };

type Doc = { settings?: unknown; assets?: unknown } | null | undefined;
type Resolve = (
  value: unknown,
  assets: never,
) => { kind?: string; url?: string } | null | undefined;

export function cartDisplayForDocument(document: unknown): CartDisplay | null {
  return cartDisplayFrom((document as Doc)?.settings);
}

/** Drawer empty state (theme `cart.empty_*`); `null` = the default copy. */
export function cartEmptyForDocument(document: unknown): CartEmpty | null {
  return cartEmptyFrom((document as Doc)?.settings);
}

/** Drawer config for the root loader (T-2.159); `showUpsell` already resolved. */
export type CartDrawer = Omit<CartDrawerConfig, 'upsell' | 'goalType' | 'itemGoals'> & {
  showUpsell: boolean;
};

/**
 * Theme `cart.drawer_*` settings (T-2.159). The drawer's upsell is its own setting; unset
 * (`page`) keeps following the cart page's `main-cart` `show_upsell`, as before.
 */
export function cartDrawerForDocument(document: unknown): CartDrawer {
  const c = cartDrawerFrom((document as Doc)?.settings);
  return {
    showUpsell:
      c.upsell === 'page' ? mainCartToggle(document, 'show_upsell', true) : c.upsell === 'show',
    upsellLayout: c.upsellLayout,
    fallbackCollection: c.fallbackCollection,
    badgePrefix: c.badgePrefix,
    nudges: c.nudges,
    layout: c.layout,
    acceleratedCheckout: c.acceleratedCheckout,
    paymentLogos: c.paymentLogos,
  };
}

/** `resolve` = SDK `resolveFile`; only images are used. */
export function cartRailsForDocument(document: unknown, resolve: Resolve): CartRail[] {
  const doc = document as Doc;
  return upsellRailsFrom(doc?.settings).map(({ image, ...rail }) => {
    const file = image ? resolve(image, (doc?.assets ?? {}) as never) : null;
    return { ...rail, imageUrl: file?.kind === 'image' && file.url ? file.url : null };
  });
}

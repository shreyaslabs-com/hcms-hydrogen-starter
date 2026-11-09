/**
 * Richer cart settings (replica P1-6/P1-7), pure so `node:test` can load it: theme
 * `settings.cart` message strips / trust + payment icons / savings toggle / upsell rails
 * (`@hcms/schema` `cart-display.ts`) → root loader `cartDisplay` + `cartRails`.
 */
import {
  cartDisplayFrom,
  cartEmptyFrom,
  upsellRailsFrom,
  type CartDisplay,
  type CartEmpty,
  type UpsellRail,
} from '@hcms/schema';

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

/** `resolve` = SDK `resolveFile`; only images are used. */
export function cartRailsForDocument(document: unknown, resolve: Resolve): CartRail[] {
  const doc = document as Doc;
  return upsellRailsFrom(doc?.settings).map(({ image, ...rail }) => {
    const file = image ? resolve(image, (doc?.assets ?? {}) as never) : null;
    return { ...rail, imageUrl: file?.kind === 'image' && file.url ? file.url : null };
  });
}

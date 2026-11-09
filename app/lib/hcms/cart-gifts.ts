/**
 * Gift wrap + gift message (T-2.80), pure so `node:test` can load it. Settings: theme
 * `cart.gift_wrap_variant` / `cart.gift_message` (`@hcms/schema` `cart-gifts.ts`) → root loader
 * `cartGifts` → `components/CartGifts.tsx` (drawer + cart page).
 */
import { cartGiftsFrom, GIFT_MESSAGE_KEY, GIFT_MESSAGE_MAX, type CartGifts } from '@hcms/schema';

export { GIFT_MESSAGE_KEY, GIFT_MESSAGE_MAX, type CartGifts };

/** Root loader value: `null` when the merchant turned neither on. */
export function cartGiftsForDocument(document: unknown): CartGifts | null {
  return cartGiftsFrom((document as { settings?: unknown } | null)?.settings);
}

/** A Storefront variant GID (the gift-wrap price route accepts nothing else). */
export const GIFT_WRAP_VARIANT = /^gid:\/\/shopify\/ProductVariant\/\d+$/;

type Line = { id: string; merchandise?: { id?: string | null } | null };

/** The cart line holding the gift-wrap variant, if any. */
export function giftWrapLine<L extends Line>(
  lines: readonly L[],
  variantId: string,
): L | undefined {
  return lines.find((line) => line.merchandise?.id === variantId);
}

/** True when gift wrap is all that's left in the cart (it's then removed: nothing to wrap). */
export function onlyGiftWrap(lines: readonly Line[], variantId: string): boolean {
  return lines.length > 0 && lines.every((line) => line.merchandise?.id === variantId);
}

/**
 * Every cart attribute except `key`, values normalised to strings: Storefront
 * `cartAttributesUpdate` replaces the whole list, so a gift message save resends the others
 * (A/B `_hcms_exp`, apps' attributes) as hidden fields.
 */
export function otherAttributes(
  attributes: readonly { key: string; value?: string | null }[] | null | undefined,
  key: string = GIFT_MESSAGE_KEY,
): { key: string; value: string }[] {
  return (attributes ?? [])
    .filter((a) => a.key !== key)
    .map((a) => ({ key: a.key, value: a.value ?? '' }));
}

/**
 * When the drawer re-reads the cart (`useFreshCartFields`, hydrogen-cart-ui `refresh()`): after a
 * settled change to WHAT is in the cart. Pure so `node:test` can load it.
 *
 * The signature leaves out line ids and line order on purpose: a Cart Transform merged line
 * (Build a box bundle, ADR 010) can come back with a new id on every cart read, so an id-based
 * signature changed after each refresh and the drawer refreshed again forever (repeated
 * `/api/cart` requests while a box sat in the cart).
 */
export type RefreshLine = {
  id: string;
  quantity: number;
  merchandise?: { id?: string | null } | null;
  attributes?: ReadonlyArray<{ key: string; value?: string | null }> | null;
};

/** Attributes that tell lines of the same variant apart (one box vs another, a bundle). */
const KEY_ATTRIBUTES = ['_hcms_box', '_hcms_bundle'];

export function cartContentSignature(lines: readonly RefreshLine[]): string {
  return lines
    .map((line) => {
      const keys = KEY_ATTRIBUTES.map(
        (key) => line.attributes?.find((a) => a.key === key)?.value ?? '',
      ).join('|');
      return `${line.merchandise?.id ?? line.id}|${keys}:${line.quantity}`;
    })
    .sort()
    .join(',');
}

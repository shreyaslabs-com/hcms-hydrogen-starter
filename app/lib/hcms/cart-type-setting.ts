/** Theme setting `settings.cart.type` (T-2.43); pure so `node:test` can load it. */
export type CartType = 'drawer' | 'page' | 'notification';

export function cartTypeFrom(settings: unknown): CartType {
  const type = (settings as { cart?: { type?: unknown } } | null)?.cart?.type;
  return type === 'page' || type === 'notification' ? type : 'drawer';
}

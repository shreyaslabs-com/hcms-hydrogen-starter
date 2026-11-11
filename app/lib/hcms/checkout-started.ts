/**
 * `hcms:checkout_started` window event (T-2.66; T-2.159 adds the plain Buy now path): pure, so
 * `node:test` can load it. Name = `CHECKOUT_STARTED` in `ad-events.ts` (kept apart: the mapping
 * lives in its lazy chunk). `detail` = `{ cart }`, Hydrogen's `AnalyticsCart` (or `null`).
 */
export const CHECKOUT_STARTED_EVENT = 'hcms:checkout_started';

export function dispatchCheckoutStarted(target: EventTarget, cart: unknown): void {
  target.dispatchEvent(new CustomEvent(CHECKOUT_STARTED_EVENT, { detail: { cart } }));
}

/** Time for the cart store's update to commit before reading it (about two frames). */
export const CHECKOUT_SETTLE_MS = 32;

/**
 * Waits for the cart store to settle, then publishes with the freshest cart (`read`), so a
 * "Buy now" add is already in the event's lines.
 */
export async function publishAfterSettle<T>(
  read: () => T,
  publish: (cart: T) => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  await wait(CHECKOUT_SETTLE_MS);
  publish(read());
}

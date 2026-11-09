import { Suspense, lazy, useEffect, type ReactNode } from 'react';

import { publishCartViewed } from '~/components/AnalyticsTrackers';
import { useCartAnnouncement } from '~/components/cart-announcement';
import { CartLinesSlot } from '~/components/cart-lines-slot';
import { Deferred } from '~/components/Deferred';
import { useCart } from '~/lib/cart';

/**
 * Full cart page body: lines, estimated total, checkout. Used by the `/cart` route and as the HCMS
 * adapter's `CartPage` (D-22). Focus goes to `#cart-page-title` when the last line is removed.
 */
export function CartPageBody({
  showDynamicCheckout = true,
  showDiscounts = true,
  showNote = false,
  showUpsell = true,
  showFreeShipping = true,
  showSignIn = false,
  installments,
  emptyState,
}: {
  showDynamicCheckout?: boolean;
  showDiscounts?: boolean;
  showNote?: boolean;
  /** "You may also like" under the cart (T-2.43, `main-cart` `show_upsell`). */
  showUpsell?: boolean;
  /** Free-shipping progress (T-2.43, `main-cart` `show_free_shipping`; thresholds per currency). */
  showFreeShipping?: boolean;
  /** Sign in with Shop for signed-out shoppers (T-2.50, `main-cart` `show_sign_in`). */
  showSignIn?: boolean;
  /** Shop Pay Installments message for the total (T-2.50, rendered by `@hcms/sections`). */
  installments?: ((total: { amount: string; currencyCode: string }) => ReactNode) | undefined;
  emptyState: ReactNode;
}) {
  const cart = useCart((state) => state.data);
  const loading = useCart((state) => state.loading);
  const lines = cart.lines.nodes;
  const announcement = useCartAnnouncement();

  useEffect(() => {
    publishCartViewed(cart);
  }, [cart]);

  // Box removals are announced here (the row is gone); the region stays mounted when empty.
  const status = (
    <span role="status" className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  );
  if (loading) return <p className="text-on-surface-secondary">Loading cart…</p>;
  if (lines.length === 0)
    return (
      <>
        {status}
        {emptyState}
      </>
    );
  return (
    <>
      {status}
      {/* Lines + summary: own chunk (loaded before hydration when rendered on the server). */}
      <Suspense fallback={<p className="text-on-surface-secondary">Loading cart…</p>}>
        <CartLinesSlot
          showDynamicCheckout={showDynamicCheckout}
          showDiscounts={showDiscounts}
          showNote={showNote}
          showFreeShipping={showFreeShipping}
          showSignIn={showSignIn}
          installments={installments}
        />
      </Suspense>
      {showUpsell ? (
        <Deferred idle={false}>
          <LazyCartUpsell active />
        </Deferred>
      ) : null}
    </>
  );
}

// The upsell rails only appear after their client-side fetch (nothing renders on the server), so
// the cart page loads them after hydration instead of in its initial chunks (JS budget).
const LazyCartUpsell = lazy(() =>
  import('~/components/CartUpsell').then((m) => ({ default: m.CartUpsell })),
);

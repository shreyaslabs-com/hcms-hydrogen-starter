import { useEffect, useRef, useState } from 'react';
import { useRouteLoaderData } from 'react-router';

import { Link } from '~/components/LocaleLink';
import { publishCheckoutStarted } from '~/lib/cart-analytics';
import { useCart } from '~/lib/cart';
import { CART_NOTIFICATION_EVENT } from '~/lib/cart-type';

/**
 * Dawn's cart notification (T-2.43, cart type "notification"): a small non-modal popup after add
 * to cart with the cart count, View cart and Checkout. It stays until closed (Escape / ×) or the
 * page changes — no timeout to race (WCAG 2.2.1); focus moves to it so it is announced.
 */
export function CartNotification() {
  const [open, setOpen] = useState(false);
  const count = useCart((state) => state.data.totalQuantity);
  const cart = useCart((state) => state.data);
  const checkoutUrl = cart.checkoutUrl;
  // S2-11: the cart page's colour scheme, so Checkout matches `/cart`.
  const scheme = useRouteLoaderData<{ cartScheme?: string }>('root')?.cartScheme ?? '';
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(CART_NOTIFICATION_EVENT, show);
    return () => window.removeEventListener(CART_NOTIFICATION_EVENT, show);
  }, []);
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cart-notification-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      className="bg-surface text-on-surface border-border fixed end-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded border p-4 shadow-lg focus:outline-none"
      data-testid="cart-notification"
    >
      <div className="flex items-start justify-between gap-4">
        <p id="cart-notification-title" className="text-sm font-medium">
          Added to your cart
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="-me-2 -mt-2 inline-flex size-11 items-center justify-center rounded"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        <Link
          to="/cart"
          onClick={() => setOpen(false)}
          className="rounded-button button-outline inline-flex h-11 items-center justify-center text-sm no-underline"
        >
          View cart ({count})
        </Link>
        {checkoutUrl ? (
          <a
            href={checkoutUrl}
            onClick={() => publishCheckoutStarted(cart)}
            className={`${scheme} rounded-button button-primary inline-flex h-11 items-center justify-center text-sm no-underline`}
          >
            Checkout
          </a>
        ) : null}
      </div>
    </div>
  );
}

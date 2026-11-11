import { useCallback, useEffect, useRef } from 'react';

import { useCart } from '~/lib/cart';

/**
 * T-2.159: `hcms:checkout_started` for paths that leave for checkout without a cart checkout link
 * (the product page's plain Buy now, T-2.156). The returned callback publishes with the freshest
 * cart: call it after the add resolved; it waits a moment so the store's new line has rendered.
 * JS budget: the root chunk never loads this, and the cart event code (`~/lib/cart-analytics`)
 * loads on the click, not with the product form.
 */
export function useCheckoutStarted(): () => Promise<void> {
  const cart = useCart((state) => state.data);
  const latest = useRef(cart);
  useEffect(() => {
    latest.current = cart;
  }, [cart]);
  return useCallback(async () => {
    const { publishCheckoutStartedAfterSettle } = await import('~/lib/cart-analytics');
    await publishCheckoutStartedAfterSettle(() => latest.current);
  }, []);
}

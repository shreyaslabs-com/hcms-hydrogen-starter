import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useLocalePath } from '~/components/LocaleLink';
import { useCart } from '~/lib/cart';
import { openCartDrawer } from '~/lib/cart-drawer';
import { CART_NOTIFICATION_EVENT, useCartType } from '~/lib/cart-type';

/**
 * `afterSubmit` for add-to-cart forms. The drawer opens at once (it shows the optimistic line);
 * the page and notification wait until the cart settles, so they show confirmed contents and the
 * request is never cut off by navigation.
 */
export function useAfterAddToCart(): () => void {
  const type = useCartType();
  const navigate = useNavigate();
  const localize = useLocalePath();
  const settled = useCart(
    (state) =>
      !state.loading &&
      state.pending.lines.size === 0 &&
      !('revalidating' in state && state.revalidating === true),
  );
  const [waiting, setWaiting] = useState(false);
  const typeRef = useRef(type);
  typeRef.current = type;

  useEffect(() => {
    if (!waiting || !settled) return;
    setWaiting(false);
    if (typeRef.current === 'page') void navigate(localize('/cart'));
    else window.dispatchEvent(new CustomEvent(CART_NOTIFICATION_EVENT));
  }, [waiting, settled, navigate, localize]);

  return useCallback(() => {
    if (typeRef.current === 'drawer') openCartDrawer();
    else setWaiting(true);
  }, []);
}

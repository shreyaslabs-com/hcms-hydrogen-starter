/**
 * Cart conditions (T-2.170): sections/blocks shown only for some carts render with
 * `data-hcms-cart-condition` (hidden by `@hcms/hydrogen/style.css` until matched). This marks the
 * ones the visitor's cart matches, again whenever the cart changes or new content mounts (route
 * changes, lazy sections). Reuses the cart store subscription; no extra request.
 */
import { applyCartConditions } from '@hcms/hydrogen';
import { useEffect } from 'react';

import { useCart } from '~/lib/cart';

export function CartConditions() {
  const subtotal = Number(useCart((state) => state.data.cost?.subtotalAmount?.amount) ?? 0);
  const count = useCart((state) => state.data.totalQuantity ?? 0);
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      applyCartConditions(document, subtotal, count);
    };
    run();
    const observer = new MutationObserver(() => {
      frame ||= requestAnimationFrame(run);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [subtotal, count]);
  return null;
}

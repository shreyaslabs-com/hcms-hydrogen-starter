/**
 * Line offers + savings line (replica P1-6, SF-19): shared by the drawer (via `CartRich`) and the
 * cart page, in their own small module so `/cart` doesn't pull the drawer's icon tables (budget).
 */
import type { CartDisplay } from '@hcms/schema';
import { useRouteLoaderData } from 'react-router';

import { type CartLineView } from '~/components/CartLineItem';
import { useCart } from '~/lib/cart';
import { cartSavings, fromMilli, lineCompareAtMilli, lineDiscounts } from '~/lib/hcms/cart-savings';
import { formatPrice } from '~/lib/money';

export function useCartDisplay(): CartDisplay | null {
  return useRouteLoaderData<{ cartDisplay?: CartDisplay | null }>('root')?.cartDisplay ?? null;
}

/** Line price block: struck compare-at total, discounted total, discount labels ("BUY2 −₹100"). */
export function renderLineOffers(line: CartLineView, pending: boolean, showSavings: boolean) {
  const compare = showSavings ? lineCompareAtMilli(line) : null;
  const discounts = showSavings ? lineDiscounts(line) : [];
  const currency = line.cost.totalAmount.currencyCode;
  return (
    <div className={`mt-2 ${pending ? 'opacity-50' : ''}`}>
      <p className="text-on-surface text-sm">
        {compare !== null ? (
          <>
            <s className="text-on-surface-secondary me-2">
              <span className="sr-only">Was </span>
              {formatPrice(fromMilli(compare, currency))}
            </s>
            <span className="sr-only">Now </span>
          </>
        ) : null}
        {formatPrice(line.cost.totalAmount)}
      </p>
      {discounts.length ? (
        <ul role="list" className="mt-1 flex flex-wrap gap-1" data-line-discounts="">
          {discounts.map((d, i) => (
            <li key={i} className="text-success bg-surface-secondary rounded px-1.5 py-0.5 text-xs">
              {d.label} −{formatPrice(d.amount)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** "You save ₹X" for the footer (null when nothing is saved or the merchant turned it off). */
export function CartSavingsLine() {
  const display = useCartDisplay();
  const lines = useCart((state) => state.data.lines.nodes);
  const cost = useCart((state) => state.data.cost);
  if (display && !display.showSavings) return null;
  const saved = cartSavings(lines as never, cost);
  if (!saved) return null;
  return (
    <p className="text-success text-sm font-medium" data-cart-savings="">
      You save {formatPrice(saved)}
    </p>
  );
}

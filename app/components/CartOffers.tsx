/**
 * Line offers + savings line (replica P1-6, SF-19): shared by the drawer (via `CartRich`) and the
 * cart page, in their own small module so `/cart` doesn't pull the drawer's icon tables (budget).
 */
import { lineBadges, lineNudge, type CartDisplay } from '@hcms/schema';
import { useRouteLoaderData } from 'react-router';

import { type CartLineView } from '~/components/CartLineItem';
import { useCart } from '~/lib/cart';
import type { CartDrawer } from '~/lib/hcms/cart-display';
import { cartSavings, fromMilli, lineCompareAtMilli, lineDiscounts } from '~/lib/hcms/cart-savings';
import { useFormatPrice } from '~/lib/money';

export function useCartDisplay(): CartDisplay | null {
  return useRouteLoaderData<{ cartDisplay?: CartDisplay | null }>('root')?.cartDisplay ?? null;
}

/** Line price block: struck compare-at total, discounted total, discount labels ("BUY2 −₹100"). */
export function renderLineOffers(line: CartLineView, pending: boolean, showSavings: boolean) {
  return <LineOffers line={line} pending={pending} showSavings={showSavings} />;
}

function LineOffers({
  line,
  pending,
  showSavings,
}: {
  line: CartLineView;
  pending: boolean;
  showSavings: boolean;
}) {
  const formatPrice = useFormatPrice();
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
      <LineBadgesAndNudge line={line} />
    </div>
  );
}

/**
 * T-2.159: offer badges from product tags (`cart.cart_line_badge_prefix`, "badge:Buy 2 get 1") and
 * the first matching nudge rule (`cart.line_nudges`, "Add 1 more to get 1 FREE"). Tags arrive with
 * the line from Shopify (optimistic lines show them after the cart response).
 */
function LineBadgesAndNudge({ line }: { line: CartLineView }) {
  const config = useRouteLoaderData<{ cartDrawer?: CartDrawer }>('root')?.cartDrawer;
  const tags = line.merchandise?.product?.tags;
  if (!config || !tags?.length) return null;
  const badges = lineBadges(tags, config.badgePrefix);
  const nudge = lineNudge(tags, line.quantity, config.nudges);
  if (!badges.length && !nudge) return null;
  return (
    <>
      {badges.length ? (
        <ul role="list" className="mt-1 flex flex-wrap gap-1" data-line-badges="">
          {badges.map((text) => (
            <li
              key={text}
              className="text-on-surface bg-surface-secondary rounded px-1.5 py-0.5 text-xs font-medium"
            >
              {text}
            </li>
          ))}
        </ul>
      ) : null}
      {nudge ? (
        <p className="text-on-surface mt-1 text-xs font-medium" data-line-nudge="">
          {nudge}
        </p>
      ) : null}
    </>
  );
}

/** "You save ₹X" for the footer (null when nothing is saved or the merchant turned it off). */
export function CartSavingsLine() {
  const formatPrice = useFormatPrice();
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

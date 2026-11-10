/**
 * Richer cart drawer pieces (replica P1-6): per-line compare-at + discount labels, savings line,
 * merchant message strips, trust-icon row, payment chips. Loaded only with the lazy `CartDrawer`
 * chunk (ADR 005); line offers + savings line live in `CartOffers` (shared with the cart page).
 * Settings: theme `cart.messages` / `trust_icons` / `payment_icons` / `show_savings` → root `cartDisplay`.
 */
import type { CartDisplay, TrustIcon } from '@hcms/schema';
import { useEffect, useRef } from 'react';
import { useCart, useCartActions } from '~/lib/cart';
import { cartContentSignature } from '~/lib/hcms/cart-refresh';
import { cartSavings, toMilli, fromMilli } from '~/lib/hcms/cart-savings';
import { useFormatPrice } from '~/lib/money';

import { useCartDisplay } from './CartOffers';

export { CartSavingsLine, renderLineOffers, useCartDisplay } from './CartOffers';
export { PaymentChips } from './CartPayments';

/**
 * Keeps our extra line fields (discount allocations, compare-at prices) current. Hydrogen 2026.10
 * updates them only for lines a change touched, so after removing a box item the other lines kept
 * their old "Build a box −₹…" labels while the cart total was already right. After each settled
 * change to the cart's content, re-read the cart once (hydrogen-cart-ui `refresh()`); a refresh
 * that only changes ids/order never triggers another one (`cartContentSignature`).
 */
export function useFreshCartFields() {
  const { refresh } = useCartActions();
  // What is in the cart, not line ids/order: a merged box line's id changes on every read.
  const signature = useCart((state) => cartContentSignature(state.data.lines.nodes));
  const settled = useCart(
    (state) =>
      !state.loading &&
      !('readyPromise' in state && state.readyPromise) &&
      state.pending.lines.size === 0 &&
      !('revalidating' in state && state.revalidating === true),
  );
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!settled) return;
    // First settled render: the data came from the server, nothing to refresh.
    if (last.current === null || last.current === signature) {
      last.current = signature;
      return;
    }
    last.current = signature;
    void refresh();
  }, [settled, signature, refresh]);
}

const TRUST_LABELS: Record<TrustIcon, string> = {
  secure: 'Secure checkout',
  returns: 'Easy returns',
  shipping: 'Fast shipping',
  quality: 'Quality assured',
  support: 'Friendly support',
};

/** Simple 24px stroke glyphs (own artwork), one path each. */
const TRUST_PATHS: Record<TrustIcon, string> = {
  secure: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3zm-3 9l2 2 4-4',
  returns: 'M4 8h11a5 5 0 010 10H8M4 8l4-4M4 8l4 4',
  shipping:
    'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  quality: 'M12 3l2.5 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.3 6.7 19.2l1.2-5.9L3.5 9.2l6-.7z',
  support: 'M4 13v-1a8 8 0 0116 0v1M4 13h3v5H4zm13 0h3v5h-3zm0 5c0 2-2 3-5 3',
};

const schemeClass = (id: string) => (id ? `color-${id}` : '');

/** Up to 3 merchant strips; scheme colours with the core surface as the fallback. */
export function CartMessages({ messages }: { messages: CartDisplay['messages'] }) {
  if (!messages.length) return null;
  return (
    <ul role="list" className="mb-4 grid gap-2" data-cart-messages="">
      {messages.map((message, i) => (
        <li
          key={i}
          className={`${schemeClass(message.scheme)} rounded px-3 py-2 text-center text-sm`}
          style={{
            background: 'var(--color-background, var(--color-surface-secondary))',
            color: 'var(--color-text, var(--color-on-surface))',
          }}
        >
          {message.text}
        </li>
      ))}
    </ul>
  );
}

export function CartTrustRow({ icons }: { icons: TrustIcon[] }) {
  if (!icons.length) return null;
  return (
    <ul
      role="list"
      className="text-on-surface-secondary mt-6 grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-3 text-center text-xs"
      data-cart-trust=""
    >
      {icons.map((id) => (
        <li key={id} className="flex flex-col items-center gap-1">
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={TRUST_PATHS[id]} />
          </svg>
          {TRUST_LABELS[id]}
        </li>
      ))}
    </ul>
  );
}

/** Footer total with the compare ("was") total struck through when there are savings. */
export function CartCompareTotal() {
  const formatPrice = useFormatPrice();
  const display = useCartDisplay();
  const lines = useCart((state) => state.data.lines.nodes);
  const cost = useCart((state) => state.data.cost);
  if (display && !display.showSavings) return null;
  const saved = cartSavings(lines as never, cost);
  if (!saved) return null;
  const was = toMilli(cost.totalAmount.amount) + toMilli(saved.amount);
  return (
    <s className="text-on-surface-secondary me-2 text-sm font-normal">
      <span className="sr-only">Was </span>
      {formatPrice(fromMilli(was, cost.totalAmount.currencyCode))}
    </s>
  );
}

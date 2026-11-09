import { ShopPayButton } from '@shopify/hydrogen/react';
import { useEffect, useMemo, useState } from 'react';
import { useRouteLoaderData } from 'react-router';

import { CartDiscounts, CartFreeShippingBar } from '~/components/CartExtras';
import { CartGifts } from '~/components/CartGifts';
import { CartUpsell } from '~/components/CartUpsell';
import { Link } from '~/components/LocaleLink';
import { useCart } from '~/lib/cart';
import {
  closeCartDrawer,
  configureOpenCartAction,
  consumePendingCartOpen,
  CART_DRAWER_ID,
} from '~/lib/cart-drawer';
import { groupCartLines } from '~/lib/hcms/cart-boxes';
import type { CartEmpty } from '~/lib/hcms/cart-display';
import { formatPrice } from '~/lib/money';

import { publishCartViewed, publishCheckoutStarted } from './AnalyticsTrackers';
import { CartBoxRow } from './CartBoxRow';
import { useCartAnnouncement } from './cart-announcement';
import { CartLineItem } from './CartLineItem';
import {
  CartCompareTotal,
  CartMessages,
  CartSavingsLine,
  CartTrustRow,
  PaymentChips,
  renderLineOffers,
  useFreshCartFields,
  useCartDisplay,
} from './CartRich';

export { CartLineItem };

function CartErrorBanner() {
  const errors = useCart((state) => state.errors);
  const [dismissedAt, setDismissedAt] = useState(0);
  const messages = useMemo(() => {
    const lines = [...errors.lines.values()].flatMap((group) => group.userErrors);
    return [...errors.network, ...errors.cart.userErrors, ...lines].map((error) => error.message);
  }, [errors]);

  if (messages.length === 0 || errors.lastUpdatedAt <= dismissedAt) return null;

  return (
    <div className="border-border bg-surface-secondary mx-4 mb-2 rounded p-3 text-sm" role="alert">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          {messages.map((message) => (
            <p key={message} className="text-critical">
              {message}
            </p>
          ))}
        </div>
        <button
          type="button"
          className="button-ghost focus-visible:outline-accent rounded px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => setDismissedAt(errors.lastUpdatedAt)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function hasPendingCost(pending: {
  cost?: boolean;
  discountCodes: Set<string>;
  lines: Set<string>;
}): boolean {
  return pending.cost ?? (pending.lines.size > 0 || pending.discountCodes.size > 0);
}

function useCartStatusMessage(): string {
  const pending = useCart((state) => state.pending);
  const revalidating = useCart((state) => 'revalidating' in state && state.revalidating === true);
  const networkErrors = useCart((state) => state.errors.network);
  const isPending = hasPendingCost(pending) || revalidating;
  const [sawPending, setSawPending] = useState(false);

  useEffect(() => {
    if (isPending) setSawPending(true);
  }, [isPending]);

  if (isPending) return 'Updating cart totals';
  if (sawPending && networkErrors.length === 0) return 'Cart totals updated';
  return '';
}

const EMPTY_BUTTON =
  'rounded-button button-primary focus-visible:outline-accent mt-6 inline-flex h-11 items-center justify-center px-6 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

/** Empty drawer: theme settings › Cart (`cart.empty_*`, root `cartEmpty`), else today's copy. */
function EmptyCart() {
  const custom = useRouteLoaderData<{ cartEmpty?: CartEmpty | null }>('root')?.cartEmpty;
  const label = custom?.buttonLabel ?? 'Continue shopping';
  const link = custom?.buttonLink ?? '/collections';
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      {custom?.text ? (
        <p className="text-on-surface font-medium">{custom.text}</p>
      ) : (
        <>
          <p className="text-on-surface font-medium">Your cart is empty.</p>
          <p className="text-on-surface-secondary mt-2 text-sm">
            Looks like you haven&apos;t added anything to your cart yet.
          </p>
        </>
      )}
      {/^https?:/.test(link) ? (
        <a href={link} className={EMPTY_BUTTON}>
          {label}
        </a>
      ) : (
        <Link to={link} onClick={() => closeCartDrawer()} className={EMPTY_BUTTON}>
          {label}
        </Link>
      )}
    </div>
  );
}

function CartLines({ open }: { open: boolean }) {
  useFreshCartFields();
  const upsell = useRouteLoaderData<{ cartUpsell?: boolean }>('root')?.cartUpsell ?? true;
  const loading = useCart((state) => state.loading);
  const lines = useCart((state) => state.data.lines.nodes);
  const display = useCartDisplay();
  const showSavings = display?.showSavings ?? true;

  if (loading) {
    return <p className="text-on-surface-secondary type-body-sm">Loading cart…</p>;
  }

  if (lines.length === 0) return <EmptyCart />;

  return (
    <>
      {display ? <CartMessages messages={display.messages} /> : null}
      <CartFreeShippingBar drawer className="-mt-2 mb-4" />
      <ul role="list" className="divide-border -mt-4 divide-y">
        {groupCartLines(lines).map((row) =>
          row.kind === 'box' ? (
            <CartBoxRow key={row.key} box={row} emptyCartFocusId="cart-drawer-title" />
          ) : (
            <CartLineItem
              key={row.line.id}
              line={row.line}
              emptyCartFocusId="cart-drawer-title"
              renderOffers={(l, pending) => renderLineOffers(l, pending, showSavings)}
            />
          ),
        )}
      </ul>
      {display ? <CartTrustRow icons={display.trust} /> : null}
      {upsell ? <CartUpsell active={open} compact /> : null}
    </>
  );
}

function CartFooter() {
  const cart = useCart((state) => state.data);
  const pending = useCart((state) => state.pending);
  const revalidating = useCart((state) => 'revalidating' in state && state.revalidating === true);
  const display = useCartDisplay();
  // S2-11: the cart page's colour scheme, so Checkout matches `/cart`.
  const scheme = useRouteLoaderData<{ cartScheme?: string }>('root')?.cartScheme ?? '';
  const hasLines = cart.lines.nodes.length > 0;
  const isPending = hasPendingCost(pending) || revalidating;

  if (!hasLines) return null;

  return (
    <div className="border-border shrink-0 border-t p-4">
      <div className="flex flex-col gap-3">
        <CartGifts drawer className="flex flex-col gap-2" />
        <div className="flex items-center justify-between" aria-busy={isPending}>
          <span className="text-on-surface text-sm font-medium">
            Estimated total
            {isPending ? <span aria-hidden="true"> (updating)</span> : null}
          </span>
          <span
            className={`text-on-surface text-base font-medium ${isPending ? 'text-on-surface-secondary' : ''}`}
          >
            <CartCompareTotal />
            {formatPrice(cart.cost.totalAmount)}
          </span>
        </div>
        <CartSavingsLine />
        <p className="text-on-surface-secondary text-xs">
          Taxes and shipping calculated at checkout
        </p>
        <details className="group text-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
            Discount code
            <img
              src="/icons/icon-chevron-down.svg"
              alt=""
              aria-hidden="true"
              className="size-4 group-open:rotate-180 motion-safe:transition-transform"
            />
          </summary>
          <div className="pt-2">
            <CartDiscounts />
          </div>
        </details>
        {cart.checkoutUrl ? (
          <>
            <ShopPayButton width="100%" borderRadius="8px" />
            <a
              href={cart.checkoutUrl}
              onClick={() => publishCheckoutStarted(cart)}
              className={`${scheme} rounded-button button-primary focus-visible:outline-accent inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]`}
            >
              Checkout
            </a>
            {display ? <PaymentChips icons={display.payments} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function CartDrawer() {
  const totalQuantity = useCart((state) => state.data.totalQuantity);
  const cart = useCart((state) => state.data);
  const cartStatus = useCartStatusMessage();
  const announcement = useCartAnnouncement();
  const statusMessage = announcement || cartStatus;
  // Upsell recommendations load only once the drawer has been opened (T-2.43).
  const [opened, setOpened] = useState(false);

  // A cart click made before the drawer mounted (SF-22) opens it now.
  useEffect(() => consumePendingCartOpen(), []);

  useEffect(() => {
    configureOpenCartAction();
    const dialog = document.getElementById(CART_DRAWER_ID);
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (dialog.open) setOpened(true);
    const handleToggle = () => {
      if (!dialog.open) return;
      setOpened(true);
      publishCartViewed(cart);
    };
    dialog.addEventListener('toggle', handleToggle);
    return () => dialog.removeEventListener('toggle', handleToggle);
  }, [cart]);

  return (
    <>
      <span
        role="status"
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-cart-status
      >
        {statusMessage}
      </span>
      <dialog
        id={CART_DRAWER_ID}
        className="drawer-right bg-surface text-on-surface"
        aria-labelledby="cart-drawer-title"
        data-testid="cart-drawer"
        closedby="any"
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center py-2 ps-4">
            <div className="flex flex-1 items-center gap-2">
              <h2
                id="cart-drawer-title"
                tabIndex={-1}
                className="text-on-surface text-lg font-medium"
              >
                Cart
              </h2>
              <span className="cart-count-badge">{totalQuantity}</span>
            </div>
            <button
              type="button"
              commandfor={CART_DRAWER_ID}
              command="close"
              className="button-icon focus-visible:outline-accent inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]"
              aria-label="Close"
              onClick={() => closeCartDrawer()}
            >
              <img src="/icons/icon-x.svg" alt="" className="size-5" aria-hidden="true" />
            </button>
          </div>
          <CartErrorBanner />
          <div className="flex-1 overflow-y-auto p-4">
            <CartLines open={opened} />
          </div>
          <CartFooter />
        </div>
      </dialog>
    </>
  );
}

import { ShopPayButton } from '@shopify/hydrogen/react';
import type { ReactNode } from 'react';

import { publishCheckoutStarted } from '~/lib/cart-analytics';
import { CartBoxRow } from '~/components/CartBoxRow';
import { CartLineItem } from '~/components/CartLineItem';
import { CartDiscounts, CartFreeShippingBar, CartNoteDisclosure } from '~/components/CartExtras';
import { CartPaymentIcons } from '~/components/CartPayments';
import { CartGifts } from '~/components/CartGifts';
import { CartSavingsLine, renderLineOffers, useCartDisplay } from '~/components/CartOffers';
import { CART_LINES_ATTRIBUTE } from '~/components/cart-lines-slot';
import { SignInWithShop } from '~/components/SignInWithShop';
import { useCart } from '~/lib/cart';
import { groupCartLines } from '~/lib/hcms/cart-boxes';
import { useFormatPrice } from '~/lib/money';

export type CartPageLinesProps = {
  showDynamicCheckout: boolean;
  showDiscounts: boolean;
  showNote: boolean;
  showFreeShipping: boolean;
  showSignIn: boolean;
  installments?: ((total: { amount: string; currencyCode: string }) => ReactNode) | undefined;
  /** T-2.154 `main-cart` `cart_layout: table`. */
  layout?: 'table' | undefined;
};

/** Desktop column names for the table layout (rows repeat them as sr-only text). */
function TableHead() {
  return (
    <div
      aria-hidden="true"
      className="text-on-surface-secondary border-border hidden grid-cols-[minmax(0,1fr)_8rem_10rem_8rem] gap-4 border-b pb-3 text-xs font-medium tracking-wide uppercase md:grid"
    >
      <span>Product</span>
      <span>Price</span>
      <span>Quantity</span>
      <span className="text-end">Total</span>
    </div>
  );
}

/**
 * The cart page with lines (rows, summary, checkout), split from `CartPageBody` so the empty cart
 * page doesn't load the row/summary code (D-26 `/cart` budget). Loaded via `cart-lines-slot.ts`.
 */
export function CartPageLines({
  showDynamicCheckout,
  showDiscounts,
  showNote,
  showFreeShipping,
  showSignIn,
  installments,
  layout,
}: CartPageLinesProps) {
  const formatPrice = useFormatPrice();
  const cart = useCart((state) => state.data);
  const lines = cart.lines.nodes;
  const showSavings = useCartDisplay()?.showSavings ?? true;
  const table = layout === 'table';
  const list = (
    <ul role="list" className="divide-border divide-y">
      {groupCartLines(lines).map((row) =>
        row.kind === 'box' ? (
          <CartBoxRow key={row.key} box={row} emptyCartFocusId="cart-page-title" />
        ) : (
          <CartLineItem
            key={row.line.id}
            imageClassName={table ? 'size-20 sm:size-24' : 'size-24 sm:size-32'}
            line={row.line}
            emptyCartFocusId="cart-page-title"
            renderOffers={(l, pending) => renderLineOffers(l, pending, showSavings)}
            {...(table ? { table: true } : {})}
          />
        ),
      )}
    </ul>
  );
  return (
    <div
      {...{ [CART_LINES_ATTRIBUTE]: '' }}
      className={table ? 'grid gap-8' : 'grid gap-8 lg:grid-cols-[2fr_1fr]'}
    >
      {table ? (
        <div>
          <TableHead />
          {list}
        </div>
      ) : (
        list
      )}
      {/* Summary (templates review, Nov 9): total and Checkout first, extras after, closed. */}
      <aside
        className={`border-border h-fit rounded border p-4${table ? ' w-full lg:ms-auto lg:max-w-sm' : ''}`}
        aria-label="Cart summary"
      >
        {showFreeShipping ? (
          <CartFreeShippingBar className="border-border mb-4 border-b pb-4" />
        ) : null}
        <div className="flex items-center justify-between" data-cart-total="">
          <span className="text-on-surface text-sm font-medium">Estimated total</span>
          <span className="text-on-surface text-lg font-medium">
            {formatPrice(cart.cost.totalAmount)}
          </span>
        </div>
        <div className="mt-1">
          <CartSavingsLine />
        </div>
        {installments ? <div className="mt-2">{installments(cart.cost.totalAmount)}</div> : null}
        <p className="text-on-surface-secondary mt-2 text-xs">
          Taxes and shipping calculated at checkout
        </p>
        {cart.checkoutUrl ? (
          <div className="mt-4 grid gap-3" data-cart-checkout="">
            <a
              href={cart.checkoutUrl}
              onClick={() => publishCheckoutStarted(cart)}
              className="rounded-button button-primary focus-visible:outline-accent inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]"
            >
              Checkout
            </a>
            {showDynamicCheckout ? <ShopPayButton width="100%" borderRadius="8px" /> : null}
            {showSignIn ? <SignInWithShop label="Sign in with Shop" /> : null}
          </div>
        ) : null}
        <CartPaymentIcons className="mt-4" />
        {showDiscounts ? (
          <div className="border-border mt-4 border-t pt-4">
            <CartDiscounts />
          </div>
        ) : null}
        <CartGifts collapsed className="border-border mt-4 flex flex-col gap-1 border-t pt-2" />
        {showNote ? <CartNoteDisclosure /> : null}
      </aside>
    </div>
  );
}

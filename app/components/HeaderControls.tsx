import type { ReactNode } from 'react';

import { Link } from '~/components/LocaleLink';
import { useCart } from '~/lib/cart';
import {
  CART_DRAWER_ID,
  CART_DRAWER_TRIGGER,
  SEARCH_DRAWER_ID,
  openDialogFromLinkClick,
  requestCartDrawer,
} from '~/lib/cart-drawer';
import { useCartType } from '~/lib/cart-type';

/** Adapter header control props (`@hcms/hydrogen` `HeaderControlProps`, this app's React types). */
type HeaderControlProps = { icon?: ReactNode };

/** Header controls shared by the app header and the HCMS header section (via the app adapter). */

/**
 * The badge's visible number must be a whole word of the name (WCAG 2.5.3 label in name; voice
 * control users say "click 2"): "Cart, 2 items", not "Cart (2 items)" (axe found it, T-2.105).
 */
function cartCountLabel(count: number) {
  return count === 1 ? 'Cart, 1 item' : `Cart, ${count} items`;
}

function liveCartCountLabel(count: number) {
  return count === 1 ? '1 item in cart' : `${count} items in cart`;
}

function displayCount(count: number) {
  return count > 99 ? '99+' : String(count);
}

/**
 * Header icon drawn in `currentColor` (CSS mask over the static SVG), so it follows the header's
 * colour scheme (`--color-text`) instead of the SVG's fixed black (UX review P0 #7). The mask is
 * picked by `data-hcms-header-icon` (`app.css`), so the header section's icon settings (cart icon,
 * theme icon stroke: `@hcms/sections` sections.css) can swap it without JS.
 */
export function HeaderIcon({ name }: { name: 'search' | 'account' | 'cart' }) {
  return <span aria-hidden="true" className="hcms-mask-icon size-5" data-hcms-header-icon={name} />;
}

export function SearchButton({ icon }: HeaderControlProps = {}) {
  return (
    <Link
      to="/search"
      className="button-icon text-[color:var(--color-text,var(--color-on-surface))] focus-visible:outline-accent inline-flex h-11 w-11 cursor-pointer items-center justify-center gap-2 rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]"
      aria-label="Search"
      aria-controls={SEARCH_DRAWER_ID}
      aria-haspopup="dialog"
      data-testid="search-trigger"
      onClick={(event) => openDialogFromLinkClick(event, SEARCH_DRAWER_ID)}
    >
      {/* Fragment: `Link` children use react-router's ReactNode type, `icon` this app's. */}
      <>{icon ?? <HeaderIcon name="search" />}</>
    </Link>
  );
}

export function AccountButton({ icon }: HeaderControlProps = {}) {
  return (
    <Link
      to="/account"
      className="text-[color:var(--color-text,var(--color-on-surface))] focus-visible:outline-accent inline-flex h-11 w-11 items-center justify-center rounded hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-opacity"
      aria-label="Account"
    >
      <>{icon ?? <HeaderIcon name="account" />}</>
    </Link>
  );
}

export function CartButton({ icon }: HeaderControlProps = {}) {
  const totalQuantity = useCart((state) => state.data.totalQuantity);
  const cartType = useCartType();
  return (
    <>
      <Link
        to="/cart"
        className="text-[color:var(--color-text,var(--color-on-surface))] focus-visible:outline-accent relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition motion-safe:active:scale-[0.97]"
        aria-label={cartCountLabel(totalQuantity)}
        aria-controls={CART_DRAWER_ID}
        aria-haspopup="dialog"
        data-testid="cart-trigger"
        {...(cartType === 'drawer' ? { [CART_DRAWER_TRIGGER]: '' } : {})}
        // Page / notification cart types: the icon is a plain link to /cart (Dawn, T-2.43).
        onClick={(event) => {
          if (cartType === 'drawer') requestCartDrawer(event, event.currentTarget.href);
        }}
      >
        <span
          className="relative inline-flex size-5 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          {icon ?? <HeaderIcon name="cart" />}
          {totalQuantity > 0 ? (
            // `data-hcms-cart-count`: header `cart_count_style` (number / dot) restyles it in CSS.
            <span
              data-hcms-cart-count=""
              className="absolute bg-[color:var(--color-button,var(--color-interactive))] text-[color:var(--color-button-text,var(--color-interactive-text))] end-0 top-0 flex h-5 min-w-5 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1 text-xs font-medium"
            >
              {displayCount(totalQuantity)}
            </span>
          ) : null}
        </span>
      </Link>
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {liveCartCountLabel(totalQuantity)}
      </span>
    </>
  );
}

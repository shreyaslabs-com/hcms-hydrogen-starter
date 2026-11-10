import { CartPageBody } from '~/components/CartPageBody';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { RouteSlots, type RouteSlotValue } from '~/components/hcms/RouteSlots';
import { loadTemplatePage } from '~/lib/hcms/page';
import { routeMeta } from '~/lib/hcms/route-seo';

import type { Route } from './+types/cart';

const CART_SLOTS: RouteSlotValue = {
  CartPage: ({
    showDynamicCheckout,
    showDiscounts,
    showNote,
    showUpsell,
    showFreeShipping,
    showSignIn,
    installments,
    emptyState,
    layout,
  }) => (
    <CartPageBody
      showDynamicCheckout={showDynamicCheckout}
      showDiscounts={showDiscounts ?? true}
      showNote={showNote ?? false}
      showUpsell={showUpsell ?? true}
      showFreeShipping={showFreeShipping ?? true}
      showSignIn={showSignIn ?? false}
      installments={installments}
      emptyState={emptyState}
      layout={layout}
    />
  ),
};

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return routeMeta(matches, {
    template: (loaderData as { hcms?: { name: string } | null } | undefined)?.hcms?.name ?? null,
    type: 'cart',
    title: 'Cart',
    noindex: true,
  });
}

/** Theme Document `cart` template (D-22): `main-cart` renders `CartPageBody` via the adapter. */
export async function loader({ context, request }: Route.LoaderArgs) {
  const hcms = await loadTemplatePage(context, 'cart');
  return { hcms, origin: new URL(request.url).origin };
}

export default function CartRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.hcms)
    return (
      <RouteSlots value={CART_SLOTS}>
        <HcmsMainPage page={loaderData.hcms} origin={loaderData.origin} />
      </RouteSlots>
    );
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-page px-margin mx-auto w-full flex-1 py-12"
    >
      <h1 id="cart-page-title" tabIndex={-1} className="type-display text-on-surface mb-8">
        Cart
      </h1>
      <CartPageBody
        emptyState={
          <div>
            <p className="text-on-surface font-medium">Your cart is empty.</p>
            <p className="text-on-surface-secondary mt-2 text-sm">
              Looks like you haven&apos;t added anything to your cart yet.
            </p>
          </div>
        }
      />
    </main>
  );
}

/**
 * Cart conditions (T-2.170), lazy: only pages whose loader produced `if:` entries (sections or
 * blocks with a cart rule; preview badges too) load the cart watcher, so other pages ship none of
 * it. It renders nothing, so server HTML and hydration match while the chunk loads.
 */
import type { SectionCss } from '@hcms/hydrogen';
import { Suspense, lazy } from 'react';

const CartConditions = lazy(() =>
  import('./CartConditions').then((m) => ({ default: m.CartConditions })),
);

export function CartConditionsSlot({ sectionCss }: { sectionCss?: SectionCss | undefined }) {
  if (!sectionCss || !Object.keys(sectionCss).some((key) => key.startsWith('if:'))) return null;
  return (
    <Suspense fallback={null}>
      <CartConditions />
    </Suspense>
  );
}

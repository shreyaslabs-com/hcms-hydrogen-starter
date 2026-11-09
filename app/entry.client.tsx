import { startTransition, StrictMode, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import { CART_LINES_ATTRIBUTE, loadCartLines } from '~/components/cart-lines-slot';
import { PRODUCT_SECTION_TYPES, loadProductForm } from '~/components/product/product-slots';
import { planHydration, readSectionMarks } from '~/lib/hcms/deferred-hydration';
import { loadLivePreview } from '~/lib/hcms/live-preview';
import { lazySections } from '~/sections/render';

async function hydrate() {
  // Sections in the server HTML must be loaded before hydrating, or they'd suspend and
  // re-render (layout shift). The rest are fetched when idle for client navigation (T-1.8.1).
  // Theme blocks (T-2.31 cards) too; section-local block types simply have no loader, and
  // section-local blocks named like a theme block are marked `data-hcms-local` (T-2.113).
  // ADR 011: sections below the first screen (`data-hcms-defer`) are the exception: their code
  // loads after hydration (near the viewport / idle / first interaction) while React keeps their
  // server HTML. `budgets.mjs` mirrors this split.
  const preview = Boolean(document.querySelector('meta[name="hcms-preview"]'));
  const { elements, sections, looseBlockTypes } = readSectionMarks(document);
  const plan = planHydration(sections, looseBlockTypes, preview);
  const isProduct = (t: string) => PRODUCT_SECTION_TYPES.includes(t);
  lazySections?.defer(plan.deferred.flatMap((d) => d.types));
  await Promise.all([
    lazySections?.preload(plan.eager),
    plan.eager.some(isProduct) ? loadProductForm() : null,
    // Cart page with lines (D-26: the empty cart page skips the rows/summary chunk).
    document.querySelector(`[${CART_LINES_ATTRIBUTE}]`) ? loadCartLines() : null,
    // Editor preview only (T-2.106): live-edit state for the template page.
    preview ? loadLivePreview() : null,
  ]).catch(() => undefined);
  // JS needed before hydration ends here (budget checks + RUM).
  performance.mark('hcms:hydrate');
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000));
  idle(() => void lazySections?.prefetchAll().catch(() => undefined));
  idle(() => void loadCartLines().catch(() => undefined));
  // Real-user Core Web Vitals (T-2.15): loaded only when the root opted in, after hydration.
  // Busy stores sample (`data-rate` < 1): unsampled views never load the collector.
  const rumMeta = document.querySelector('meta[name="hcms-rum"]');
  const rum = rumMeta?.getAttribute('content');
  const rumRate = Number(rumMeta?.getAttribute('data-rate') ?? 1) || 1;
  if (rum && Math.random() < rumRate)
    idle(
      () =>
        void import('~/lib/rum-client')
          .then((m) => m.startRum(rum, rumRate))
          .catch(() => undefined),
    );
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
  // ADR 011 triggers (visibility, idle, first interaction): own chunk, not needed to hydrate.
  const wake = (types: string[]) => {
    if (lazySections?.release(types).some(isProduct)) void loadProductForm().catch(() => undefined);
  };
  if (plan.deferred.length)
    void import('~/lib/hcms/deferred-wake')
      .then((m) => m.wakeDeferred(window, elements, plan, wake))
      .catch(() => wake(plan.deferred.flatMap((d) => d.types)));
}

/**
 * The router, plus an effect marking the first hydration commit (ADR 011, `lazy-registry`):
 * parent effects run after the whole router tree's, so this fires once it has committed.
 * Keep ONE child under the root: the server renders a single `ServerRouter`, and React's
 * `useId` encodes sibling positions, so a second root child (the old `<HydrationCommitted />`
 * sibling) shifted every client id. React keeps server attributes on hydration (production
 * doesn't even warn), so ids looked up from the client (`getElementById`, `aria-*` written
 * after hydration) pointed nowhere — e.g. phone gallery thumbnails didn't scroll the slider.
 * Guarded by `__test__/entry-client-ids.test.ts`.
 */
function App() {
  useEffect(() => lazySections?.hydrated(), []);
  return <HydratedRouter />;
}

if (!window.location.origin.includes('webcache.googleusercontent.com')) void hydrate();

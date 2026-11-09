/**
 * A/B exposure + order attribution (T-3.5). Renders nothing.
 * - Exposure: when the page renders an experiment's template (`<meta name="hcms-template">`),
 *   the arm is remembered for the browser session; with analytics consent, one beacon per
 *   session and experiment goes to `/__hcms/ab`.
 * - Attribution: once a cart exists, the seen arms are merged into the cart attribute
 *   `_hcms_exp` via Standard Actions `updateCart` (the full attribute set is resent, since
 *   `cartAttributesUpdate` replaces it). Shopify copies cart attributes onto the order.
 */
import {
  EXPERIMENT_CART_ATTRIBUTE,
  exposedOn,
  formatAssignments,
  mergeAssignments,
  parseAssignments,
  useConsent,
  type Assignments,
  type ClientExperiment,
} from '@hcms/hydrogen';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { useCart } from '~/lib/cart';

const SEEN = 'hcms:ab';
const SENT = 'hcms:ab:sent';

function read(key: string): Assignments {
  try {
    return parseAssignments(sessionStorage.getItem(key));
  } catch {
    return {};
  }
}
function write(key: string, value: Assignments) {
  try {
    sessionStorage.setItem(key, formatAssignments(value));
  } catch {
    // Storage blocked: exposure is just reported again next page.
  }
}

export function ExperimentTracker({
  experiments,
  beacon,
}: {
  experiments: ClientExperiment[];
  beacon: string | null;
}) {
  const { pathname } = useLocation();
  const consent = useConsent();
  const [seen, setSeen] = useState<Assignments>({});
  const cartId = useCart((state) => state.data.id);
  const attributes = useCart((state) => state.data.attributes);
  const ready = useCart(
    (state) => !state.loading && !('readyPromise' in state && state.readyPromise),
  );

  useEffect(() => {
    if (!experiments.length) return;
    const template = document.querySelector('meta[name="hcms-template"]')?.getAttribute('content');
    const all = read(SEEN);
    for (const hit of exposedOn(experiments, template)) all[hit.id] = hit.variant;
    // Only experiments still running for this visitor (the root lists them).
    const current = Object.fromEntries(
      experiments.filter((e) => all[e.id] === e.variant).map((e) => [e.id, e.variant]),
    );
    write(SEEN, current);
    setSeen(current);
    if (!beacon || !consent.analytics) return;
    const sent = read(SENT);
    const fresh = Object.fromEntries(Object.entries(current).filter(([id, v]) => sent[id] !== v));
    if (!Object.keys(fresh).length) return;
    if (navigator.sendBeacon?.(beacon, JSON.stringify({ exp: formatAssignments(fresh) })))
      write(SENT, { ...sent, ...fresh });
  }, [pathname, experiments, beacon, consent.analytics]);

  const existing = attributes?.find((a) => a.key === EXPERIMENT_CART_ATTRIBUTE)?.value ?? null;
  useEffect(() => {
    if (!cartId || !ready || !Object.keys(seen).length) return;
    const tagged = parseAssignments(existing);
    if (Object.entries(seen).every(([id, v]) => tagged[id] === v)) return;
    const updateCart = window.Shopify?.actions?.updateCart;
    if (!updateCart || updateCart.isDefault()) return;
    const others = (attributes ?? [])
      .filter((a) => a.key !== EXPERIMENT_CART_ATTRIBUTE)
      .map((a) => ({ key: a.key, value: a.value ?? '' }));
    void updateCart(
      {
        attributes: [
          ...others,
          { key: EXPERIMENT_CART_ATTRIBUTE, value: mergeAssignments(existing, seen) },
        ],
      },
      { event: { context: 'cart' } },
    ).catch(() => undefined);
    // `attributes` identity changes with every cart update; `existing` carries what matters.
  }, [cartId, ready, existing, seen]);

  return null;
}

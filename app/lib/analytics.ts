/**
 * Storefront analytics bus for sections and adapters (T-1.1.12). Shopify's bus
 * (`window.Shopify.analytics`, created by `ShopifyScripts`) already sends page/product/collection/
 * search views and add-to-cart to Shopify (Online Store reports, Customer Events). Adapters
 * (Klaviyo, Judge.me… T-2.8) subscribe here: ONE Hydrogen destination fans events out, so
 * delivery stays consent-gated (Customer Privacy) and replays after consent.
 */
import type { HcmsAnalytics } from '@hcms/hydrogen';
import { AnalyticsEvent } from '@shopify/hydrogen';

type Handler = (payload: unknown) => void;
type Bus = {
  publish: (event: never, payload?: never) => void;
  addDestination?: (destination: {
    name: string;
    setup: (api: { subscribe: (event: never, handler: Handler) => unknown }) => unknown;
  }) => unknown;
};

const listeners = new Map<string, Set<Handler>>();
let registered = false;

function bus(): Bus | null {
  if (typeof window === 'undefined') return null;
  return ((window as { Shopify?: { analytics?: Bus } }).Shopify?.analytics ?? null) as Bus | null;
}

/** Standard events adapters can subscribe to (custom events: listeners only, see publish). */
export const STANDARD_EVENTS: readonly string[] = Object.values(AnalyticsEvent);

function dispatch(event: string, payload: unknown) {
  for (const handler of listeners.get(event) ?? []) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[hcms analytics] ${event} handler failed`, error);
    }
  }
}

function ensureDestination(): void {
  const analytics = bus();
  if (registered || !analytics?.addDestination) return;
  registered = true;
  analytics.addDestination({
    name: 'hcms-adapters',
    setup: ({ subscribe }) => {
      for (const event of STANDARD_EVENTS)
        subscribe(event as never, (payload) => dispatch(event, payload));
    },
  });
}

export const hcmsAnalytics: HcmsAnalytics = {
  publish(event, payload) {
    const analytics = bus();
    if (!analytics) return;
    if (STANDARD_EVENTS.includes(event)) analytics.publish(event as never, payload as never);
    // Custom (non-Shopify) events never reach Shopify; only HCMS adapters see them.
    else dispatch(event, payload);
  },
  subscribe(event, handler) {
    let set = listeners.get(event);
    if (!set) listeners.set(event, (set = new Set()));
    set.add(handler);
    ensureDestination();
    return () => {
      set.delete(handler);
    };
  },
};

/** Test hook. */
export function resetAnalyticsForTests() {
  listeners.clear();
  registered = false;
}

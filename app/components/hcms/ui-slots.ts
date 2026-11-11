/**
 * Optional UI slots (JS budget, Nov 11): video + 3D media (adapter `Video`, `ExternalVideo`,
 * `ModelViewer`), the country selector (adapter `LocaleSelector`, fallback footer), the
 * geolocation banner and the app's error pages (404 / route error) left the root chunk, so pages
 * that show none of them never download that code. Same pattern as the product form (`product/product-slots.ts`): the server loads every
 * slot before rendering (`entry.server.tsx`); `entry.client.tsx` preloads a slot before hydrating
 * when its marker (`SLOT_ATTRIBUTE="<slot>"` on the component's root element) sits outside every
 * deferred section; `budgets.mjs` mirrors the rule (`SLOT_CHUNKS`).
 * Each slot renders inside its own `<Suspense fallback={null}>` on both sides, so one that still
 * has to load (a deferred section waking, the editor adding a video, a slideshow video mounting
 * after hydration) keeps the server HTML (or just its own spot) instead of suspending the section.
 */
import { Suspense, createElement, use, type ComponentType } from 'react';

import type * as Media from './HcmsMedia';
import type * as ErrorPages from '~/components/ErrorPages';
import type * as Locale from '~/components/LocaleSwitcher';
import type * as Geo from '~/components/MarketSuggestionBanner';

/** Marks a slot component's root element: `data-hcms-slot="media" | "locale" | "geo" | "error"`. */
export const SLOT_ATTRIBUTE = 'data-hcms-slot';

type Modules = {
  media: typeof Media;
  locale: typeof Locale;
  geo: typeof Geo;
  error: typeof ErrorPages;
};
export type SlotName = keyof Modules;

const importers: { [S in SlotName]: () => Promise<Modules[S]> } = {
  media: () => import('./HcmsMedia'),
  locale: () => import('~/components/LocaleSwitcher'),
  geo: () => import('~/components/MarketSuggestionBanner'),
  error: () => import('~/components/ErrorPages'),
};

export const SLOT_NAMES = Object.keys(importers) as SlotName[];

const loaded = new Map<SlotName, unknown>();
const pending = new Map<SlotName, Promise<unknown>>();

export function loadSlot<S extends SlotName>(slot: S): Promise<Modules[S]> {
  let promise = pending.get(slot);
  if (!promise) {
    promise = importers[slot]().then((m) => {
      loaded.set(slot, m);
      return m;
    });
    pending.set(slot, promise);
  }
  return promise as Promise<Modules[S]>;
}

export const loadSlots = () => Promise.all(SLOT_NAMES.map(loadSlot));

type Props = Record<string, unknown>;

function Loaded({ slot, name, props }: { slot: SlotName; name: string; props: Props }) {
  const mod = (loaded.get(slot) ?? use(loadSlot(slot))) as Record<string, ComponentType>;
  return createElement(mod[name] as ComponentType<Props>, props);
}

/** A component of a slot module (same props), rendered once the module is loaded. */
function slotComponent<S extends SlotName, K extends keyof Modules[S] & string>(slot: S, name: K) {
  type P = Modules[S][K] extends ComponentType<infer Q> ? Q : never;
  return function Slot(props: P) {
    return createElement(
      Suspense,
      { fallback: null },
      createElement(Loaded, { slot, name, props: props as Props }),
    );
  };
}

export const HcmsVideoSlot = slotComponent('media', 'HcmsVideo');
export const ExternalVideoSlot = slotComponent('media', 'ExternalVideo');
export const ModelViewerSlot = slotComponent('media', 'ModelViewer');
export const LocaleSwitcherSlot = slotComponent('locale', 'LocaleSwitcher');
export const MarketSuggestionSlot = slotComponent('geo', 'MarketSuggestionBanner');
export const NotFoundSlot = slotComponent('error', 'NotFound');
export const RouteErrorMessageSlot = slotComponent('error', 'RouteErrorMessage');

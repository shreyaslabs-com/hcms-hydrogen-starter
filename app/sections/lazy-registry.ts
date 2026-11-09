/**
 * Client render registry (T-1.8.1 JS budget): official sections and theme blocks (T-2.31 cards)
 * load per page instead of all in the entry chunk. `entry.client.tsx` preloads the section and
 * block types present in the server HTML BEFORE hydrating (`preload`), so hydration never
 * suspends (no CLS); the rest are prefetched when idle for client-side navigation. Not-yet-loaded
 * ones suspend (`use`) inside the SDK's per-section / per-block `<Suspense>`.
 *
 * ADR 011: types that only appear in below-the-fold sections (`data-hcms-defer`) are `defer`red
 * instead: during hydration they suspend on a gate, so React keeps their server HTML untouched,
 * until `entry.client` `release`s them (near the viewport, first interaction, load + idle). After
 * the first commit (`hydrated()`), a render that reaches a gated type releases it at once: an
 * update arriving at a still-dehydrated section loads its code instead of waiting for a trigger
 * (waiting there made React drop the server HTML in e2e). The `hcms:defer:<type>` marks show which
 * path released each type.
 */
import type {
  BlockComponentProps,
  BlockDefinition,
  Registry,
  SectionComponentProps,
  SectionDefinition,
} from '@hcms/hydrogen';
import type { BlockLoader, SectionLoader } from '@hcms/sections/lazy';
import { createElement, use, type ComponentType } from 'react';

type Loader<T> = { load: () => Promise<T> };
/** ADR 011: the registry's gate for a deferred type (null = render it now). */
type Wait = (type: string) => Promise<void> | null;

/**
 * Stands in for a query whose code stays on the server (loader `query` flag). The browser never
 * runs queries; live preview only tests `query` for presence.
 */
const HAS_QUERY = () => null;

/** Load-once cache for one kind (sections or blocks). */
function lazyKind<T extends { component: unknown }>(
  loaders: Readonly<Record<string, Loader<T>>>,
  label: string,
  wait: Wait,
) {
  const loaded = new Map<string, T>();
  const pending = new Map<string, Promise<T>>();
  const load = (type: string): Promise<T> | null => {
    const loader = loaders[type];
    if (!loader) return null;
    let promise = pending.get(type);
    if (!promise) {
      promise = loader.load().then((def) => {
        loaded.set(type, def);
        return def;
      });
      pending.set(type, promise);
    }
    return promise;
  };
  const component = <P extends object>(type: string): ComponentType<P> => {
    function Lazy(props: P) {
      const gate = loaded.has(type) ? null : wait(type);
      if (gate) use(gate);
      const def = loaded.get(type) ?? use(load(type) as Promise<T>);
      return createElement(def.component as unknown as ComponentType<P>, props);
    }
    Lazy.displayName = `${label}(${type})`;
    return Lazy;
  };
  return {
    load,
    component,
    loaded: (type: string) => loaded.get(type),
    types: () => Object.keys(loaders),
  };
}

export function createLazyRegistry(
  loaders: Readonly<Record<string, SectionLoader>>,
  blockLoaders: Readonly<Record<string, BlockLoader>> = {},
) {
  /** ADR 011 gates per deferred type (sections and blocks alike). */
  const gates = new Map<string, { promise: Promise<void>; open: () => void }>();
  /** Opens a type's gate (React retries the waiting boundaries, which loads the code). */
  const release = (type: string): boolean => {
    const gate = gates.get(type);
    if (!gate) return false;
    gates.delete(type);
    gate.open();
    // RUM / devtools: when each deferred type started loading (trigger or update).
    globalThis.performance?.mark(`hcms:defer:${type}`);
    return true;
  };
  let hydrated = false;
  const wait: Wait = (type) => {
    // After the first commit, a render reaching a gated type (an update, or React getting to a
    // nested boundary late) loads it at once: waiting for a trigger there can blink the section.
    if (hydrated) release(type);
    return gates.get(type)?.promise ?? null;
  };
  const sections = lazyKind<SectionDefinition>(loaders, 'LazySection', wait);
  const blocks = lazyKind<BlockDefinition>(blockLoaders, 'LazyBlock', wait);
  const sectionDefs = new Map<string, SectionDefinition>();
  const blockDefs = new Map<string, BlockDefinition>();

  const registry: Registry = {
    getSection(type) {
      const loader = loaders[type];
      if (!loader) return undefined;
      let def = sectionDefs.get(type);
      if (!def) {
        def = {
          type,
          name: type,
          // Official loaders carry the wrapper meta; custom ones (`./custom`) read it from the
          // module, which `preload` has fetched before hydration.
          get tag() {
            return loader.tag ?? sections.loaded(type)?.tag;
          },
          get class() {
            return loader.class ?? sections.loaded(type)?.class;
          },
          // ADR 011 marker must match the server's (custom sections: from the loaded module).
          get hydrate() {
            return loader.hydrate ?? sections.loaded(type)?.hydrate;
          },
          component: sections.component<SectionComponentProps>(type),
          // Live preview only checks whether a type has a `query` (an edit then refetches it on
          // the server): official browser halves leave the code out and the loader flags it.
          get query() {
            return sections.loaded(type)?.query ?? (loader.query ? HAS_QUERY : undefined);
          },
        } as unknown as SectionDefinition;
        sectionDefs.set(type, def);
      }
      return def;
    },
    getBlock(type) {
      const loader = blockLoaders[type];
      if (!loader) return undefined;
      let def = blockDefs.get(type);
      if (!def) {
        def = {
          type,
          name: type,
          component: blocks.component<BlockComponentProps>(type),
          get query() {
            return blocks.loaded(type)?.query ?? (loader.query ? HAS_QUERY : undefined);
          },
        } as unknown as BlockDefinition;
        blockDefs.set(type, def);
      }
      return def;
    },
    sectionTypes: sections.types,
    blockTypes: blocks.types,
    manifest: () => {
      throw new Error('The client registry has no manifest; use the server registry');
    },
  };

  return {
    registry,
    /** Loads these section / block types (unknown ones are ignored). */
    preload: (types: Iterable<string>) =>
      Promise.all(
        [...new Set(types)].flatMap((t) => [sections.load(t), blocks.load(t)]).filter(Boolean),
      ),
    /**
     * ADR 011: these types (only in below-the-fold sections, never preloaded) wait for `release`
     * while hydrating. Call before hydrating.
     */
    defer: (types: Iterable<string>) => {
      for (const t of types) {
        let open = () => {};
        const promise = new Promise<void>((resolve) => (open = resolve));
        if (!gates.has(t)) gates.set(t, { promise, open });
      }
    },
    /** Opens the gates of these types (their code loads now); returns the ones it opened. */
    release: (types: Iterable<string>): string[] => [...new Set(types)].filter(release),
    /** First hydration committed (see `wait`). */
    hydrated: () => {
      hydrated = true;
    },
    /** Everything else, for client-side navigation. */
    prefetchAll: () =>
      Promise.all([
        ...sections.types().map((t) => sections.load(t)),
        ...blocks.types().map((t) => blocks.load(t)),
      ]),
  };
}

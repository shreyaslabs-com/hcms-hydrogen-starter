/**
 * Live preview state (`@hcms/hydrogen/live`, T-1.2.8) is editor-preview only, so it stays out of
 * the storefront's JS (T-2.106: ~2.5 KB gz with the edit protocol). Template pages render
 * `<meta name="hcms-preview">` in preview; `entry.client.tsx` then loads this BEFORE hydrating,
 * so hydration never suspends. Client navigation in preview suspends (a transition) until loaded.
 */
import type * as Live from '@hcms/hydrogen/live';

type Module = typeof Live;

let mod: Module | null = null;
let pending: Promise<Module> | null = null;

export function loadLivePreview(): Promise<Module> {
  pending ??= import('@hcms/hydrogen/live').then((m) => (mod = m));
  return pending;
}

/** The loaded module, or null (then `use(loadLivePreview())`). */
export const livePreview = (): Module | null => mod;

// The server renders preview pages too: have it ready before the first one.
if (import.meta.env.SSR) void loadLivePreview();

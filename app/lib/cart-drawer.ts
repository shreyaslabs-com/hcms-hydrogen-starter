export const CART_DRAWER_ID = 'cart-drawer';
export const MOBILE_NAV_DRAWER_ID = 'mobile-nav-drawer';
export const SEARCH_DRAWER_ID = 'search-drawer';

let openCartActionConfigured = false;
let openCartActionRetryQueued = false;

function getDialog(id: string): HTMLDialogElement | null {
  if (typeof document === 'undefined' || typeof HTMLDialogElement === 'undefined') return null;
  const dialog = document.getElementById(id);
  return dialog instanceof HTMLDialogElement ? dialog : null;
}

function supportsDialogCommands(): boolean {
  if (typeof HTMLButtonElement === 'undefined') return false;
  return (
    'command' in HTMLButtonElement.prototype && 'commandForElement' in HTMLButtonElement.prototype
  );
}

export function openDialog(id: string): void {
  const dialog = getDialog(id);
  if (!dialog || dialog.open) return;
  dialog.showModal();
}

export function closeDialog(id: string): void {
  getDialog(id)?.close();
}

export function openCartDrawer(): void {
  openDialog(CART_DRAWER_ID);
}

export function closeCartDrawer(): void {
  closeDialog(CART_DRAWER_ID);
}

export function openMobileNavDrawer(): void {
  openDialog(MOBILE_NAV_DRAWER_ID);
}

export function closeMobileNavDrawer(): void {
  closeDialog(MOBILE_NAV_DRAWER_ID);
}

export function closeSearchDrawer(): void {
  closeDialog(SEARCH_DRAWER_ID);
}

export function openDialogFallback(id: string): void {
  if (supportsDialogCommands()) return;
  openDialog(id);
}

type LinkClick = Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'> & {
  preventDefault(): void;
};

// Only a plain left click on an existing dialog is intercepted, so the href
// still works without JavaScript and for open-in-new-tab clicks.
export function openDialogFromLinkClick(event: LinkClick, id: string): void {
  const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (event.button !== 0 || isModifiedClick) return;
  if (!getDialog(id)) return;
  event.preventDefault();
  openDialog(id);
}

/**
 * Early cart clicks (SF-22). The drawer mounts after hydration + idle (`Deferred`, JS budget), so
 * a click on the cart icon before that used to navigate to `/cart`. Now the click is held: the
 * drawer opens as soon as it mounts, and if that takes longer than `CART_OPEN_FALLBACK_MS` (slow
 * device/network, JS failed) the link's `/cart` page loads as before. Before hydration the inline
 * `EARLY_CART_CLICK_SCRIPT` (root, nonce) does the same for `[data-cart-drawer-trigger]` links.
 * Shared state: `window.__hcmsCartOpen`; `CART_OPEN_EVENT` asks the root `Deferred` to mount now.
 */
export const CART_OPEN_FALLBACK_MS = 2000;
export const CART_OPEN_EVENT = 'hcms:cart-open-request';
export const CART_DRAWER_TRIGGER = 'data-cart-drawer-trigger';

type PendingOpen = { timer: ReturnType<typeof setTimeout> };
type PendingWindow = { __hcmsCartOpen?: PendingOpen };

const pendingWindow = () =>
  typeof window === 'undefined' ? null : (window as unknown as PendingWindow);

export const EARLY_CART_CLICK_SCRIPT = `document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('[${CART_DRAWER_TRIGGER}]');if(!a||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.defaultPrevented||window.__hcmsCartOpen||document.getElementById('${CART_DRAWER_ID}'))return;e.preventDefault();window.__hcmsCartOpen={timer:setTimeout(function(){location.assign(a.href)},${CART_OPEN_FALLBACK_MS})};dispatchEvent(new Event('${CART_OPEN_EVENT}'))},true)`;

/** Cart icon click (drawer cart type): open the drawer, or hold the click until it mounts. */
export function requestCartDrawer(event: LinkClick, href: string): void {
  const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (event.button !== 0 || isModifiedClick) return;
  event.preventDefault();
  if (getDialog(CART_DRAWER_ID)) {
    openCartDrawer();
    return;
  }
  const win = pendingWindow();
  if (!win || win.__hcmsCartOpen) return;
  win.__hcmsCartOpen = {
    timer: setTimeout(() => window.location.assign(href), CART_OPEN_FALLBACK_MS),
  };
  window.dispatchEvent(new Event(CART_OPEN_EVENT));
}

/** True while an early cart click waits for the drawer. */
export function cartOpenPending(): boolean {
  return Boolean(pendingWindow()?.__hcmsCartOpen);
}

/** The drawer mounted: open it for a held click (and cancel the `/cart` fallback). */
export function consumePendingCartOpen(): void {
  const win = pendingWindow();
  const pending = win?.__hcmsCartOpen;
  if (!win || !pending) return;
  clearTimeout(pending.timer);
  delete win.__hcmsCartOpen;
  openCartDrawer();
}

function configureOpenCartActionNow(): boolean {
  const openCart = typeof window !== 'undefined' ? window.Shopify?.actions?.openCart : undefined;
  if (!openCart) return false;

  openCart.configure({
    handler: async () => openCartDrawer(),
  });
  openCartActionConfigured = true;
  return true;
}

export function configureOpenCartAction(): void {
  if (typeof document === 'undefined' || openCartActionConfigured) return;
  if (configureOpenCartActionNow()) return;
  if (openCartActionRetryQueued || document.readyState !== 'loading') return;

  openCartActionRetryQueued = true;
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      openCartActionRetryQueued = false;
      configureOpenCartAction();
    },
    { once: true },
  );
}

configureOpenCartAction();

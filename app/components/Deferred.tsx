import { Suspense, useEffect, useState, type ReactNode } from 'react';

import { cartOpenPending } from '~/lib/cart-drawer';

/**
 * Mounts `children` after hydration, when the browser is idle (≤ `timeout` ms). For UI that is
 * closed on load (cart/search drawers): their code leaves the initial JS (T-1.8.1 budget). Links
 * that open them fall back to their pages until then. `idle={false}` mounts right after hydration
 * (code that renders nothing on the server but shouldn't wait, e.g. embed scripts, upsell fetch).
 * `wakeOn`: a window event that mounts at once (an early cart click, SF-22; also when that click
 * happened before hydration).
 */
export function Deferred({
  children,
  timeout = 1500,
  idle = true,
  wakeOn,
}: {
  children: ReactNode;
  timeout?: number;
  idle?: boolean;
  wakeOn?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!idle || (wakeOn && cartOpenPending())) {
      setReady(true);
      return;
    }
    const wake = () => setReady(true);
    if (wakeOn) window.addEventListener(wakeOn, wake, { once: true });
    const cleanupWake = () => {
      if (wakeOn) window.removeEventListener(wakeOn, wake);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(wake, { timeout });
      return () => {
        window.cancelIdleCallback(id);
        cleanupWake();
      };
    }
    const id = window.setTimeout(wake, 200);
    return () => {
      window.clearTimeout(id);
      cleanupWake();
    };
  }, [timeout, idle, wakeOn]);
  return ready ? <Suspense fallback={null}>{children}</Suspense> : null;
}

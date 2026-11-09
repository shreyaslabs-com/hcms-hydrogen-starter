/**
 * ADR 011 triggers for deferred sections: a small chunk `entry.client` imports as soon as it
 * starts hydrating (nothing here is needed to hydrate). A visibility-deferred section wakes when
 * it nears the viewport (~1 screen); everything wakes on the first interaction or once the page
 * has loaded and the browser is idle. `wake` is idempotent (types already released are skipped).
 */
import type { HydrationPlan } from './deferred-hydration';

export function wakeDeferred(
  win: Window,
  elements: readonly Element[],
  plan: HydrationPlan,
  wake: (types: string[]) => void,
): void {
  const byElement = new Map<Element, string[]>();
  for (const d of plan.deferred) {
    const el = elements[d.index];
    if (el && !d.idle) byElement.set(el, d.types);
  }
  const observer =
    byElement.size && 'IntersectionObserver' in win
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              observer?.unobserve(entry.target);
              wake(byElement.get(entry.target) ?? []);
            }
          },
          { rootMargin: '100% 0px' },
        )
      : null;
  for (const el of byElement.keys()) observer?.observe(el);
  const all = () => {
    observer?.disconnect();
    for (const event of INTERACTIONS) win.removeEventListener(event, all, true);
    wake(plan.deferred.flatMap((d) => d.types));
  };
  // First interaction (capture: before React's root listeners see the event).
  for (const event of INTERACTIONS)
    win.addEventListener(event, all, { capture: true, passive: true });
  holdEarlyClicks(win, all);
  const idle = () =>
    (win.requestIdleCallback ?? ((cb: () => void) => win.setTimeout(cb, 2000)))(all);
  if (win.document.readyState === 'complete') idle();
  else win.addEventListener('load', idle, { once: true });
}

const INTERACTIONS = ['pointerdown', 'keydown', 'touchstart', 'focusin'];

/** React marks every hydrated element with internal keys; a dehydrated one has none. */
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith('__reactFiber'));

/**
 * A click inside a deferred section that hasn't hydrated yet would run the no-JS behaviour (a tab
 * that is a link navigates away). Hold it (capture phase), wake everything, and click again once
 * React owns the section's content (or after 5 s, natively).
 */
function holdEarlyClicks(win: Window, wakeAll: () => void): void {
  let replaying = false;
  win.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (replaying || !(target instanceof Element)) return;
      // The section element hydrates at once; its content root is the deferred boundary.
      const root = target.closest('[data-hcms-defer]')?.firstElementChild;
      if (!root || hydrated(root)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      wakeAll();
      const started = win.performance.now();
      const replay = () => {
        if (!hydrated(root) && root.isConnected && win.performance.now() - started < 5000)
          return void win.requestAnimationFrame(replay);
        replaying = true;
        (target as HTMLElement).click();
        replaying = false;
      };
      replay();
    },
    true,
  );
}

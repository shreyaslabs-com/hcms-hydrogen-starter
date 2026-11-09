/**
 * Core Web Vitals collector (T-2.15), loaded after hydration when the browser is idle and only
 * when the root marks the page with `<meta name="hcms-rum">` (HCMS API configured, not the editor
 * preview). Measures this page load like CrUX does — LCP, CLS (largest session window) and INP
 * (approximate p98 of interactions) — and sends one beacon when the page is hidden, only if the
 * shopper allowed analytics (Shopify Customer Privacy API). No identifiers, no URLs.
 * Automated browsers (WebDriver, headless, Lighthouse/PageSpeed, WebPageTest, crawlers) are
 * skipped. `rate` = the share of views sampled (entry.client decided); sent so the admin can
 * weight the counts.
 */
import { isAutomatedBrowser } from './hcms/automation.ts';

type ShopifyPrivacy = { customerPrivacy?: { analyticsProcessingAllowed?: () => boolean } };

type LayoutShift = PerformanceEntry & { value: number; hadRecentInput: boolean };
type EventTiming = PerformanceEntry & { interactionId?: number; duration: number };

function observe(type: string, callback: (entries: PerformanceEntryList) => void, extra = {}) {
  try {
    const observer = new PerformanceObserver((list) => callback(list.getEntries()));
    observer.observe({ type, buffered: true, ...extra });
    return observer;
  } catch {
    return null; // unsupported entry type (e.g. Safari has no `event`/`layout-shift`)
  }
}

export function startRum(endpoint: string, rate = 1): void {
  if (typeof PerformanceObserver === 'undefined' || !navigator.sendBeacon) return;
  if (isAutomatedBrowser(navigator)) return;
  const template =
    document.querySelector('meta[name="hcms-template"]')?.getAttribute('content') ?? '-';
  let lcp: number | undefined;
  let cls = 0;
  let windowValue = 0;
  let windowStart = 0;
  let windowLast = 0;
  const interactions = new Map<number, number>();

  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1];
    if (last) lcp = last.startTime;
  });
  observe('layout-shift', (entries) => {
    for (const entry of entries as LayoutShift[]) {
      if (entry.hadRecentInput) continue;
      // Session windows: shifts < 1 s apart, window ≤ 5 s; CLS = the largest window.
      if (
        windowValue &&
        entry.startTime - windowLast < 1000 &&
        entry.startTime - windowStart < 5000
      ) {
        windowValue += entry.value;
      } else {
        windowValue = entry.value;
        windowStart = entry.startTime;
      }
      windowLast = entry.startTime;
      cls = Math.max(cls, windowValue);
    }
  });
  observe(
    'event',
    (entries) => {
      for (const entry of entries as EventTiming[]) {
        if (!entry.interactionId) continue;
        interactions.set(
          entry.interactionId,
          Math.max(interactions.get(entry.interactionId) ?? 0, entry.duration),
        );
      }
    },
    { durationThreshold: 40 },
  );

  let sent = false;
  const send = () => {
    if (sent || document.visibilityState !== 'hidden') return;
    sent = true;
    const consent = (window as unknown as { Shopify?: ShopifyPrivacy }).Shopify?.customerPrivacy;
    if (!consent?.analyticsProcessingAllowed?.()) return;
    const durations = [...interactions.values()].sort((a, b) => b - a);
    const inp = durations.length
      ? durations[Math.min(Math.floor(durations.length / 50), durations.length - 1)]
      : undefined;
    const metrics: Record<string, number> = { CLS: Math.round(cls * 1000) / 1000 };
    if (lcp !== undefined) metrics.LCP = Math.round(lcp);
    if (inp !== undefined) metrics.INP = Math.round(inp);
    navigator.sendBeacon(
      endpoint,
      new Blob(
        [
          JSON.stringify({
            template,
            device: window.matchMedia('(max-width: 47.99rem)').matches ? 'mobile' : 'desktop',
            metrics,
            rate,
          }),
        ],
        { type: 'application/json' },
      ),
    );
  };
  document.addEventListener('visibilitychange', send);
  window.addEventListener('pagehide', send);
}

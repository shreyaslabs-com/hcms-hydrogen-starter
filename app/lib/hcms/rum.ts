/**
 * Core Web Vitals beacon endpoint (T-2.15): `POST /__hcms/rum` gets one page view's LCP / CLS /
 * INP from `lib/rum-client.ts`, keeps only plausible numbers, and forwards them HMAC-signed to the
 * HCMS admin (`/api/storefront/rum`) in the background. Always answers 204 at once, so beacons
 * never wait on the admin. Pure module so `node:test` can load it.
 *
 * Sampling: the admin answers each forward with the store's sample rate (1 = every view; busy
 * stores get 1/2, 1/3 … down to 1/100). We keep the latest one per isolate and the root loader
 * hands it to the browser (`<meta name="hcms-rum" data-rate>`), so no extra request is made. Each
 * beacon carries the rate it was sampled at; the admin weights its counts by 1/rate.
 */
import { isAutomatedAgent } from './automation.ts';
import { sign, type FormEnv } from './forms.ts';

const METRICS = ['LCP', 'CLS', 'INP'] as const;
const TEMPLATE = /^[a-z0-9_]+(\/[a-z_]+)?(\.[a-z0-9_-]+)?$/;
const MAX_BODY = 1000;
export const MIN_RATE = 0.01;

let currentRate = 1;
/** The store's RUM sample rate as last told by the admin (1 until the first answer). */
export const rumSampleRate = (): number => currentRate;
/** Test hook: reset the per-isolate rate. */
export const setRumSampleRate = (rate: number): void => {
  currentRate = cleanRate(rate);
};

/** A sample rate in [0.01, 1]; anything else counts as 1 (every view). */
export function cleanRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_RATE && value <= 1
    ? value
    : 1;
}

export type RumBeacon = {
  template: string;
  device: 'mobile' | 'desktop';
  metrics: Partial<Record<(typeof METRICS)[number], number>>;
  /** Share of views the browser kept (1 = all). */
  rate: number;
};

/** Parses a beacon body; null when it's not one. */
export function parseBeacon(raw: string): RumBeacon | null {
  if (raw.length > MAX_BODY) return null;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const metrics: RumBeacon['metrics'] = {};
  const raw_ = (body.metrics ?? {}) as Record<string, unknown>;
  for (const m of METRICS) {
    const v = raw_[m];
    const max = m === 'CLS' ? 10 : 60_000;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max)
      metrics[m] = Math.round(v * (m === 'CLS' ? 1000 : 1)) / (m === 'CLS' ? 1000 : 1);
  }
  if (!Object.keys(metrics).length) return null;
  return {
    template:
      typeof body.template === 'string' && TEMPLATE.test(body.template) ? body.template : '-',
    device: body.device === 'desktop' ? 'desktop' : 'mobile',
    metrics,
    rate: cleanRate(body.rate),
  };
}

export async function handleRumBeacon(
  request: Request,
  env: FormEnv,
  waitUntil: (promise: Promise<unknown>) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const done = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const api = env.HCMS_API_URL;
  const secret = env.HCMS_PREVIEW_SECRET;
  const shop = env.PUBLIC_STORE_DOMAIN;
  if (!api || !secret || !shop) return done;
  // Automated visits (Lighthouse, headless browsers, crawlers) never count as real shoppers.
  if (isAutomatedAgent(request.headers.get('User-Agent'))) return done;
  const beacon = parseBeacon(await request.text().catch(() => ''));
  if (!beacon) return done;
  const payload = JSON.stringify({
    shop,
    kind: 'rum',
    ts: Math.floor(Date.now() / 1000),
    ...beacon,
  });
  waitUntil(
    (async () => {
      const res = await fetchImpl(`${api.replace(/\/+$/, '')}/api/storefront/rum`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HCMS-Shop': shop,
          'X-HCMS-Signature': await sign(secret, payload),
        },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return;
      const answer = (await res.json()) as { rate?: unknown } | null;
      if (answer && 'rate' in answer) currentRate = cleanRate(answer.rate);
    })().catch(() => undefined),
  );
  return done;
}

/**
 * A/B exposure beacons (T-3.5): `POST /__hcms/ab` gets `{exp: "exp_x:b,exp_y:control"}` from the
 * browser (once per session and experiment, analytics consent only, `components/ExperimentTracker`)
 * and forwards it HMAC-signed to the HCMS admin (`/api/storefront/experiments`) in the background.
 * Always answers 204 at once. Pure module so `node:test` can load it.
 */
import { sign, type FormEnv } from './forms.ts';

const PAIR = /^exp_[a-z0-9]{6,24}:[a-z0-9_]{1,16}$/;
const MAX_BODY = 1000;
const MAX_PAIRS = 10;

/** Body → cleaned `exp` value, or null when there's nothing valid. */
export function parseExposureBeacon(raw: string): string | null {
  if (raw.length > MAX_BODY) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  const exp = (body as { exp?: unknown } | null)?.exp;
  if (typeof exp !== 'string') return null;
  const pairs = exp
    .split(',')
    .map((p) => p.trim())
    .filter((p) => PAIR.test(p))
    .slice(0, MAX_PAIRS);
  return pairs.length ? pairs.join(',') : null;
}

export async function handleExposureBeacon(
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
  const exp = parseExposureBeacon(await request.text().catch(() => ''));
  if (!exp) return done;
  const payload = JSON.stringify({ shop, kind: 'ab', ts: Math.floor(Date.now() / 1000), exp });
  waitUntil(
    (async () => {
      await fetchImpl(`${api.replace(/\/+$/, '')}/api/storefront/experiments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HCMS-Shop': shop,
          'X-HCMS-Signature': await sign(secret, payload),
        },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });
    })().catch(() => undefined),
  );
  return done;
}

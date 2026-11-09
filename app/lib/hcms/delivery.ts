/**
 * Pincode delivery check, Shiprocket provider (T-2.82), pure + injected `fetch`. Server-only:
 * `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` (an API user) never reach the browser; the block
 * calls `/__hcms/delivery?pincode=` and gets `DeliveryAnswer` JSON. Display only: nothing here
 * touches checkout. Shiprocket: `POST /v1/external/auth/login` → token (10 days), then
 * `GET /v1/external/courier/serviceability/` → `data.available_courier_companies[]`
 * (`estimated_delivery_days`, `cod`). Any failure = `unavailable` (the block falls back to its
 * own estimate).
 */
export type DeliveryAnswer =
  | { status: 'ok'; min: number; max: number; cod?: boolean }
  | { status: 'unserviceable' }
  | { status: 'unavailable' };

export type ShiprocketEnv = {
  SHIPROCKET_EMAIL?: string | undefined;
  SHIPROCKET_PASSWORD?: string | undefined;
  SHIPROCKET_PICKUP_PINCODE?: string | undefined;
  SHIPROCKET_WEIGHT_KG?: string | undefined;
};

const BASE = 'https://apiv2.shiprocket.in/v1/external';
const PINCODE = /^[1-9][0-9]{5}$/;
/** Shiprocket tokens last 10 days; renew a day early. */
const TOKEN_MS = 9 * 24 * 60 * 60 * 1000;
export const ANSWER_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED = 500;
const TIMEOUT_MS = 6000;

export const validPincode = (value: unknown): value is string =>
  typeof value === 'string' && PINCODE.test(value);

export const shiprocketConfigured = (env: ShiprocketEnv): boolean =>
  Boolean(
    env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD && validPincode(env.SHIPROCKET_PICKUP_PINCODE),
  );

/** Weight in kg from the env (default 0.5, clamped 0.01–50). */
export function parcelWeight(env: ShiprocketEnv): string {
  const kg = Number.parseFloat(env.SHIPROCKET_WEIGHT_KG ?? '');
  return String(Number.isFinite(kg) ? Math.min(Math.max(kg, 0.01), 50) : 0.5);
}

export function serviceabilityUrl(pincode: string, env: ShiprocketEnv): string {
  const params = new URLSearchParams({
    pickup_postcode: env.SHIPROCKET_PICKUP_PINCODE ?? '',
    delivery_postcode: pincode,
    weight: parcelWeight(env),
    cod: '0',
  });
  return `${BASE}/courier/serviceability/?${params}`;
}

/** Shiprocket's JSON → answer. No couriers = unserviceable; anything unexpected = unavailable. */
export function parseServiceability(json: unknown): DeliveryAnswer {
  const root = json as {
    status?: unknown;
    data?: { available_courier_companies?: unknown } | null;
  } | null;
  const list = root?.data?.available_courier_companies;
  if (!Array.isArray(list))
    return root?.status === 404 ? { status: 'unserviceable' } : { status: 'unavailable' };
  const days = list
    .map((c) =>
      Number.parseInt(
        String((c as { estimated_delivery_days?: unknown }).estimated_delivery_days),
        10,
      ),
    )
    .filter((d) => Number.isFinite(d) && d >= 0 && d <= 60);
  if (list.length === 0) return { status: 'unserviceable' };
  if (days.length === 0) return { status: 'unavailable' };
  const min = Math.min(...days);
  const cod = list.some(
    (c) => (c as { cod?: unknown }).cod === 1 || (c as { cod?: unknown }).cod === true,
  );
  return {
    status: 'ok',
    min,
    max: Math.min(Math.max(...days), min + 3),
    ...(cod ? { cod: true } : {}),
  };
}

export type ShiprocketState = {
  token?: { value: string; expires: number };
  answers: Map<string, { answer: DeliveryAnswer; expires: number }>;
};
export const createShiprocketState = (): ShiprocketState => ({ answers: new Map() });

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function login(env: ShiprocketEnv, fetcher: Fetch, state: ShiprocketState, now: number) {
  const res = await fetcher(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const token = res.ok ? ((await res.json()) as { token?: unknown }).token : null;
  if (typeof token !== 'string' || !token) return null;
  state.token = { value: token, expires: now + TOKEN_MS };
  return token;
}

/**
 * Serviceability for a (validated) pincode. Answers are cached per isolate for 10 minutes
 * (failures are not); the token is renewed once on a 401.
 */
export async function checkShiprocket(
  pincode: string,
  env: ShiprocketEnv,
  fetcher: Fetch,
  state: ShiprocketState,
  now = Date.now(),
): Promise<DeliveryAnswer> {
  if (!validPincode(pincode) || !shiprocketConfigured(env)) return { status: 'unavailable' };
  const cached = state.answers.get(pincode);
  if (cached && cached.expires > now) return cached.answer;
  try {
    let token =
      state.token && state.token.expires > now
        ? state.token.value
        : await login(env, fetcher, state, now);
    if (!token) return { status: 'unavailable' };
    const call = (bearer: string) =>
      fetcher(serviceabilityUrl(pincode, env), {
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    let res = await call(token);
    if (res.status === 401) {
      token = await login(env, fetcher, state, now);
      if (!token) return { status: 'unavailable' };
      res = await call(token);
    }
    // Shiprocket answers 404 with a message when no courier serves the pair.
    const answer =
      res.status === 404
        ? ({ status: 'unserviceable' } as const)
        : res.ok
          ? parseServiceability(await res.json())
          : ({ status: 'unavailable' } as const);
    if (answer.status !== 'unavailable') {
      if (state.answers.size >= MAX_CACHED) state.answers.clear();
      state.answers.set(pincode, { answer, expires: now + ANSWER_TTL_MS });
    }
    return answer;
  } catch {
    return { status: 'unavailable' };
  }
}

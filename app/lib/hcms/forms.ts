/**
 * Newsletter / contact form posts (T-1.3.2, D-21). The storefront never holds an Admin token: it
 * validates, drops honeypot spam, then forwards an HMAC-signed request to the HCMS admin, which
 * writes to Shopify (customer + marketing consent, or a merchant-owned contact metaobject).
 *
 * Works without JavaScript: a plain form POST gets a 303 back to the page with a `#…-success`
 * anchor (the section shows its message via `:target`). `fetch` with `Accept: application/json`
 * gets JSON.
 *
 * Spam protection (T-2.49), all silent to bots (they get the same success answer as people):
 * honeypot `hcms_hp`, cross-site POSTs refused, `hcms_ts` time trap (form rendered < 2 s ago),
 * link-stuffed contact messages, and a per-isolate IP limit in front of the admin's own limit.
 * Nothing here needs JavaScript in the browser, so no-JS shoppers are never blocked.
 */
export type FormKind = 'newsletter' | 'contact' | 'back_in_stock';

/**
 * Sends the validated fields somewhere other than the HCMS admin (T-2.8 back in stock → Klaviyo
 * Client API); returns the upstream HTTP status. Same spam traps and responses as other forms.
 */
export type FormDeliver = (fields: Record<string, string>) => Promise<number>;

export type FormEnv = {
  HCMS_API_URL?: string | undefined;
  /** Per-store secret shared with the admin (also signs preview tokens). */
  HCMS_PREVIEW_SECRET?: string | undefined;
  PUBLIC_STORE_DOMAIN?: string | undefined;
};

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  message: 5000,
  section: 64,
  variant: 20,
} as const;

type Fields = Record<string, string>;

/** Faster than this from page render to submit = a script, not a person. */
export const MIN_FILL_MS = 2000;
/** Contact messages with more links than this are treated as spam. */
export const MAX_LINKS = 3;
/** Per buyer IP, per isolate: a cheap first line; the admin enforces the real limit (429). */
export const RATE_LIMIT = { max: 6, windowMs: 10 * 60 * 1000 } as const;

const recent = new Map<string, number[]>();

function rateLimited(ip: string, now: number): boolean {
  if (!ip) return false;
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) {
    // Bound memory in long-lived isolates: drop the oldest keys.
    for (const key of [...recent.keys()].slice(0, 1000)) recent.delete(key);
  }
  return hits.length > RATE_LIMIT.max;
}

/** `hcms_ts` (ms epoch, rendered with the form). Missing/garbled = allowed (old cached HTML). */
function tooFast(form: FormData, now: number): boolean {
  const raw = form.get('hcms_ts');
  if (typeof raw !== 'string' || !/^\d{12,14}$/.test(raw)) return false;
  const age = now - Number(raw);
  return age >= 0 && age < MIN_FILL_MS;
}

const LINK = /(?:https?:\/\/|www\.|\[url[=\]])/gi;
const linkStuffed = (fields: Fields) => (fields.message?.match(LINK)?.length ?? 0) > MAX_LINKS;

/** A POST from another site (Origin header) is never a shopper using this storefront. */
function crossSite(request: Request): boolean {
  const origin = request.headers.get('Origin');
  // `null` comes from no-referrer pages and sandboxed frames (editor preview): allowed.
  if (!origin || origin === 'null') return false;
  return origin !== new URL(request.url).origin;
}

function read(form: FormData, kind: FormKind): { fields: Fields; error: string | null } {
  const get = (key: keyof typeof LIMITS) => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim().slice(0, LIMITS[key]) : '';
  };
  const fields: Fields = { email: get('email').toLowerCase() };
  if (!EMAIL.test(fields.email ?? '')) return { fields, error: 'Enter a valid email address.' };
  if (kind === 'contact') {
    fields.name = get('name');
    fields.phone = get('phone');
    fields.message = get('message');
    if (!fields.message) return { fields, error: 'Enter a message.' };
  }
  if (kind === 'back_in_stock') {
    fields.variant = get('variant');
    if (!/^\d{1,20}$/.test(fields.variant)) return { fields, error: 'Choose a variant.' };
  }
  return { fields, error: null };
}

const encoder = new TextEncoder();
/** base64url(HMAC-SHA256(payload, secret)) — the admin's storefront signature scheme. */
export async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Section id → safe anchor fragment (ids are editor-generated; never trust them as HTML). */
const anchor = (kind: FormKind, section: string) =>
  `${kind}-${section.replace(/[^a-zA-Z0-9_-]/g, '')}-success`;

function respond(
  request: Request,
  kind: FormKind,
  section: string,
  status: number,
  body: { ok: boolean; error?: string },
): Response {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.headers.get('Accept')?.includes('application/json'))
    return Response.json(body, { status, headers });
  if (!body.ok)
    return new Response(body.error ?? 'Something went wrong.', {
      status,
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  // Same-origin Referer only; otherwise back to the home page.
  const url = new URL(request.url);
  let back = new URL('/', url);
  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const candidate = new URL(referer);
      if (candidate.origin === url.origin) back = candidate;
    } catch {
      // ignore malformed Referer
    }
  }
  back.hash = anchor(kind, section);
  return new Response(null, { status: 303, headers: { ...headers, Location: back.toString() } });
}

export async function handleFormPost(
  request: Request,
  kind: FormKind,
  env: FormEnv,
  fetchImpl: typeof fetch = fetch,
  deliver?: FormDeliver,
): Promise<Response> {
  if (request.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  if (crossSite(request))
    return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond(request, kind, '', 400, { ok: false, error: 'Invalid form submission.' });
  }
  const sectionValue = form.get('section');
  const section = typeof sectionValue === 'string' ? sectionValue.slice(0, LIMITS.section) : '';
  const now = Date.now();
  // Honeypot filled or submitted too fast → a bot. Pretend success so it learns nothing.
  const trap = form.get('hcms_hp');
  if ((typeof trap === 'string' && trap !== '') || tooFast(form, now))
    return respond(request, kind, section, 200, { ok: true });

  const { fields, error } = read(form, kind);
  if (error) return respond(request, kind, section, 422, { ok: false, error });
  if (kind === 'contact' && linkStuffed(fields))
    return respond(request, kind, section, 200, { ok: true });

  const ip =
    request.headers.get('oxygen-buyer-ip') ?? request.headers.get('cf-connecting-ip') ?? '';
  if (rateLimited(ip, now))
    return respond(request, kind, section, 429, {
      ok: false,
      error: 'Too many attempts. Try again in a few minutes.',
    });

  if (deliver) {
    try {
      const status = await deliver(fields);
      if (status >= 200 && status < 300) return respond(request, kind, section, 200, { ok: true });
      if (status === 429)
        return respond(request, kind, section, 429, {
          ok: false,
          error: 'Too many attempts. Try again in a few minutes.',
        });
      if (status === 503)
        return respond(request, kind, section, 503, {
          ok: false,
          error: 'This form is not available yet.',
        });
    } catch {
      // network error / timeout → 502 below
    }
    return respond(request, kind, section, 502, {
      ok: false,
      error: 'Something went wrong. Please try again.',
    });
  }

  const api = env.HCMS_API_URL;
  const secret = env.HCMS_PREVIEW_SECRET;
  const shop = env.PUBLIC_STORE_DOMAIN;
  if (!api || !secret || !shop)
    return respond(request, kind, section, 503, {
      ok: false,
      error: 'This form is not available yet.',
    });

  const payload = JSON.stringify({
    shop,
    kind,
    section,
    fields,
    page: request.headers.get('Referer') ?? null,
    ts: Math.floor(Date.now() / 1000),
  });
  try {
    const res = await fetchImpl(`${api.replace(/\/+$/, '')}/api/storefront/${kind}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HCMS-Shop': shop,
        'X-HCMS-Signature': await sign(secret, payload),
        // Buyer IP for the admin's rate limiting (Oxygen sets `oxygen-buyer-ip`).
        'X-HCMS-Buyer-IP': ip,
      },
      body: payload,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return respond(request, kind, section, 200, { ok: true });
    if (res.status === 429)
      return respond(request, kind, section, 429, {
        ok: false,
        error: 'Too many attempts. Try again in a few minutes.',
      });
    if (res.status === 422) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      const message =
        typeof body?.error === 'string' ? body.error : 'Check the form and try again.';
      return respond(request, kind, section, 422, { ok: false, error: message });
    }
  } catch {
    // network error / timeout → fall through
  }
  return respond(request, kind, section, 502, {
    ok: false,
    error: 'Something went wrong. Please try again.',
  });
}

/** Exposed for tests and the admin-side verifier contract. */
export const __test = { sign, anchor, resetRateLimit: () => recent.clear() };

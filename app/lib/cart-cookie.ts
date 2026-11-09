/**
 * Shared cart cookie during an Online Store → Hydrogen migration (T-2.53). Pure; no Hydrogen imports.
 *
 * Online Store themes and Hydrogen 2026-10 both keep the cart in a first-party `cart` cookie holding
 * the cart token (`<token>?key=<key>`, URL-encoded, no `gid://shopify/Cart/` prefix), so a shopper's
 * Online Store cart already opens in Hydrogen on the same domain (shopify.dev "Migrate from the online
 * store to Hydrogen" → Shared carts). Hydrogen's `getCartId` decodes the value and adds the GID prefix;
 * `createCartCookie` writes a host-only `Path=/; SameSite=Lax; Max-Age=1209600` cookie.
 *
 * What can still break, and what `reconcileCartCookie` fixes before Hydrogen reads the request:
 * - Two `cart` cookies (an Online Store cookie scoped to a parent domain + Hydrogen's host-only one).
 *   Browsers send both; Hydrogen takes the first, which is the older Online Store cart, so a cart the
 *   shopper created on Hydrogen seems to vanish. We keep the newest (last, RFC 6265 §5.4: equal paths
 *   are ordered by creation time), clear the domain-scoped copies and re-set it host-only.
 * - Quoted values (`cart="…"`, valid per RFC 6265) and junk (`undefined`, `null`) left by old theme
 *   scripts: unquoted, or dropped so Hydrogen doesn't query a cart that can't exist.
 * Cart tokens are opaque (Shopify changelog, July 2025: no format assumptions) — we only reject
 * values that can't be a token at all.
 */

export const CART_COOKIE = 'cart';
/** Same lifetime and attributes as Hydrogen's `createCartCookie` (and the Online Store cookie). */
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 14;
const CART_GID_PREFIX = 'gid://shopify/Cart/';
const MAX_TOKEN_LENGTH = 1024;
const JUNK = new Set(['', 'undefined', 'null', 'false', '0', 'deleted']);

type CookiePair = { name: string; value: string };

function cookiePairs(header: string): CookiePair[] {
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      return eq < 0
        ? { name: '', value: part }
        : { name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() };
    });
}

/** Raw values of every `cart` cookie in the header, in the order the browser sent them. */
export function cartCookieValues(cookieHeader: string | null | undefined): string[] {
  if (!cookieHeader) return [];
  return cookiePairs(cookieHeader)
    .filter((pair) => pair.name === CART_COOKIE)
    .map((pair) => pair.value);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The cart token in a raw `cart` cookie value (`abc?key=def`), or `null` when it can't be one.
 * Accepts the URL-encoded Online Store/Hydrogen form, plain, quoted and full-GID values.
 */
export function cartToken(raw: string): string | null {
  let value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  value = safeDecode(value);
  if (value.startsWith(CART_GID_PREFIX)) value = value.slice(CART_GID_PREFIX.length);
  if (JUNK.has(value.toLowerCase()) || value.length > MAX_TOKEN_LENGTH) return null;
  // Opaque token + optional `?key=…`; no whitespace, quotes, separators or control characters.
  if (
    /[\s"',;\\<>/]/.test(value) ||
    [...value].some((c) => c.charCodeAt(0) < 0x20 || c === '\u007f')
  )
    return null;
  return value;
}

/** The cookie value Hydrogen's `createCartCookie` writes for this token. */
export function canonicalCartCookieValue(token: string): string {
  return encodeURIComponent(token);
}

export function cartSetCookie(token: string): string {
  return `${CART_COOKIE}=${canonicalCartCookieValue(token)}; Path=/; SameSite=Lax; Max-Age=${CART_COOKIE_MAX_AGE}`;
}

/** The host and each parent domain (≥ 2 labels): where a domain-scoped `cart` cookie could live. */
export function cookieDomains(host: string): string[] {
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  if (!hostname || /^[\d.]+$/.test(hostname) || hostname.startsWith('[')) return [];
  const labels = hostname.split('.');
  const domains: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) domains.push(labels.slice(i).join('.'));
  return domains;
}

/** Deleting a cookie needs the same name, domain and path it was set with. */
function clearCookies(host: string): string[] {
  return [
    `${CART_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`,
    ...cookieDomains(host).map(
      (domain) => `${CART_COOKIE}=; Domain=${domain}; Path=/; SameSite=Lax; Max-Age=0`,
    ),
  ];
}

export type CartCookieFix = {
  /** The request's `Cookie` header with exactly one canonical `cart` cookie (or none). */
  cookie: string;
  /** Set-Cookie values for the response, to be sent BEFORE the app's own (an app cart cookie wins). */
  setCookies: string[];
  token: string | null;
};

/**
 * `null` when the request's cart cookie is already what Hydrogen expects (none, or one canonical
 * value) — the common case costs nothing. Otherwise the cookie header Hydrogen should read and the
 * Set-Cookie headers that repair the browser's cookies.
 */
export function reconcileCartCookie(
  cookieHeader: string | null | undefined,
  host: string,
): CartCookieFix | null {
  const values = cartCookieValues(cookieHeader);
  if (values.length === 0) return null;
  const tokens = values.map(cartToken);
  const valid = tokens.filter((token): token is string => token !== null);
  const token = valid.at(-1) ?? null;

  if (values.length === 1 && token !== null && values[0] === canonicalCartCookieValue(token)) {
    return null;
  }

  const others = cookiePairs(cookieHeader ?? '')
    .filter((pair) => pair.name !== CART_COOKIE)
    .map((pair) => (pair.name ? `${pair.name}=${pair.value}` : pair.value));
  if (token !== null) others.push(`${CART_COOKIE}=${canonicalCartCookieValue(token)}`);

  let setCookies: string[];
  if (values.length > 1) {
    // Remove every copy (host-only and domain-scoped), then keep the newest host-only, like Hydrogen.
    setCookies = [...clearCookies(host), ...(token !== null ? [cartSetCookie(token)] : [])];
  } else if (token === null) {
    setCookies = clearCookies(host);
  } else {
    // One valid but non-canonical value (quoted, plain or GID): Hydrogen only needs the request
    // fixed. Re-setting it host-only could add a second cookie next to a domain-scoped one.
    setCookies = [];
  }
  return { cookie: others.join('; '), setCookies, token };
}

/**
 * Applies `reconcileCartCookie` to a request: the request Hydrogen should see, and a function that
 * adds the repair cookies to the response (ahead of the app's own Set-Cookie headers).
 */
export function withReconciledCartCookie(request: Request): {
  request: Request;
  finish: (response: Response) => Response;
} {
  const fix = reconcileCartCookie(request.headers.get('cookie'), new URL(request.url).host);
  if (!fix) return { request, finish: (response) => response };
  const headers = new Headers(request.headers);
  if (fix.cookie) headers.set('cookie', fix.cookie);
  else headers.delete('cookie');
  const reconciled = new Request(request, { headers });
  return {
    request: reconciled,
    finish(response) {
      if (fix.setCookies.length === 0) return response;
      const merged = new Headers();
      for (const value of fix.setCookies) merged.append('set-cookie', value);
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'set-cookie') merged.append(name, value);
      });
      for (const value of response.headers.getSetCookie()) merged.append('set-cookie', value);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: merged,
      });
    },
  };
}

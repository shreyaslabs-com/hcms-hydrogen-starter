/**
 * Hydrogen's Shopify routes (`/api/cart`, predictive search, …) throw when the Storefront API
 * times out or fails, which surfaced as a bare 500 (S2-2). This answers with a retryable 503
 * instead: JSON `errors` for fetch callers (the cart store shows it in its error banner), a small
 * page with a way back for native form posts (no JS).
 */
export const SHOPIFY_ROUTE_ERROR_MESSAGE =
  "We couldn't reach the store just now. Please try again in a moment.";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** Same-origin page to send a no-JS shopper back to (the referring page, else the cart). */
function backHref(request: Request): string {
  const url = new URL(request.url);
  try {
    const referer = new URL(request.headers.get('Referer') ?? '', url);
    if (referer.origin === url.origin) return `${referer.pathname}${referer.search}`;
  } catch {
    // no or malformed referer
  }
  return '/cart';
}

/**
 * `message ← cause ← cause…` (≤ 4 levels). Hydrogen's "SFAPI request failed" hides why
 * (network error, timeout, Shopify 5xx/throttle), so the log keeps the causes too.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 4; depth++) {
    if (current instanceof Error) {
      const status = (current as { status?: unknown }).status;
      parts.push(`${current.message}${typeof status === 'number' ? ` (status ${status})` : ''}`);
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(' ← ');
}

export function shopifyRouteErrorResponse(request: Request, error: unknown): Response {
  console.error(`Shopify route ${new URL(request.url).pathname} failed: ${describeError(error)}`);
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': '5' };
  const navigation =
    request.headers.get('Sec-Fetch-Mode') === 'navigate' ||
    (request.headers.get('Accept') ?? '').startsWith('text/html');
  if (!navigation) {
    return Response.json(
      { errors: [{ message: SHOPIFY_ROUTE_ERROR_MESSAGE }] },
      { status: 503, headers },
    );
  }
  const back = escapeHtml(backHref(request));
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Please try again</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1>Please try again</h1><p>${escapeHtml(SHOPIFY_ROUTE_ERROR_MESSAGE)}</p><p><a href="${back}">Go back</a></p></body></html>`,
    { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/** `promise.catch(shopifyRouteError(request))` helper. */
export const shopifyRouteError = (request: Request) => (error: unknown) =>
  shopifyRouteErrorResponse(request, error);

/**
 * Custom HTML JavaScript frames (2026-11-09), pure: `/__hcms/embed/<section>/<block…>?v=<hash>`
 * answers with the frame document of that Custom HTML section/block, looked up by ids in the
 * document this request renders (published snapshot, or the signed preview draft) — never built
 * from request input. Headers: `CUSTOM_CODE_FRAME_CSP` (its `sandbox` makes the document an
 * opaque origin even when opened directly: no storefront cookies, storage, cart or DOM), nosniff,
 * no referrer, noindex. Cached only when `v` matches the content (the URL changes with it).
 */
import {
  CUSTOM_CODE_FRAME_CSP,
  customCodeFrame,
  customCodeKey,
  findCustomCode,
  sanitizeCustomCss,
} from '@hcms/schema';

type Doc = Parameters<typeof findCustomCode>[0];

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Section id + block ids from the splat (`main/b1`), or null when malformed. */
export function embedPath(splat: string | undefined): string[] | null {
  const parts = (splat ?? '').split('/').filter(Boolean);
  return parts.length >= 1 && parts.length <= 4 && parts.every((p) => ID.test(p)) ? parts : null;
}

export function embedResponse(
  doc: Doc,
  splat: string | undefined,
  hash: string | null,
  { origin, preview }: { origin: string; preview: boolean },
): Response {
  const headers = new Headers({
    'Content-Security-Policy': CUSTOM_CODE_FRAME_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
  });
  const path = embedPath(splat);
  const found = path ? findCustomCode(doc, path, hash ?? undefined) : null;
  if (!path || !found) {
    headers.set('Cache-Control', 'no-store');
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    return new Response('Not found', { status: 404, headers });
  }
  const key = customCodeKey(path);
  const css = found.fields.css.trim()
    ? sanitizeCustomCss(found.fields.css, { scope: 'block', key })
    : null;
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set(
    'Cache-Control',
    !preview && found.exact && hash
      ? 'public, max-age=300, stale-while-revalidate=3600'
      : 'no-store',
  );
  return new Response(
    customCodeFrame({
      fields: found.fields,
      css: css?.ok ? css.css : '',
      key,
      parentOrigin: origin,
    }),
    { status: 200, headers },
  );
}

/**
 * Theme Document head tags + site verification (T-2.75) and safe custom response headers
 * (T-2.76). Server-only (root loader + middleware); every entry is re-checked with the schema's
 * allowlists and invalid ones are dropped (tolerant read: a bad snapshot never breaks a page).
 */
import {
  VERIFICATION_META,
  VERIFICATION_PROVIDERS,
  headTagIssue,
  headerRuleIssue,
  matchHeaderPath,
  verificationFileIssue,
  verificationFileType,
  verificationTokenIssue,
  type HeadTag,
  type HeaderRule,
} from '@hcms/schema';

/** Props for `<meta>`/`<link>` (React escapes attribute values). */
export type HeadTagProps =
  | { tagName: 'meta'; attrs: Record<string, string> }
  | { tagName: 'link'; attrs: Record<string, string> };

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const LINK_PROPS: Record<string, string> = {
  rel: 'rel',
  href: 'href',
  hreflang: 'hrefLang',
  type: 'type',
  sizes: 'sizes',
  crossorigin: 'crossOrigin',
  media: 'media',
  title: 'title',
};

/** Verification `<meta>` tags first, then the merchant's allowlisted custom tags. */
export function headTagsFor(seo: unknown): HeadTagProps[] {
  const s = record(seo);
  const out: HeadTagProps[] = [];
  const verification = record(s.verification);
  for (const provider of VERIFICATION_PROVIDERS) {
    const token = verification[provider];
    if (typeof token === 'string' && !verificationTokenIssue(token))
      out.push({ tagName: 'meta', attrs: { name: VERIFICATION_META[provider], content: token } });
  }
  for (const raw of list(s.headTags).slice(0, 20)) {
    if (headTagIssue(raw)) continue;
    const tag = raw as HeadTag;
    if (tag.tag === 'meta') {
      const attrs: Record<string, string> = {};
      if (tag.name) attrs.name = tag.name;
      if (tag.property) attrs.property = tag.property;
      if (tag.httpEquiv) attrs.httpEquiv = tag.httpEquiv.toLowerCase();
      attrs.content = tag.content;
      out.push({ tagName: 'meta', attrs });
    } else {
      const attrs: Record<string, string> = {};
      for (const [key, prop] of Object.entries(LINK_PROPS)) {
        const value = (tag as Record<string, unknown>)[key];
        if (typeof value === 'string') attrs[prop] = value;
      }
      out.push({ tagName: 'link', attrs });
    }
  }
  return out;
}

/** `https://origin`s of `rel=manifest` links (CSP `manifest-src`); icons are covered by img-src. */
export function headTagManifestHosts(tags: HeadTagProps[]): string[] {
  return tags
    .filter((t) => t.tagName === 'link' && t.attrs.rel === 'manifest')
    .map((t) => /^https:\/\/[^/?#]+/i.exec(t.attrs.href ?? '')?.[0])
    .filter((h): h is string => Boolean(h));
}

/**
 * `/google<id>.html` or `/BingSiteAuth.xml` from the Theme Document (root path only, never under
 * a market prefix); null for every other URL. Answered before the password gate so Search
 * Console can verify a store that isn't open yet. Preview serves the draft's files.
 */
export function verificationFileResponse(
  pathname: string,
  seo: unknown,
  { preview = false }: { preview?: boolean } = {},
): Response | null {
  if (!/^\/(?:google[a-z0-9]+\.html|BingSiteAuth\.xml)$/.test(pathname)) return null;
  const filename = pathname.slice(1);
  const file = list(record(seo).verificationFiles).find(
    (f) => record(f).filename === filename && !verificationFileIssue(f),
  );
  if (!file) return null;
  return new Response((record(file).content as string).trim(), {
    headers: {
      'Content-Type': verificationFileType(filename),
      'Cache-Control': preview ? 'no-store' : 'public, max-age=300, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

/** Lists may repeat; single-valued headers never replace one the code already set. */
const APPENDABLE = new Set(['X-Robots-Tag', 'Link']);

/**
 * Applies the merchant's header rules that match this path (with or without the market prefix).
 * Only allowlisted names reach here (`headerRuleIssue`), so security headers set by code are never
 * touched; CORS is never added to an HTML response.
 */
export function applyHeaderRules(
  headers: Headers,
  seo: unknown,
  { pathname, pathPrefix = '' }: { pathname: string; pathPrefix?: string },
): void {
  const unprefixed =
    pathPrefix && (pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`))
      ? pathname.slice(pathPrefix.length) || '/'
      : pathname;
  const html = /text\/html/i.test(headers.get('Content-Type') ?? '');
  for (const raw of list(record(seo).headers).slice(0, 30)) {
    if (headerRuleIssue(raw)) continue;
    const rule = raw as HeaderRule;
    if (!matchHeaderPath(rule.path, pathname) && !matchHeaderPath(rule.path, unprefixed)) continue;
    if (rule.name === 'Access-Control-Allow-Origin' && html) continue;
    const value = rule.value.trim();
    try {
      if (APPENDABLE.has(rule.name)) headers.append(rule.name, value);
      else if (!headers.has(rule.name)) headers.set(rule.name, value);
    } catch {
      // A value the runtime refuses (non-ByteString…) skips this rule, never fails the page.
    }
  }
}

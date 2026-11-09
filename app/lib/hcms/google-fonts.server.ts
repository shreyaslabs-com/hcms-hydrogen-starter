import { parseFontHandle } from '@hcms/hydrogen';
import { Cache, createRunWithCache, type CacheInstance } from '@shopify/hydrogen';

import {
  GOOGLE_FONTS_USER_AGENT,
  googleFontsStylesheet,
  linksWithoutGoogleStylesheet,
  safeGoogleFontCss,
  type ThemeLink,
} from './google-fonts';
import { fontPreloads, fontSignature, selfHostFontCss, type FontFaceRef } from './font-proxy';

/** Above-the-fold Google faces to preload: heading, then body regular (theme `typography`). */
export function themeFontFaces(typography: unknown): FontFaceRef[] {
  const record = (typography ?? {}) as Record<string, unknown>;
  return (['heading', 'body'] as const).flatMap((role) => {
    const font = parseFontHandle(record[role]);
    return font && font.source === 'google'
      ? [{ family: font.family, weight: font.weight, style: font.style }]
      : [];
  });
}

/** A cold cache never holds the document for long: past this, the `<link>` stays (next hit inlines). */
const BUDGET_MS = 600;

/**
 * Theme links with the Google Fonts stylesheet inlined (see `google-fonts.ts`): `{ links, css }`.
 * Any failure (timeout, non-CSS answer, unexpected content) keeps the original `<link>`.
 * T-2.135: with a `secret`, font files are served from our origin (`font-proxy.ts`; gstatic stays
 * as each face's second source) and the Latin files of `faces` (heading, body) are preloaded.
 */
export async function inlineGoogleFonts<L extends ThemeLink>(
  links: L[],
  {
    cache,
    waitUntil,
    secret,
    faces = [],
  }: {
    cache: CacheInstance;
    waitUntil: ExecutionContext['waitUntil'];
    secret?: string;
    faces?: readonly FontFaceRef[];
  },
): Promise<{ links: L[]; fontCss: string }> {
  const href = googleFontsStylesheet(links);
  if (!href) return { links, fontCss: '' };
  const runWithCache = createRunWithCache({ cache, waitUntil });
  // The signing key is part of the cache key: a rotated secret never serves stale paths.
  const variant = secret ? await fontSignature(secret, href).catch(() => '') : '';
  const load = runWithCache(
    { key: ['hcms', 'google-fonts', 'v2', variant, href], strategy: Cache.long() },
    async (): Promise<{ data: { css: string }; shouldCache: boolean }> => {
      const response = await fetch(href, {
        headers: { 'User-Agent': GOOGLE_FONTS_USER_AGENT, Accept: 'text/css' },
      });
      const type = response.headers.get('content-type') ?? '';
      const safe =
        response.ok && type.includes('text/css') ? safeGoogleFontCss(await response.text()) : null;
      if (!safe) return { data: { css: '' }, shouldCache: false };
      const css = variant ? await selfHostFontCss(safe, secret ?? '').catch(() => safe) : safe;
      return { data: { css }, shouldCache: true };
    },
  ).catch(() => ({ data: { css: '' } }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ data: { css: string } }>((resolve) => {
    timer = setTimeout(() => resolve({ data: { css: '' } }), BUDGET_MS);
  });
  // The fetch keeps filling the cache after a timeout.
  waitUntil(load);
  const { data } = await Promise.race([load, timeout]);
  clearTimeout(timer);
  if (!data.css) return { links, fontCss: '' };
  const selfHosted = data.css.includes(`url(/__hcms/fonts/`);
  const preloads = selfHosted
    ? fontPreloads(data.css, faces).map((href) => ({
        rel: 'preload',
        href,
        as: 'font' as const,
        type: 'font/woff2',
        crossOrigin: 'anonymous' as const,
      }))
    : [];
  return {
    links: [
      ...(preloads as L[]),
      ...(linksWithoutGoogleStylesheet(links, { keepGstatic: !selfHosted }) as L[]),
    ],
    fontCss: data.css,
  };
}

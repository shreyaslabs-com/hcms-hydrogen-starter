/**
 * Inline Google Fonts (PSI gate, 2026-11-09): the theme's `fonts.googleapis.com/css2` stylesheet
 * was a render-blocking, cross-origin request (a new connection before first paint: ~0.8 s in
 * PageSpeed Insights' slow 4G). The root loader fetches that CSS once (sub-request cache, long),
 * and the document inlines it as `<style>`: the `@font-face` rules (`font-display: swap`) cost no
 * extra round trip and font files still come from fonts.gstatic.com. Pure helpers here (tested in
 * `__test__/google-fonts.test.ts`); the cached fetch is `loadGoogleFontCss`.
 */

export type ThemeLink = {
  rel: string;
  href: string;
  crossOrigin?: 'anonymous';
  as?: 'font';
  type?: string;
};

const CSS_ORIGIN = 'https://fonts.googleapis.com';
const FONT_ORIGIN = 'https://fonts.gstatic.com/';
/** Google picks the format from the UA: a current Chrome gets woff2 + unicode-range subsets. */
export const GOOGLE_FONTS_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MAX_CSS_BYTES = 120_000;

/** The theme's Google Fonts stylesheet URL, if any. */
export function googleFontsStylesheet(links: readonly ThemeLink[]): string | null {
  const link = links.find((l) => l.rel === 'stylesheet' && l.href.startsWith(`${CSS_ORIGIN}/`));
  return link?.href ?? null;
}

/**
 * Google's CSS, accepted only when it is plain `@font-face` rules whose `url()`s all point at
 * fonts.gstatic.com (nothing that could break out of `<style>` or load from elsewhere).
 */
export function safeGoogleFontCss(css: string): string | null {
  if (!css || css.length > MAX_CSS_BYTES) return null;
  if (/[<>\\]|@import|expression\(|javascript:/i.test(css)) return null;
  const urls = [...css.matchAll(/url\(\s*['"]?([^'")\s]+)/g)].map((m) => m[1] ?? '');
  if (!urls.length || urls.some((u) => !u.startsWith(FONT_ORIGIN))) return null;
  // Comments (`/* latin */`) and blank lines are noise in every document.
  const minified = css
    .replace(/\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, '')
    .replace(/\s*\n\s*/g, '')
    .replace(/\s*([{};:,])\s*/g, '$1');
  const blocks = minified.match(/@font-face\{[^{}]*\}/g) ?? [];
  return blocks.length && blocks.join('').length === minified.length ? minified : null;
}

/**
 * Links once the stylesheet is inlined: no `<link rel=stylesheet>` / googleapis preconnect. The
 * gstatic preconnect stays while font files come from there; self-hosted files (T-2.135) drop it
 * (gstatic is only the failure fallback then, not worth an early connection).
 */
export function linksWithoutGoogleStylesheet(
  links: readonly ThemeLink[],
  { keepGstatic = true }: { keepGstatic?: boolean } = {},
): ThemeLink[] {
  return links.filter(
    (l) =>
      !l.href.startsWith(CSS_ORIGIN) &&
      (keepGstatic || !l.href.startsWith(FONT_ORIGIN.slice(0, -1))),
  );
}

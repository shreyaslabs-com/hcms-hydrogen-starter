import assert from 'node:assert/strict';
import test from 'node:test';

import {
  googleFontsStylesheet,
  linksWithoutGoogleStylesheet,
  safeGoogleFontCss,
} from '../app/lib/hcms/google-fonts.ts';

const HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap';
const LINKS = [
  { rel: 'preload', href: 'https://cdn.shopify.com/a.woff2', as: 'font' as const },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' as const },
  { rel: 'stylesheet', href: HREF },
];
const GOOGLE_CSS = `/* cyrillic */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/a.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/b.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
`;

test('finds the Google stylesheet and drops it (and its preconnect) from the links', () => {
  assert.equal(googleFontsStylesheet(LINKS), HREF);
  assert.equal(googleFontsStylesheet(LINKS.slice(0, 3)), null);
  assert.deepEqual(
    linksWithoutGoogleStylesheet(LINKS).map((l) => l.href),
    ['https://cdn.shopify.com/a.woff2', 'https://fonts.gstatic.com'],
  );
});

test('accepts Google @font-face CSS, minified', () => {
  const css = safeGoogleFontCss(GOOGLE_CSS);
  assert.ok(css);
  assert.equal(css.match(/@font-face/g)?.length, 2);
  assert.ok(!css.includes('/*'));
  assert.ok(!css.includes('\n'));
  assert.ok(css.includes("src:url(https://fonts.gstatic.com/s/inter/v20/b.woff2) format('woff2')"));
  assert.ok(css.includes('unicode-range:U+0000-00FF,U+0131'));
});

test('refuses anything that is not gstatic @font-face rules', () => {
  assert.equal(safeGoogleFontCss(''), null);
  assert.equal(safeGoogleFontCss('<html>quota exceeded</html>'), null);
  assert.equal(safeGoogleFontCss(GOOGLE_CSS.replace('fonts.gstatic.com', 'evil.example')), null);
  assert.equal(safeGoogleFontCss(`${GOOGLE_CSS}body{color:red}`), null);
  assert.equal(
    safeGoogleFontCss(`@import url(https://fonts.gstatic.com/x.css);${GOOGLE_CSS}`),
    null,
  );
  assert.equal(safeGoogleFontCss(`${GOOGLE_CSS}</style><script>`), null);
  assert.equal(safeGoogleFontCss('x'.repeat(200_000)), null);
});

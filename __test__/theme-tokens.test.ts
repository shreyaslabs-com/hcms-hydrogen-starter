import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BADGE_STYLES, BUTTON_STYLES, CARD_STYLES, TYPE_STYLES } from '@hcms/schema';

import { withCurrencyCode } from '../app/lib/hcms/currency-code.ts';

const css = readFileSync(new URL('../app/hcms-tokens.css', import.meta.url), 'utf8');

test('currency code (T-2.65): appends the ISO code once', () => {
  assert.equal(withCurrencyCode('$10.00', 'USD'), '$10.00 USD');
  assert.equal(withCurrencyCode('CHF 10.00', 'CHF'), 'CHF 10.00');
  assert.equal(withCurrencyCode('$10.00', 'usd'), '$10.00 USD');
  assert.equal(withCurrencyCode('$10.00', '<b>'), '$10.00');
});

test('design-token CSS keeps focus outlines and gates motion', () => {
  // Focus indicators belong to the core tokens (WCAG 2.2 AA): tokens never touch outlines.
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /(^|[\s;{])outline(-[a-z]+)?\s*:/m);
  // Every transition/transform lives under prefers-reduced-motion: no-preference.
  const motion = css.split('prefers-reduced-motion: no-preference');
  assert.ok(motion.length >= 2);
  assert.doesNotMatch(motion[0] ?? '', /transition|transform:/);
  // Wired into the app stylesheet after the core tokens.
  const app = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');
  assert.ok(app.indexOf("'./hcms-tokens.css'") > app.indexOf("'./tokens.css'"));
});

test('named component styles (T-2.87): one class per schema style, focus untouched', () => {
  const styles = readFileSync(new URL('../app/hcms-styles.css', import.meta.url), 'utf8');
  const code = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const s of BUTTON_STYLES.styles) {
    assert.match(code, new RegExp(`\\.hcms-button--${s.id} \\{`));
    if (s.id !== 'link') assert.match(code, new RegExp(`var\\(--button-${s.id}-radius\\)`));
  }
  for (const s of CARD_STYLES.styles)
    assert.match(code, new RegExp(`\\.hcms-card\\.hcms-card--style-${s.id} \\{`));
  for (const s of BADGE_STYLES.styles)
    assert.match(code, new RegExp(`\\.hcms-badge\\.hcms-badge--${s.id} \\{`));
  for (const s of TYPE_STYLES.styles) assert.match(code, new RegExp(`\\.type-preset-${s.id} \\{`));
  // Secondary keeps its outline default, primary its solid fill.
  assert.match(code, /--b-solid: var\(--button-secondary-solid, 0\)/);
  assert.match(code, /--b-solid: var\(--button-primary-solid, 1\)/);
  // Focus indicators stay the core's (WCAG 2.2 AA); motion only without reduced-motion.
  assert.doesNotMatch(code, /(^|[\s;{])outline(-[a-z]+)?\s*:/m);
  assert.doesNotMatch(
    code.split('prefers-reduced-motion: no-preference')[0] ?? '',
    /transition|(^|[^-])transform:/m,
  );
  const app = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');
  assert.ok(app.indexOf("'./hcms-styles.css'") > app.indexOf("'./hcms-tokens.css'"));
});

test('reveal on scroll is CSS-only (Nov 9): no JS observer, html class from the SDK', () => {
  const root = readFileSync(new URL('../app/root.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(root, /RevealOnScroll|lib\/hcms\/reveal/);
  assert.match(
    root,
    /\[rootData\?\.theme\.flags\.motionClass, rootData\?\.theme\.flags\.iconClass\]/,
  );
  // The old JS classes are gone: nothing in the tokens can hide a section.
  assert.doesNotMatch(css, /hcms-reveal-pending|opacity: 0\.01/);
});

test('theme fonts + scheme buttons map onto the core tokens (UX review P0 #1/#2)', () => {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /--font-heading: var\(--font-heading-family, system-ui/);
  assert.match(code, /--font-body: var\(--font-body-family, system-ui/);
  assert.match(code, /body \{\s*font-family: var\(--font-body\)/);
  assert.match(code, /font-weight: var\(--font-heading-weight, 300\)/);
  // Resolved on the button itself, so the nearest colour scheme wins; core brand as fallback.
  assert.match(code, /--color-button-primary: var\(--color-button, var\(--color-interactive\)\)/);
  assert.match(
    code,
    /--color-button-primary-text: var\(\s*--color-button-text,\s*var\(--color-button_label/,
  );
  // No stored label → the scheme background (Dawn pairs them): never white on a white button.
  assert.match(
    code,
    /var\(--color-button_label, var\(--color-background, var\(--color-interactive-text\)\)\)/,
  );
  assert.match(code, /--color-button-outline-border: var\(--color-button,/);
});

test('Page width setting drives max-w-page containers (Dawn page_width)', () => {
  assert.match(css, /--spacing-page: var\(--page-width, 80rem\)/);
});

test('secondary text follows the colour scheme (T-2.118, UX review #23)', () => {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /\[class\*='color-scheme-'\] \{([^}]*)\}/.exec(code)?.[1] ?? '';
  assert.match(rule, /--color-on-surface-secondary: color-mix\(\s*in srgb,\s*var\(--color-text/);
  assert.match(rule, /--color-compare: var\(--color-on-surface-secondary\)/);
  const app = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');
  assert.match(app, /@import '\.\.\/node_modules\/@hcms\/sections\/dist\/sections\.css';/);
});

test('section spacing applies only between template sections inside <main>, not header/footer groups', () => {
  assert.match(css, /main \[data-hcms-section-id\]\s*\+ \[data-hcms-section-id\]/);
  assert.doesNotMatch(css, /^\[data-hcms-section-id\]\s*\+ \[data-hcms-section-id\]/m);
});

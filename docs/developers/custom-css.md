# Custom CSS

Custom CSS is the escape hatch for agencies and developers: small style changes that settings
don't cover, without a code deploy. It works like the Online Store's Custom CSS.

- **Theme settings › Custom CSS**: "Add custom styles to your whole theme." Global, up to 50 KB.
- **Section › Custom CSS** (bottom of every section's settings): "Add custom styles to this
  section only." Up to 10 KB per section.

Only **publishers and admins** can change it; editors see it read-only. Saving never publishes:
it goes live with the next publish and rolls back with the version. Custom CSS is yours to
maintain after HCMS updates: write it against the stable hooks below.

## How it is rendered

- Rendered on the server as `<style>`; no JavaScript is added. The preview updates after each
  save, like other settings.
- Theme CSS comes after the theme's own styles and tokens, so equal-specificity rules win.
- Section CSS is scoped: every selector is prefixed with the section root `#hcms-section-<id>`.
  `.title { … }` becomes `#hcms-section-<id> .title { … }`, `&.dark { … }` targets the root
  itself. Selector lists, `@media`, `@supports`, `@container` and nested rules (`& .price { … }`
  inside a rule) are supported and stay inside the section.
- Empty boxes output nothing.

## What is refused

Unsafe CSS shows an error under the box (with the line) and is never saved. The same rules run
again on save and publish.

- `@import`, `@charset`, `@namespace` and other at-rules outside `@media`, `@supports`,
  `@container`, `@keyframes`, `@starting-style` (theme CSS also allows `@font-face`, `@layer`,
  `@property`).
- `url()` pointing anywhere except Shopify's CDN (`https://cdn.shopify.com/…`), a path on the
  store (`/cdn/shop/files/…`) or an inline image (`data:image/png|jpeg|gif|webp|avif|svg+xml`).
  Upload images to **Content › Files** and use their link.
- `expression(`, `behavior`, `-moz-binding`, `javascript:` / `vbscript:` URLs, `<` anywhere
  (for example `</style`), backslash escapes outside strings, unbalanced braces.
- Section CSS can't target `:root`, `html`, `body` or `:host`, or reach siblings with `& ~` /
  `& +`. Put page-wide rules in the theme box.

Theme CSS may restyle `html` and `body` (layout, fonts, colours). That's allowed but easy to get
wrong: prefer the theme settings, and test on phones.

## Stable hooks

We keep these class names and data attributes across HCMS updates. A contract test fails our CI
if one disappears; a change would be announced as breaking. Anything else (Tailwind utilities,
other class names, element structure) can change in any update.

| Part | Hook |
| --- | --- |
| Section root | `#hcms-section-<id>`, `[data-hcms-section-id="<id>"]`, `[data-hcms-section-type="<type>"]` |
| Block root | `[data-hcms-block-id="<id>"]`, `[data-hcms-block-type="<type>"]` |
| Product / collection card | `.hcms-card`, `.hcms-card--product`, `.hcms-card--collection` |
| Price (cards, product page) | `.hcms-price` |
| Badge | `.hcms-badge` (shape: `.hcms-badge--pill`, `--rectangle`, `--ribbon`) |
| Buttons | `.hcms-button`, `.hcms-button--primary`, `.hcms-button--secondary` |
| Header parts | `.hcms-header__logo`, `.hcms-header__menu`, `.hcms-header__icons` |

Find a section's id in the editor: it is the `data-hcms-section-id` of the section in the preview
(right-click › Inspect). Section ids are kept when you rename or move a section.

## Examples

Theme box:

```css
.hcms-price { font-variant-numeric: tabular-nums; }
.hcms-button--primary { letter-spacing: 0.08em; text-transform: uppercase; }
```

Section box:

```css
.hcms-card { border-radius: 0; }
@media (min-width: 750px) {
  & { padding-block: 6rem; }
}
```

# Build your own sections and blocks

HydrogenCMS storefronts come with a full set of official sections. When a merchant needs something
the set doesn't have, a developer can add custom sections and blocks to the storefront's code.
After you deploy them and select **Sync**, they show up in the theme editor's **Add section** list
and in the **Component library** under the **Developer** source, with their own settings, just
like the official ones.

This guide is for React and Shopify developers working in the storefront template. Paths are
relative to the storefront root (the folder with `package.json`). Commands use npm, as the template
does; use `pnpm exec` or `pnpm run` if your copy uses pnpm.

Your sections live in one folder: every file in `app/sections/custom/` is registered for you,
on the server and in the browser. Working examples live in `app/sections/examples/`. They aren't
registered, so your store doesn't change until you copy them into `app/sections/custom/`.

## Contents

- [Quick start](#quick-start)
- [How a section works](#how-a-section-works)
- [Section anatomy](#section-anatomy)
- [Setting types](#setting-types)
- [Blocks](#blocks)
- [Shopify data](#shopify-data)
- [Dynamic sources](#dynamic-sources)
- [Styling with theme settings](#styling-with-theme-settings)
- [Register the section](#register-the-section)
- [Performance rules](#performance-rules)
- [Accessibility and right-to-left languages](#accessibility-and-right-to-left-languages)
- [Test your sections](#test-your-sections)
- [Ship it: deploy, then Sync](#ship-it-deploy-then-sync)
- [Preview without deploying: `hcms dev`](#preview-without-deploying-hcms-dev)
- [Troubleshooting](#troubleshooting)

## Quick start

This adds a small "Promo banner" section with a heading, text, a button and a color scheme. The
same code is in `app/sections/examples/promo-banner.tsx`.

**1. Create the section.** Run `npx hcms init promo-banner --name "Promo banner"` for a starting
file, or create `app/sections/custom/promo-banner.tsx` yourself. The file name is the section's
`type`:

```tsx
import {
  colorSchemeClass,
  defineSection,
  useAppComponents,
  type SectionComponentProps,
} from '@hcms/hydrogen';

/** Settings can briefly hold non-string values in the editor, so read them defensively. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function PromoBanner({ settings }: SectionComponentProps) {
  const { Link } = useAppComponents();
  const heading = text(settings.heading);
  const body = text(settings.text);
  const label = text(settings.button_label);
  const link = text(settings.button_link);
  const scheme = text(settings.color_scheme);
  const align =
    settings.alignment === 'start' ? 'items-start text-start' : 'items-center text-center';

  return (
    <div
      className={scheme ? colorSchemeClass(scheme) : undefined}
      style={{
        backgroundColor: 'var(--color-background, var(--color-surface))',
        color: 'var(--color-text, var(--color-on-surface))',
      }}
    >
      <div className={`max-w-page px-margin mx-auto flex flex-col gap-4 py-12 ${align}`}>
        {heading ? <h2 className="type-heading-lg">{heading}</h2> : null}
        {body ? <p className="type-body max-w-2xl">{body}</p> : null}
        {label && link ? (
          <Link
            to={link}
            className="button-primary hcms-button hcms-button--primary rounded-button inline-flex min-h-11 items-center px-6 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            {label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export const promoBanner = defineSection({
  type: 'promo-banner',
  name: 'Promo banner',
  settings: [
    { type: 'text', id: 'heading', label: 'Heading', default: 'Free shipping this week' },
    { type: 'textarea', id: 'text', label: 'Text', default: 'On every order, no code needed.' },
    { type: 'header', content: 'Button' },
    { type: 'text', id: 'button_label', label: 'Label', default: 'Shop now' },
    { type: 'url', id: 'button_link', label: 'Link', default: '/collections/all' },
    {
      type: 'select',
      id: 'alignment',
      label: 'Alignment',
      options: [
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
      ],
      default: 'center',
    },
    { type: 'color_scheme', id: 'color_scheme', label: 'Color scheme', default: 'scheme-1' },
  ],
  presets: [{ name: 'Promo banner', category: 'Banners' }],
  component: PromoBanner,
});
```

That's the only registration step: files in `app/sections/custom/` are picked up by the server
registry (and `/__hcms/manifest`) and by the browser's lazy loader map automatically.
[Register the section](#register-the-section) explains the rules.

**2. Check it.** Run `npx hcms validate`. It loads `app/sections/index.ts` and checks every section
and block schema. Then run `npm run typecheck`, and `npm run dev` to see the storefront locally.

**3. Ship it.** Deploy the storefront (merge to your production branch), then open HydrogenCMS ›
**Storefront** and select **Sync**. "Promo banner" now appears in **Add section** and in the
Component library under **Developer**.

## How a section works

A section is one `defineSection({...})` call. It has two parts:

- **The schema**: plain JSON (`type`, `name`, `settings`, `blocks`, `presets`, …). The storefront
  serves it at `/__hcms/manifest`. Sync copies that manifest into HydrogenCMS, and the editor builds
  its settings panels from it. The schema uses the same names as Online Store section schemas.
- **The code**: a React `component`, plus an optional `query` that asks for Shopify data.

When a page renders, the storefront:

1. loads the published theme (templates, sections, settings),
2. calls every section's and block's `query` and sends them to Shopify as **one** Storefront API
   request,
3. renders each section's `component` with its settings, blocks and its slice of the data.

Each section has its own error boundary. If your component throws, that section renders nothing
on the live store (the editor shows a notice) and the rest of the page still works.

`defineSection` does no validation at runtime, so the browser never downloads the schema
validator. Validation happens with `hcms validate`, in tests, and on the server in development
(see [Test your sections](#test-your-sections)).

## Section anatomy

Everything a section schema can hold:

| Key                         | Required | What it does                                                                                                                                                                                       |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                      | yes      | Unique id: lowercase letters, digits, `-` and `_` (for example `promo-banner`). It is stored in theme data, so don't rename it once merchants use it. Don't reuse an official section's type. |
| `name`                      | yes      | The name merchants see in the editor.                                                                                                                                                              |
| `settings`                  | no       | The settings panel. See [Setting types](#setting-types).                                                                                                                                           |
| `blocks`                    | no       | Blocks merchants can add. See [Blocks](#blocks).                                                                                                                                                   |
| `presets`                   | no       | Starting versions shown in **Add section** and the Component library: `name`, optional `category`, `settings` and `blocks`. Each preset is one entry; add several for different looks.            |
| `limit`                     | no       | Maximum copies of this section in one template.                                                                                                                                                    |
| `max_blocks`                | no       | Maximum blocks in one copy (1–50).                                                                                                                                                                 |
| `enabledOn` / `disabledOn`  | no       | Where the section may go: `{ templates?: [...], groups?: [...] }`. Use one, not both.                                                                                                              |
| `tag`                       | no       | Wrapper element: `section` (default), `div`, `article`, `aside`, `header`, `footer` or `nav`.                                                                                                      |
| `class`                     | no       | Class on the wrapper element.                                                                                                                                                                      |
| `query`                     | no       | Shopify data. See [Shopify data](#shopify-data).                                                                                                                                                   |
| `component`                 | yes      | The React component.                                                                                                                                                                               |

Notes:

- Availability keys are camelCase (`enabledOn`, `disabledOn`), unlike Online Store's
  `enabled_on`. Templates are template types with an optional suffix (`index`, `product`,
  `page.about`), or `'*'` for all. Groups are section group names such as `header`, `footer` and
  `overlay`. A section without either rule can go anywhere.
- `category` belongs on each preset, not on the section. Presets without a category are listed
  under "Other".
- Preset `settings` may only use ids the section defines. `hcms validate` reports anything else.
- The Component library only lists sections that may go on the home page or a regular page, and
  never `main-*` sections (those are the main content of resource pages).

Your component receives `SectionComponentProps`:

| Prop           | What it holds                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `id`           | This copy's id in the template.                                                                  |
| `type`         | The section type.                                                                                |
| `settings`     | Setting values by id (`Record<string, unknown>`; always check the type before you use a value). |
| `blocks`       | Child blocks in the merchant's order (hidden blocks are left out).                               |
| `staticBlocks` | Static blocks by id. See [Static blocks](#static-blocks).                                        |
| `data`         | This section's part of the Storefront response, or `null` without a `query`.                     |

## Setting types

Setting types and their options follow Online Store input settings. Each input setting needs an
`id` and a `label`, and can have `info` (help text under the field) and `visible_if` (an Online
Store condition such as `{{ section.settings.show_button }}`). Ids must be unique in one settings
list. `header` and `paragraph` only add text to the panel and store nothing.

| Type                                                                                                  | Extra options                                              | Value your component gets                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `header`, `paragraph`                                                                                 | `content`                                                  | (nothing stored)                                                                                                         |
| `text`, `textarea`                                                                                    | `default`, `placeholder`                                   | string                                                                                                                   |
| `richtext`, `inline_richtext`                                                                         | `default`                                                  | HTML string (paragraphs and lists for `richtext`, inline tags only for `inline_richtext`)                                |
| `html`                                                                                                | `default`, `placeholder`                                   | HTML string. Sanitize it before rendering (the official `custom-html` section uses `sanitizeHtml` from `@hcms/sections`). |
| `checkbox`                                                                                            | `default` (boolean)                                        | boolean                                                                                                                  |
| `number`                                                                                              | `default`, `placeholder`                                   | number                                                                                                                   |
| `range`                                                                                               | `min`, `max`, `step`, `unit` (≤ 3 chars), `default` (required) | number. At most 101 steps.                                                                                           |
| `select`, `radio`                                                                                     | `options` (`value`, `label`, optional `group`), `default`  | one of the option values                                                                                                 |
| `color`, `color_background`                                                                           | `default` (`color` also `alpha`)                           | CSS color string                                                                                                         |
| `color_scheme`                                                                                        | `default` (scheme id, for example `scheme-1`)              | scheme id. See [Styling](#styling-with-theme-settings).                                                                  |
| `text_alignment`                                                                                      | `default`: `left`, `center` or `right`                     | string                                                                                                                   |
| `font_picker`                                                                                         | `default` (required)                                       | font handle string                                                                                                       |
| `url`                                                                                                 | `default`                                                  | URL or store path string                                                                                                 |
| `link_list`                                                                                           | `default`                                                  | menu handle. Fetch the menu with `menuRequest(handle)` from `@hcms/hydrogen` in your `query`.                            |
| `image_picker`, `video`, `file`                                                                       | none                                                       | `{ $file: 'gid://shopify/…' }`. Turn it into a URL with `useFile(value)` from `@hcms/hydrogen`.                          |
| `video_url`                                                                                           | `accept` (`youtube`, `vimeo`), `placeholder`               | `{ $video_url, provider?, id? }`                                                                                          |
| `product`, `collection`, `page`, `blog`, `article`, `metaobject`                                      | `metaobject_type` (for `metaobject`)                       | resource GID, or a handle when it came from a preset or an import. Handle both in your `query`.                         |
| `product_list`, `collection_list`, `article_list`, `metaobject_list`                                  | `limit` (≤ 50), `metaobject_type` (for `metaobject_list`)  | list of the above                                                                                                        |

The editor also has types the official theme uses (`color_palette`, `color_scheme_group`,
`filter_settings`). You rarely need them in a custom section. There is no `liquid` setting:
storefronts don't run Liquid.

Values stay plain JSON. An image is stored as a Shopify Files reference, never a copy, and resolves
to the current file when the page renders:

```tsx
import { useAppComponents, useFile, type SectionComponentProps } from '@hcms/hydrogen';

function Hero({ settings }: SectionComponentProps) {
  const { Image } = useAppComponents();
  const file = useFile(settings.image);
  return file?.kind === 'image' ? (
    <Image image={file} sizes="100vw" className="h-auto w-full" />
  ) : null;
}
```

## Blocks

Blocks let merchants add, remove and reorder repeated content inside a section. There are two
kinds, as in Online Store.

**Section-local blocks** are defined inside the section with a `name` and `settings`. Only that
section can use them. Your section renders them itself. **Theme blocks** are defined on their own
with `defineBlock` in their own file in `app/sections/custom/blocks/` (file name = type), and can
be used by any section that names them or accepts `@theme`.

`app/sections/examples/feature-list.tsx` (with `app/sections/examples/blocks/badge.tsx`) shows
both, plus a static block. The two files are shown together here; in your storefront they go to
`app/sections/custom/feature-list.tsx` and `app/sections/custom/blocks/badge.tsx`:

```tsx
import {
  HcmsBlocks,
  HcmsStaticBlock,
  defineBlock,
  defineSection,
  type BlockComponentProps,
  type BlockNode,
  type SectionComponentProps,
} from '@hcms/hydrogen';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Theme block: registered on its own, usable by any section that accepts it (or `@theme`). */
function Badge({ settings, attributes }: BlockComponentProps) {
  const label = text(settings.label);
  if (!label) return null;
  return (
    <span {...attributes} className="type-body-sm inline-flex rounded-full border px-3 py-1">
      {label}
    </span>
  );
}

export const badgeBlock = defineBlock({
  type: 'badge',
  name: 'Badge',
  settings: [{ type: 'text', id: 'label', label: 'Label', default: 'New' }],
  presets: [{ name: 'Badge' }],
  component: Badge,
});

/** Section-local block: the section renders it itself (the registry doesn't know it). */
function Feature({ block }: { block: BlockNode }) {
  return (
    <li
      data-hcms-block-id={block.id}
      data-hcms-block-type={block.type}
      data-hcms-local=""
      className="flex flex-col gap-2"
    >
      <h3 className="type-heading-sm">{text(block.settings.title)}</h3>
      <p className="type-body">{text(block.settings.text)}</p>
    </li>
  );
}

function FeatureList({ settings, blocks, staticBlocks }: SectionComponentProps) {
  const heading = text(settings.heading);
  return (
    <div className="max-w-page px-margin mx-auto flex flex-col gap-6 py-12">
      <div className="flex flex-wrap items-center gap-3">
        {heading ? <h2 className="type-heading-lg">{heading}</h2> : null}
        <HcmsStaticBlock block={staticBlocks.badge} />
      </div>
      <ul role="list" className="grid gap-8 md:grid-cols-3">
        {blocks.map((block) =>
          block.type === 'feature' ? (
            <Feature key={block.id} block={block} />
          ) : (
            <li key={block.id}>
              <HcmsBlocks blocks={[block]} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export const featureList = defineSection({
  type: 'feature-list',
  name: 'Feature list',
  max_blocks: 12,
  settings: [{ type: 'text', id: 'heading', label: 'Heading', default: 'Why shop with us' }],
  blocks: [
    {
      type: 'feature',
      name: 'Feature',
      settings: [
        { type: 'text', id: 'title', label: 'Title', default: 'Fast delivery' },
        { type: 'textarea', id: 'text', label: 'Text', default: 'Ships in one business day.' },
      ],
    },
    { type: 'badge', limit: 3 },
  ],
  presets: [
    {
      name: 'Feature list',
      category: 'Text',
      blocks: [
        { type: 'badge', id: 'badge', static: true, settings: { label: 'Why us' } },
        { type: 'feature' },
        { type: 'feature', settings: { title: 'Easy returns', text: '30 days, free.' } },
        { type: 'feature', settings: { title: 'Real support', text: 'People, not bots.' } },
      ],
    },
  ],
  component: FeatureList,
});
```

The `blocks` list of a section (or theme block) accepts:

- `{ type, name, settings, limit? }`: a section-local block.
- `{ type, limit? }`: a theme block by type. It must be registered, or `createRegistry` throws
  "Block references point at unregistered theme blocks".
- `{ type: '@theme' }`: any theme block that isn't private.
- `{ type: '@app' }`: app blocks (Shopify app integrations the storefront supports).

Rules that matter:

- **Render section-local blocks yourself.** `HcmsBlocks` and `HcmsStaticBlock` only render
  registered theme blocks; a section-local block passed to them shows "Block … isn't in this
  storefront's code" in the editor. On the element you render for a local block, put
  `data-hcms-block-id`, `data-hcms-block-type` and `data-hcms-local=""`. The first two let the
  editor select the block; `data-hcms-local` tells the browser not to look for a theme block of
  that type.
- **Spread `attributes` on a theme block's root element.** It carries the same editor attributes
  (like `block.shopify_attributes` in Liquid).
- **Nesting.** A theme block can have its own `blocks` (named, `@theme` or `@app`) and render
  them with `<HcmsBlocks blocks={blocks} />`. Blocks nest up to 3 levels, and a section holds at
  most 50.
- **Private theme blocks.** `private: true` on a `defineBlock` hides it from `@theme` pickers;
  only parents that name it can use it.
- A theme block can have its own `query`. Its data arrives in its `data` prop.

### Static blocks

A static block is placed by the preset, always stays in the section, and can't be removed or
moved by the merchant (Shopify's `{% content_for 'block', id: … %}`). Add it to a preset with
`static: true` and an `id`, and render it where it belongs with
`<HcmsStaticBlock block={staticBlocks.<id>} />`. Static blocks must be theme blocks, and they
aren't part of `blocks`. If the merchant hides it, `staticBlocks.<id>` is undefined and nothing
renders.

## Shopify data

Give a section a `query` when it needs products, collections or other Storefront API data. The
query function receives the section's settings and returns one standalone GraphQL query with its
variables, or `null` when there's nothing to fetch. From
`app/sections/examples/product-spotlight.tsx`:

```tsx
import {
  defineSection,
  useAppComponents,
  useIsPreview,
  type SectionComponentProps,
  type SectionQuery,
} from '@hcms/hydrogen';

type Data = {
  product: {
    handle: string;
    title: string;
    featuredImage: { url: string; altText: string | null; width: number; height: number } | null;
    priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  } | null;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const FIELDS = `handle title
  featuredImage { url altText width height }
  priceRange { minVariantPrice { amount currencyCode } }`;

/** A `product` setting holds a product GID or (from presets and imports) a handle. */
const productSpotlightQuery: SectionQuery = ({ settings }) => {
  const value = text(settings.product);
  if (!value) return null; // nothing picked: no request, `data` is null
  return value.startsWith('gid://shopify/Product/')
    ? {
        query: `query ProductSpotlight($product: ID!) { product(id: $product) { ${FIELDS} } }`,
        variables: { product: value },
      }
    : {
        query: `query ProductSpotlight($product: String!) { product(handle: $product) { ${FIELDS} } }`,
        variables: { product: value },
      };
};

function ProductSpotlight({ settings, data }: SectionComponentProps) {
  const { Image, Link, formatMoney } = useAppComponents();
  const preview = useIsPreview();
  const product = (data as Data | null)?.product ?? null;
  if (!product) {
    // Live: render nothing. Editor: tell the merchant what to do.
    return preview ? (
      <p className="max-w-page px-margin type-body mx-auto py-12">Select a product.</p>
    ) : null;
  }
  return (
    <div className="max-w-page px-margin mx-auto grid items-center gap-8 py-12 md:grid-cols-2">
      {product.featuredImage ? (
        <Image
          image={product.featuredImage}
          sizes="(min-width: 768px) 50vw, 100vw"
          className="h-auto w-full"
        />
      ) : null}
      <div className="flex flex-col gap-3">
        <h2 className="type-heading-lg">{text(settings.heading) || product.title}</h2>
        <p className="type-body-lg">{formatMoney(product.priceRange.minVariantPrice)}</p>
        <Link to={`/products/${product.handle}`} className="type-body underline underline-offset-4">
          View product
        </Link>
      </div>
    </div>
  );
}

export const productSpotlight = defineSection({
  type: 'product-spotlight',
  name: 'Product spotlight',
  settings: [
    { type: 'product', id: 'product', label: 'Product' },
    { type: 'text', id: 'heading', label: 'Heading', info: 'Leave empty to use the product title' },
  ],
  presets: [{ name: 'Product spotlight', category: 'Products' }],
  query: productSpotlightQuery,
  component: ProductSpotlight,
});
```

How it works:

- The storefront merges every section's query on the page into **one** Storefront API request.
  It renames your variables and top-level fields so sections never clash, then gives each section
  its own fields back. Here `data` is `{ product: … }`, exactly the shape your query asked for.
- The request runs in the shopper's market: the storefront adds `@inContext(country, language)`,
  so prices and translations are already right. You may declare `$country` and `$language`
  yourself; they are filled in for you.
- Write one query operation with top-level fields. Fragments are fine, but don't use variables
  inside fragments, and give your fragments unique names: two sections that send different
  fragments with the same name break the whole page's request. Reusing an official fragment
  verbatim (for example `PRODUCT_CARD_FRAGMENT` from `@hcms/sections`) is fine.
- Never fetch inside the component (no `fetch`, no `useEffect` loading). It adds a request per
  section, shows a flash of empty content and slows the page.
- If Shopify returns an error for your part, `data` is `null`. Render nothing (or a hint in the
  editor via `useIsPreview()`), never throw.
- `query` also receives `blocks` (the section's blocks in order, useful when blocks pick
  products), `resource` (the page's product or collection on a resource template) and `route`
  (URL state such as filters and sort on collection pages).
- Use `formatMoney` and `Image` from `useAppComponents()` for prices and Shopify CDN images. They
  follow the shopper's market and the theme's currency format.

Check your query against the Storefront API schema before you ship it, for example with the
GraphiQL explorer (`npm run dev`, then open `/graphiql`).

## Dynamic sources

Merchants can connect many settings to Shopify data in the editor (the "Connect dynamic source"
button), for example a heading to `product.title` or an image to a product metafield. Which
setting types can connect to which metafield types follows the Online Store rules.

You don't write anything for this. The storefront resolves connected values before your
component renders, so `settings.heading` is just a string. One thing to remember: while a
merchant edits a brand-new section in the editor, a connected value can briefly arrive as an
object. Read every setting with a type check (the `text()` helper in the examples), and never
assume a value is a string.

## Styling with theme settings

The storefront uses Tailwind CSS. Classes in your files under `app/` are picked up automatically.
To make a section follow the merchant's Theme settings, use the theme's classes and CSS variables
instead of fixed colors and fonts:

- **Color schemes.** Add a `color_scheme` setting and put `colorSchemeClass(id)` (from
  `@hcms/hydrogen`, it returns `color-<id>`) on your outer element. That class sets the scheme's
  variables, such as `--color-background`, `--color-text` and `--color-button-primary`. Set
  `background-color` and `color` from them, with the template's own tokens as fallbacks, as the
  quick start does.
- **Layout.** `max-w-page` (page width), `px-margin` (side margin) and `mx-auto`.
- **Type.** `type-display`, `type-heading-xl`, `type-heading-lg`, `type-heading-md`,
  `type-heading-sm`, `type-body-lg`, `type-body`, `type-body-sm`, `type-overline`. They follow the
  merchant's fonts and type scale.
- **Buttons.** `button-primary hcms-button hcms-button--primary rounded-button` (or
  `button-secondary … hcms-button--secondary`) picks up the merchant's button styles from Theme
  settings › Styles.
- **Cards and badges.** `hcms-badge` and the named style classes (`hcms-card--style-custom-1`,
  `hcms-badge--…`) are the same hooks the official sections use.

The Component library and the editor preview render with the merchant's real theme, so check your
section there in a few color schemes.

## Register the section

Put the file in the right folder. Nothing else to edit:

| File                                     | Registers                                              |
| ---------------------------------------- | ------------------------------------------------------ |
| `app/sections/custom/<type>.tsx`         | One section (`defineSection({ type: '<type>', … })`)   |
| `app/sections/custom/blocks/<type>.tsx`  | One theme block (`defineBlock({ type: '<type>', … })`) |

`app/sections/custom.ts` collects these files twice from the same folder: the server imports them
eagerly (the registry pages render with, and `/__hcms/manifest`, which Sync reads), and the
browser gets one lazy loader per file, so a page only downloads the sections it shows. Like the
official sections, a section on the first screen loads its code before the page hydrates; one
further down loads it after hydration, when it nears the viewport, while its server HTML
stays on screen. A section that must react the moment the page loads (wherever it sits) sets
`hydrate: 'eager'` in its definition; a fixed overlay that is always "in view" sets
`hydrate: 'idle'` (loads on idle or first interaction).

Rules:

- **One definition per file, and the file name is its `type`.** The browser finds a section's
  code by file name before the code has loaded. A file that exports no definition, two
  definitions, or a definition whose `type` doesn't match the file name stops the storefront
  with an error that names the file (`hcms validate` and `npm run dev` show it first).
- **Helpers go in a subfolder** (for example `app/sections/custom/lib/`) or anywhere else in
  `app/`. Only `.tsx` files directly in `custom/` and `custom/blocks/` are registered.
- A section-local block is part of its section's file; only theme blocks get their own file.
- Keep each file small: it is the lazy chunk the browser downloads for that section.
- Never import `~/sections` (the eager registry) or a file in `app/sections/custom/` from browser
  code such as a component or route module. It would put the section in every page's bundle.
- Duplicate types (with an official section too) throw at startup
  (`Duplicate section type "…"`).

To check the examples without adding them, run
`npx hcms validate --entry app/sections/examples/index.ts`.

## Performance rules

HydrogenCMS keeps storefronts fast (target LCP under 2.5 s, CLS under 0.1). Our own code on a
route stays under 50 KB gzipped on top of React, React Router and Hydrogen. Your sections share
that page, so:

- **Keep client code small.** No large libraries for small effects (carousels, animation, dates).
  Prefer CSS (scroll-snap, `<details>`, transitions) to JavaScript.
- **No `React.lazy` or `import()` inside a section.** A section that suspends during hydration
  un-renders and shifts the page. The registry already loads each section lazily; that is the only
  lazy boundary you need.
- **No data fetching in components.** Use `query` (one batched request per page).
- **Images:** use the adapter's `Image` with a real `sizes` value. Only the first section on a
  page should load its image eagerly (`priority`).
- **Reserve space** for anything that loads later (fixed aspect ratios, min heights) to avoid
  layout shift.
- **Settings stay on the server.** Schemas don't need to reach the browser. For a large section
  you can add a second, schema-free definition next to it in `<type>.browser.tsx` (same `type`,
  `component` and `query`, without `settings`/`blocks`/`presets`). The browser loads that one
  instead; the server keeps the full one. Don't name it `.client.tsx`: React Router removes those
  from the server build.

Measure with `HCMS_ANALYZE=1 npm run build`, then `npm run budgets`. It lists our code and the
total per route, and fails when a route goes over the ceilings in `package.json`. The ceilings are
set for the default sections. If your sections need more room, raise them on purpose, never by
habit.

## Accessibility and right-to-left languages

Sections must meet WCAG 2.2 AA:

- One `h1` per page comes from the page's main content. Section headings start at `h2`.
- Every interactive element works with a keyboard and shows a visible focus ring
  (`focus-visible:outline-2` as in the examples). Touch targets are at least 44 px (`min-h-11`).
- Images need alt text: `Image` uses the file's alt text from Shopify Files. Decorative images get
  `alt=""`.
- Text and backgrounds must contrast in every color scheme the merchant can pick.
- Don't hard-code shopper-facing text in components. Make it a setting with a default, so
  merchants can change and translate it.

Storefronts can run in right-to-left languages (Arabic, Hebrew); the root element gets
`dir="rtl"`. Use logical Tailwind utilities so your layout flips by itself:

| Use                                   | Instead of                         |
| ------------------------------------- | ---------------------------------- |
| `ms-*` / `me-*`, `ps-*` / `pe-*`      | `ml-*` / `mr-*`, `pl-*` / `pr-*`   |
| `start-*` / `end-*`                   | `left-*` / `right-*`               |
| `text-start` / `text-end`             | `text-left` / `text-right`         |
| `border-s` / `border-e`, `rounded-s`  | `border-l` / `border-r`, `rounded-l` |

Mirror directional icons (← →) with `rtl:-scale-x-100`.

## Test your sections

**Schema check.** `npx hcms validate` checks every section and block in `app/sections/index.ts`
(official ones plus everything in `app/sections/custom/`) and exits with code 1 on problems, so you can run it in CI. `--json` gives machine-readable
output. To check a different registry module, pass `--entry`:

```bash
npx hcms validate --entry app/sections/examples/index.ts
```

In development (`npm run dev`) the storefront also validates every definition on the server the
first time it renders a page, and throws an error listing the problems.

**Unit tests.** `validateDefinitions` from `@hcms/hydrogen` is the same check in code. It throws
an error whose `details.issues` lists each problem (`definition`, `path`, `message`). The
template's `npm test` runs `node --test` with type stripping, which can't load `.tsx` files, so
test schemas from a `.ts` file:

```ts
// __test__/promo-banner-schema.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { defineSection, validateDefinitions } from '@hcms/hydrogen';

const promoBanner = defineSection({
  type: 'promo-banner',
  name: 'Promo banner',
  settings: [{ type: 'text', id: 'heading', label: 'Heading', default: 'Hello' }],
  presets: [{ name: 'Promo banner', category: 'Banners' }],
  component: () => null, // the schema check ignores the component
});

test('promo banner schema is valid', () => {
  assert.doesNotThrow(() => validateDefinitions({ sections: [promoBanner] }));
});

test('presets may only use settings the section defines', () => {
  assert.throws(() =>
    validateDefinitions({
      sections: [{ ...promoBanner, presets: [{ name: 'Bad', settings: { nope: 1 } }] }],
    }),
  );
});
```

For component tests, a runner with JSX support (Vitest) works; render the component with a
`settings` object and `data: null`, plus sample data for sections with a query.

**In the browser.** Check the section in `npm run dev` with long and empty text, no image, every
color scheme, a phone width, and keyboard only.

## Ship it: deploy, then Sync

The theme editor offers exactly the sections the **deployed** storefront can render.

1. Deploy: merge your change to the branch Shopify deploys to Oxygen (or run `npm run deploy`).
2. Wait until the deployment finishes.
3. In HydrogenCMS, open **Storefront** and select **Sync** in the Sections card. Sync reads
   `/__hcms/manifest` from your production storefront and reports what's new.

HydrogenCMS also checks the deployed storefront on its own. When it finds sections that aren't
synced yet, the status bar shows "Your storefront has 1 new section (Promo banner). Sync so the
editor can use them." A background job syncs regularly as well.

After Sync:

- **Add section** lists your section with its presets.
- The **Component library** lists each preset under its category with the **Developer** source,
  rendered with the merchant's theme. Merchants can filter by **Developer**.
- Merchants can save configured copies of it as their own components.

`npx hcms push` uploads the manifest straight from your machine (it validates first;
`--dry-run` shows what would change). It replaces the synced manifest, so only use it for code
that is already deployed: sections that aren't deployed show a placeholder in the editor and
render nothing on the live store. The next Sync replaces it with the deployed manifest anyway.

## Preview without deploying: `hcms dev`

While you build, `hcms dev` shows your work-in-progress sections in the merchant's editor without
touching what is published.

1. In HydrogenCMS › **Settings › Developer tokens**, create a token (publishers and admins can).
   It starts with `hcms_dt_` and is shown once.
2. Add these to your shell or the storefront's `.env` (never commit it):

   ```sh
   HCMS_DEV_TOKEN=hcms_dt_…
   HCMS_SHOP=your-store.myshopify.com   # or PUBLIC_STORE_DOMAIN
   HCMS_ADMIN_URL=https://…             # or HCMS_API_URL, already set on the template
   ```

3. Run `npx hcms dev`. It starts the storefront's `dev` script and, every time you save a file
   under `app/`, validates the registry and pushes a **dev** manifest.

The editor then lists your sections and their settings panels, so you can add them and check
the settings. The dev manifest only affects the editor: publishing never uses it, and it expires
8 hours after the last push. Ctrl-C removes it.

The editor's preview frame shows the connected storefront. Until your code is deployed there, a
new section shows a "Section … isn't in this storefront's code yet" placeholder in the preview.
Check the rendering itself on your local server (`npm run dev`, which uses Shopify's demo store
without a `.env`).

Without a token, `npx hcms dev --offline` still re-validates on every save. A token can only
update section definitions for its own store; it never gives access to the Admin API. Revoke it
when the work is done.

## Troubleshooting

| What you see                                                                                       | Why, and what to do                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The section isn't in **Add section** or the Component library.                                    | Deploy, then **Sync**. In the Component library, also check that the section may go on the home page or a regular page (`enabledOn`/`disabledOn`) and that its type doesn't start with `main-`.                                |
| Editor preview: "Section … isn't in this storefront's code yet".                                   | The editor knows the section (Sync or `hcms dev`), but the storefront the preview shows doesn't have the code. Deploy it.                                                                                                       |
| The section renders, then disappears when the page finishes loading. | The browser has no loader for it: the file isn't directly in `app/sections/custom/` (theme blocks: `custom/blocks/`), or the section was added to `sectionDefinitions` by hand. Move the file into the folder and remove the manual import. |
| Startup error: `app/sections/custom/… defines type "…", but the file name says "…"` (or "exports no section or block definition"). | Each file in `custom/` holds exactly one definition named after the file. Rename the file to the type, and move helpers into a subfolder. |
| Editor preview: "Block … isn't in this storefront's code".                                         | A section-local block was passed to `HcmsBlocks` (render it yourself), or the theme block's file isn't in `app/sections/custom/blocks/`.                                                                     |
| "Block references point at unregistered theme blocks" at startup.                                  | A `blocks` entry names a theme block type that isn't an official block or a file in `app/sections/custom/blocks/`. Add the block there, or give the entry a `name` and `settings` to make it section-local.                                                            |
| `hcms validate` lists problems.                                                                    | Each line has the definition, the path (for example `settings.2.default`) and the reason. Common ones: a `default` outside the `options` or the range, a duplicate setting id, a preset using a setting the section doesn't have. |
| Importing components: "Your storefront doesn't have this section yet — deploy it, then Sync".      | The file uses a section type the storefront doesn't have. Deploy the section, select **Sync**, then import again.                                                                                                                |
| Publish fails with "Unknown section type".                                                         | A template uses a section the synced storefront no longer has. Deploy the code again and Sync, or remove the section from the template.                                                                                         |
| After publish: "old setting(s) that sections no longer use were left out of this version".         | You removed or renamed a setting id. Publishing drops values of settings a section no longer defines (as Online Store does). Keep setting ids stable; add new ids instead of renaming.                                           |
| Status bar: "Your storefront has … new sections. Sync so the editor can use them."                | A deployment added sections that aren't synced yet. Select **Sync**.                                                                                                                                                            |
| Sync reports "Themes use sections your storefront no longer has: …".                               | You removed a section that merchants still use. Put it back, or ask them to remove it from their templates first.                                                                                                              |
| `data` is always `null`.                                                                           | The query returned `null` (nothing picked), or Shopify returned an error for it. Run the query in GraphiQL with the same variables.                                                                                              |
| Prices or translations are in the wrong market.                                                    | Don't build your own client or request; use `query`, which runs in the shopper's market.                                                                                                                                        |

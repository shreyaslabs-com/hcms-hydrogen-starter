import { colorSchemeClass, useAppComponents } from '@hcms/hydrogen';
import {
  COLLECTION_CARD_FRAGMENT,
  CollectionCard,
  FreeShippingBar,
  PRODUCT_CARD_FRAGMENT,
  ProductCard,
  type ProductCardData,
} from '@hcms/sections';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useRouteLoaderData } from 'react-router';

import styleGuideHref from '~/style-guide.css?url';
import { MarketSuggestionBanner } from '~/components/MarketSuggestionBanner';
import { documentContext } from '~/lib/hcms/document';
import { cachedDemoClient, samplePack } from '~/lib/hcms/library';
import { throwNotFound } from '~/lib/hcms/not-found';
import {
  STYLE_GUIDE_QUERY_BODY,
  buildStyleGuide,
  cardSamples,
  styleSectionId,
  type CardSamples,
  type Money,
  type SampleArticle,
  type StyleCategoryId,
  type StyleGuide,
  type TokenRow,
} from '~/lib/hcms/style-guide';
import { marketContext } from '~/lib/localization';
import { previewContext } from '~/lib/preview';
import {
  createDemoStorefrontClient,
  storefrontClientContext,
  type RequestStorefrontClient,
} from '~/lib/storefront';

import type { Route } from './+types/styles';

/**
 * `/{market?}/__hcms/styles` (T-2.85 follow-up): the editor's Theme settings preview. A style
 * guide: one specimen per Theme settings category, rendered with the draft's real theme CSS and
 * the sections' own components, so a font, colour or button change shows after the preview
 * reloads. Each specimen sits in `[data-hcms-section-id="__lib-style-<id>"]`: the editor selects,
 * scrolls to and outlines them through the preview bridge. Shoppers get the 404 page.
 */
export function meta() {
  return [{ title: 'Style guide' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function links() {
  return [{ rel: 'stylesheet', href: styleGuideHref }];
}

const EMPTY_SAMPLES: CardSamples = { products: [], collections: [], articles: [] };

/** One request (the sections' card fragments verbatim); `null` when it fails or is empty. */
async function loadCardSamples(client: RequestStorefrontClient): Promise<CardSamples | null> {
  const query = `${STYLE_GUIDE_QUERY_BODY}\n${PRODUCT_CARD_FRAGMENT}\n${COLLECTION_CARD_FRAGMENT}`;
  try {
    const { data } = (await client.graphql(query as never)) as { data?: unknown };
    const samples = cardSamples(data);
    return samples.products.length ? samples : null;
  } catch {
    return null;
  }
}

export async function loader({ context, request }: Route.LoaderArgs) {
  if (!context.get(previewContext)) return throwNotFound(context, request);
  const { settings } = context.get(documentContext).document;
  const { market, localization } = context.get(marketContext);
  const currency =
    localization.availableCountries.find((c) => c.isoCode === market.country)?.currency.isoCode ??
    'USD';
  // Demo catalogue (mock.shop) first: varied, pictured products; the store's own as the fallback.
  const demo = cachedDemoClient(
    createDemoStorefrontClient(request, context.cache, context.waitUntil),
    context.cache,
    context.waitUntil,
  );
  const samples =
    (await loadCardSamples(demo)) ??
    (await loadCardSamples(context.get(storefrontClientContext))) ??
    EMPTY_SAMPLES;
  // HCMS sample pack (admin-served photos) for the image slots: banners, lifestyle, editorial.
  const pack = samplePack(context.get(previewContext)?.claims.editorOrigin);
  const pictures: Pictures = {
    banner: toPictures(pack.banner),
    lifestyle: toPictures(pack.lifestyle),
    editorial: toPictures(pack.editorial),
  };
  return { guide: buildStyleGuide(settings, { currency }), samples, currency, pictures };
}

type RootData = { currency?: string; theme?: { flags?: { currencyCode?: boolean } } };

/** Sample links never navigate the preview away from the guide. */
const keepOnPage = (event: MouseEvent) => {
  if ((event.target as Element).closest('a[href]')) event.preventDefault();
};

export default function StyleGuideRoute({ loaderData }: Route.ComponentProps) {
  const { guide, samples, currency, pictures } = loaderData;
  const stage = guide.schemes[0]?.id ? colorSchemeClass(guide.schemes[0].id) : '';
  const specimens: Record<StyleCategoryId, ReactNode> = {
    colors: <ColorsSpecimen guide={guide} />,
    typography: <TypographySpecimen guide={guide} />,
    layout: <LayoutSpecimen guide={guide} />,
    animations: <AnimationsSpecimen guide={guide} picture={pictures.lifestyle[0]} />,
    icons: <IconsSpecimen guide={guide} />,
    buttons: <ButtonsSpecimen guide={guide} />,
    variant_pills: <PillsSpecimen />,
    inputs: <InputsSpecimen />,
    product_cards: <ProductCardsSpecimen samples={samples} />,
    collection_cards: <CollectionCardsSpecimen samples={samples} />,
    blog_cards: <BlogCardsSpecimen articles={samples.articles} pictures={pictures.editorial} />,
    content_containers: <ContentSpecimen picture={pictures.banner[0]} samples={samples} />,
    media: (
      <MediaSpecimen image={pictures.lifestyle[1]} poster={pictures.banner[1]} samples={samples} />
    ),
    popups: <PopupsSpecimen />,
    drawers: <DrawerSpecimen samples={samples} currency={currency} />,
    badges: <BadgesSpecimen guide={guide} samples={samples} />,
    currency_format: <CurrencySpecimen samples={samples} currency={currency} />,
    styles: <StylesSpecimen guide={guide} />,
    cart: <CartSpecimen guide={guide} />,
    markets: <MarketsSpecimen guide={guide} />,
    custom_css: <CustomCssSpecimen guide={guide} />,
  };
  return (
    <main className="sg flex-1" id="main-content" tabIndex={-1} onClickCapture={keepOnPage}>
      <header className="sg-intro">
        <div className="sg-wrap">
          <span className="sg-eyebrow">Theme settings</span>
          <h1 className="sg-title">Style guide</h1>
          <p className="sg-lede">
            Every theme setting, shown live. Change something in Theme settings and this page
            follows.
          </p>
        </div>
      </header>
      <nav className="sg-nav" aria-label="Theme settings categories">
        <div className="sg-wrap sg-chips">
          {guide.categories.map((c) => (
            <a key={c.id} className="sg-chip" href={`#sg-${c.id}`}>
              {editedCount(guide, c.id) ? <span className="sg-dot" aria-hidden="true" /> : null}
              {c.label}
              {editedCount(guide, c.id) ? <span className="sr-only"> (changed)</span> : null}
            </a>
          ))}
        </div>
      </nav>
      <div className="sg-wrap sg-list">
        {guide.categories.map((c) => {
          const values = guide.values[c.id as keyof StyleGuide['values']];
          return (
            <section
              key={c.id}
              id={`sg-${c.id}`}
              className="sg-cat"
              data-hcms-section-id={styleSectionId(c.id)}
              aria-labelledby={`sg-${c.id}-h`}
            >
              <div className="sg-cat-head">
                <h2 id={`sg-${c.id}-h`}>{c.label}</h2>
                <p>{c.blurb}</p>
                {editedCount(guide, c.id) ? (
                  <p className="sg-cat-edited">
                    <span className="sg-dot" aria-hidden="true" />
                    {plural(editedCount(guide, c.id), 'setting')} changed in Theme settings
                  </p>
                ) : null}
              </div>
              <div className={`sg-cat-body${values?.length ? ' sg-cat-body--values' : ''}`}>
                <div className={`sg-stage ${stage}`} style={STAGE_STYLE}>
                  {specimens[c.id]}
                </div>
                {values?.length ? <Values rows={values} /> : null}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

/** Values of a category set in Theme settings (the dotted rows of its Current values). */
const editedCount = (guide: StyleGuide, id: string) =>
  (guide.values[id as keyof StyleGuide['values']] ?? []).filter((row) => row.edited).length;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Scheme surface like a section's `schemeProps` (the first scheme = most sections' default). */
const STAGE_STYLE: CSSProperties = {
  backgroundColor: 'var(--color-background, var(--color-surface))',
  color: 'var(--color-text, var(--color-on-surface))',
};

function Values({ rows }: { rows: TokenRow[] }) {
  return (
    <aside className="sg-values" aria-label="Current values">
      <h3>Current values</h3>
      <dl>
        {rows.map((row) => (
          <div key={row.id} className={row.edited ? 'is-edited' : undefined}>
            <dt>{row.label}</dt>
            <dd>
              {row.value}
              {row.edited ? <span className="sr-only"> (changed)</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="sg-values-note">
        <span className="sg-dot" aria-hidden="true" /> Set in Theme settings · Default = your
        store’s own look
      </p>
    </aside>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="sg-note">{children}</p>;

const BUTTON_SHAPE = 'inline-flex min-h-11 items-center justify-center px-6 text-sm rounded-button';

function SampleButton({ className, label }: { className: string; label: string }) {
  return <span className={`${BUTTON_SHAPE} ${className}`}>{label}</span>;
}

function ColorsSpecimen({ guide }: { guide: StyleGuide }) {
  if (!guide.schemes.length)
    return <Note>No color schemes yet. Add one in Theme settings › Colors.</Note>;
  return (
    <div className="sg-schemes">
      {guide.schemes.map((scheme) => (
        <div key={scheme.id} className={`sg-scheme ${scheme.className}`} style={STAGE_STYLE}>
          <div className="sg-scheme-page">
            <p className="type-overline">{scheme.name}</p>
            <p className="type-heading-md">Heading on {scheme.name}</p>
            <p className="type-body-sm">
              Body text reads like this, with{' '}
              <a href="#sg-colors" className="underline underline-offset-4">
                a link
              </a>{' '}
              in the same color.
            </p>
            <div className="flex flex-wrap gap-2">
              <SampleButton
                className="button-primary hcms-button hcms-button--primary"
                label="Primary"
              />
              <SampleButton
                className="button-outline hcms-button hcms-button--secondary"
                label="Secondary"
              />
            </div>
            <label className="sg-field">
              <span className="text-sm">Email</span>
              <input type="email" placeholder="you@example.com" className="w-full px-3 py-2" />
            </label>
          </div>
          <ul className="sg-swatches" aria-label={`${scheme.name} colors`}>
            {scheme.colors.map((c) => (
              <li key={c.role}>
                <span className="sg-swatch" style={{ background: c.value }} aria-hidden="true" />
                <span>
                  <b>{c.label}</b>
                  <code>{c.value}</code>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const PANGRAM = 'The quick brown fox jumps over the lazy dog.';

function TypographySpecimen({ guide }: { guide: StyleGuide }) {
  return (
    <div className="sg-stack">
      <div className="sg-fonts">
        {guide.fonts.map((font) => (
          <div key={font.role} className="sg-font">
            <span
              className="sg-font-aa"
              style={{ fontFamily: `var(--font-${font.role})` }}
              aria-hidden="true"
            >
              Aa
            </span>
            <div>
              <p className="sg-label">{font.role === 'heading' ? 'Heading font' : 'Body font'}</p>
              <p className="sg-font-name">{font.family}</p>
              <p className="sg-meta">
                {font.set
                  ? `${font.weight} · ${font.style === 'italic' ? 'Italic' : 'Regular'} · ${font.source}`
                  : 'Pick one in Theme settings › Typography'}
              </p>
            </div>
          </div>
        ))}
      </div>
      <ol className="sg-scale">
        {guide.typeScale.map((step) => (
          <li key={step.className}>
            <span className="sg-meta">
              {step.label} · {step.px}px
            </span>
            <span className={`${step.className} sg-scale-text`}>
              {step.heading ? 'Made for everyday' : PANGRAM}
            </span>
          </li>
        ))}
      </ol>
      <div className="sg-prose">
        <p className="type-body">
          Body copy sits in the body font at the body size. Good product pages answer questions
          before they are asked: what it is made of, how it fits and when it arrives.
        </p>
        <blockquote className="type-heading-md sg-quote">
          “The best thing I bought this year. It still looks new.”
        </blockquote>
      </div>
      <div className="sg-presets">
        <p className="sg-label">Typography presets</p>
        {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'paragraph'] as const).map((id) => (
          <p key={id} className={`type-preset-${id}`}>
            <span className="sg-meta sg-preset-id">
              {id === 'paragraph' ? 'Paragraph' : id.toUpperCase()}
            </span>
            {id === 'paragraph' ? PANGRAM : 'Crafted to last'}
          </p>
        ))}
      </div>
    </div>
  );
}

function LayoutSpecimen({ guide }: { guide: StyleGuide }) {
  const width = guide.values.layout?.find((r) => r.id === 'page_width')?.value ?? '1200px';
  const share = Math.min(100, Math.max(40, (parseInt(width, 10) / 1600) * 100));
  return (
    <div className="sg-stack">
      <div className="sg-viewport" aria-label={`Page width ${width}`}>
        <div className="sg-page" style={{ inlineSize: `${share}%` }}>
          <span>Page width · {width}</span>
          <div className="sg-margin">
            <span className="sg-meta">Content, with the side margin either side</span>
          </div>
        </div>
      </div>
      <div className="sg-sections" aria-label="Space between sections">
        <div className="sg-block">Section</div>
        <div className="sg-gap">
          <span className="sg-meta">Space between sections</span>
        </div>
        <div className="sg-block">Section</div>
      </div>
      <ul className="hcms-grid grid grid-cols-2 md:grid-cols-4" aria-label="Grid spacing">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="sg-tile rounded-card">
            {i + 1}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnimationsSpecimen({ guide, picture }: { guide: StyleGuide; picture?: Picture }) {
  const { reveal, hover } = guide.animations;
  return (
    <div className="sg-split">
      <div className="sg-stack">
        <p className="type-body-sm">
          <b>Reveal sections on scroll</b> is {reveal ? 'on' : 'off'}: sections fade up as shoppers
          scroll to them. It is paused in this preview so nothing hides while you edit.
        </p>
        <p className="type-body-sm">
          <b>Hover effect</b>:{' '}
          {hover === '3d-lift' ? '3D lift' : hover === 'vertical-lift' ? 'Vertical lift' : 'None'}.
          Point at the card and the button to try it.
        </p>
        <span>
          <SampleButton
            className="button-primary hcms-button hcms-button--primary"
            label="Hover me"
          />
        </span>
      </div>
      <div className="hcms-card hcms-card--product sg-hover-card">
        <div className="sg-tile rounded-card overflow-hidden" aria-hidden="true">
          <Picture picture={picture} ratio={1} />
        </div>
        <div className="hcms-card__info">
          <p className="type-body-sm font-medium">Hover this card</p>
          <p className="text-on-surface-secondary text-sm">It lifts with the theme’s effect</p>
        </div>
      </div>
    </div>
  );
}

const HEADER_ICONS = ['search', 'account', 'cart'] as const;
const PRODUCT_ICONS = ['truck', 'return', 'lock', 'leaf', 'heart'] as const;

/** Real masks: `<html>` carries the theme's `hcms-icons--*` class, so they follow the setting. */
function IconsSpecimen({ guide }: { guide: StyleGuide }) {
  const { stroke } = guide.icons;
  return (
    <div className="sg-stack">
      <p className="type-body-sm">
        <b>Icon stroke</b>: {stroke === 'thin' ? 'Thin' : stroke === 'heavy' ? 'Heavy' : 'Default'}.
        Header icons and product icons use it; custom icon images keep their own look.
      </p>
      <div className="flex flex-wrap items-center gap-6" aria-hidden="true">
        {HEADER_ICONS.map((name) => (
          <span key={name} className="hcms-mask-icon size-6" data-hcms-header-icon={name} />
        ))}
        {PRODUCT_ICONS.map((name) => (
          <span key={name} className="hcms-icon size-6" data-hcms-icon={name} />
        ))}
      </div>
    </div>
  );
}

const ARROW = (
  <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
    →
  </span>
);

function ButtonsSpecimen({ guide }: { guide: StyleGuide }) {
  return (
    <table className="sg-table">
      <thead>
        <tr>
          <th scope="col">Style</th>
          <th scope="col">Default</th>
          <th scope="col">Hover</th>
          <th scope="col">With icon</th>
          <th scope="col">Disabled</th>
        </tr>
      </thead>
      <tbody>
        {guide.buttons.map((b) => {
          const base =
            b.id === 'link'
              ? `inline-flex min-h-11 items-center text-sm ${b.className}`
              : `${BUTTON_SHAPE} ${b.className}`;
          return (
            <tr key={b.id}>
              <th scope="row">
                {b.label}
                {b.custom ? <span className="sg-meta"> · Custom</span> : null}
              </th>
              <td>
                <span className={base}>Shop now</span>
              </td>
              <td>
                <span className={`${base} sg-hover`}>Shop now</span>
              </td>
              <td>
                <span className={`${base} gap-2`}>Shop now {ARROW}</span>
              </td>
              <td>
                <span className={`${base} opacity-60`} aria-disabled="true">
                  Sold out
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PillsSpecimen() {
  const sizes = ['XS', 'S', 'M', 'L', 'XL'];
  return (
    <div className="sg-stack">
      <fieldset className="sg-fieldset">
        <legend className="text-sm font-medium">Size</legend>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={size === 'M'}
              disabled={size === 'XL'}
              className={`option-pill${size === 'M' ? ' is-selected' : ''}${size === 'XL' ? ' opacity-60' : ''}`}
            >
              <span className={size === 'XL' ? 'line-through' : undefined}>{size}</span>
              {size === 'XL' ? <span className="sr-only"> (Sold out)</span> : null}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="sg-meta">Selected: M · Sold out: XL · Hover any other size.</p>
    </div>
  );
}

function InputsSpecimen() {
  return (
    <div className="sg-form">
      <label className="sg-field">
        <span className="text-sm font-medium">Name</span>
        <input type="text" defaultValue="Alex Rivera" className="w-full px-3 py-2" />
      </label>
      <label className="sg-field">
        <span className="text-sm font-medium">Email</span>
        <input type="email" placeholder="you@example.com" className="w-full px-3 py-2" />
      </label>
      <label className="sg-field">
        <span className="text-sm font-medium">Country</span>
        <select className="w-full px-3 py-2" defaultValue="ca">
          <option value="ca">Canada</option>
          <option value="us">United States</option>
        </select>
      </label>
      <label className="sg-field">
        <span className="text-sm font-medium">Message</span>
        <textarea rows={3} className="w-full px-3 py-2" placeholder="How can we help?" />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" defaultChecked className="accent-interactive size-5 shrink-0" />
        Email me with news and offers
      </label>
      <div className="sg-field">
        <span className="text-sm font-medium" id="sg-qty">
          Quantity
        </span>
        <div
          className="quantity-selector-outlined rounded-input inline-flex items-center self-start"
          role="group"
          aria-labelledby="sg-qty"
        >
          <span className="inline-flex size-11 items-center justify-center" aria-hidden="true">
            −
          </span>
          <span className="min-w-8 text-center text-sm">1</span>
          <span className="inline-flex size-11 items-center justify-center" aria-hidden="true">
            +
          </span>
        </div>
      </div>
    </div>
  );
}

const CARD_SIZES = '(min-width: 768px) 25vw, 50vw';

function ProductCardsSpecimen({ samples }: { samples: CardSamples }) {
  if (!samples.products.length)
    return (
      <Note>Product samples could not load. Your own product grids still use these settings.</Note>
    );
  return (
    <ul className="hcms-grid grid grid-cols-2 md:grid-cols-3">
      {samples.products.map((p) => (
        <li key={p.id}>
          <ProductCard
            product={p as ProductCardData}
            options={{ sizes: CARD_SIZES, showVendor: true, showSecondaryImage: true }}
          />
        </li>
      ))}
    </ul>
  );
}

function CollectionCardsSpecimen({ samples }: { samples: CardSamples }) {
  const list = samples.collections.length ? samples.collections : [null, null, null];
  return (
    <ul className="hcms-grid grid grid-cols-2 md:grid-cols-3">
      {list.map((c, i) => (
        <li key={c?.id ?? i}>
          <CollectionCard collection={c} sizes={CARD_SIZES} />
        </li>
      ))}
    </ul>
  );
}

const SAMPLE_ARTICLES: SampleArticle[] = [
  {
    id: 'a1',
    handle: 'care-guide',
    title: 'How to care for your favourite pieces',
    excerpt: 'Five habits that keep fabrics soft and colours bright, wash after wash.',
  },
  {
    id: 'a2',
    handle: 'behind-the-seams',
    title: 'Behind the seams: meet our makers',
    excerpt: 'A morning in the studio where every order is cut, sewn and packed.',
  },
  {
    id: 'a3',
    handle: 'season-edit',
    title: 'The season edit',
    excerpt: 'Layers, colours and the one jacket worth the space in your suitcase.',
  },
];

function BlogCardsSpecimen({
  articles,
  pictures,
}: {
  articles: SampleArticle[];
  pictures: Picture[];
}) {
  const { Image } = useAppComponents();
  const list = articles.length ? articles : SAMPLE_ARTICLES;
  return (
    <ul className="hcms-grid grid grid-cols-1 md:grid-cols-3">
      {list.map((a, i) => (
        <li key={a.id}>
          <article className="hcms-card hcms-card--blog group relative flex flex-col gap-3">
            <div className="rounded-card bg-surface-secondary aspect-[3/2] overflow-hidden">
              {a.image ? (
                <Image
                  image={a.image}
                  alt={a.image.altText ?? ''}
                  sizes={CARD_SIZES}
                  aspectRatio={1.5}
                  className="h-full w-full object-cover"
                />
              ) : (
                // Articles without an image (mock.shop has none): a sample pack photo.
                <Picture picture={pictures[i % Math.max(pictures.length, 1)]} ratio={1.5} />
              )}
            </div>
            <div className="hcms-card__info flex flex-col gap-2">
              <h3 className="type-heading-md">
                <a
                  href={`/blogs/${a.blog?.handle ?? 'news'}/${a.handle}`}
                  className="hover:underline"
                >
                  {a.title}
                </a>
              </h3>
              <p className="text-on-surface-secondary text-sm">
                {a.authorV2?.name ?? 'The team'}
                {a.publishedAt ? ` · ${a.publishedAt.slice(0, 10)}` : ''}
              </p>
              {a.excerpt ? (
                <p className="type-body text-on-surface-secondary line-clamp-3">{a.excerpt}</p>
              ) : null}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

const firstImage = (samples: CardSamples, index = 0) =>
  samples.products.filter((p) => p.featuredImage)[index]?.featuredImage ?? null;

type Picture = { url: string; width: number; height: number; altText?: string };
type Pictures = { banner: Picture[]; lifestyle: Picture[]; editorial: Picture[] };
const toPictures = (list?: { url: string; width: number; height: number; alt?: string }[]) =>
  (list ?? []).map((p) => ({ url: p.url, width: p.width, height: p.height }));

/** A sample pack photo, cropped to `ratio` (decorative: alt ""). */
function Picture({ picture, ratio }: { picture?: Picture | undefined; ratio: number }) {
  const { Image } = useAppComponents();
  return picture ? (
    <Image
      image={picture}
      alt=""
      sizes="(min-width: 768px) 50vw, 100vw"
      aspectRatio={ratio}
      className="h-full w-full object-cover"
    />
  ) : null;
}

function SampleImage({
  samples,
  index = 0,
  ratio,
}: {
  samples: CardSamples;
  index?: number;
  ratio: number;
}) {
  const { Image } = useAppComponents();
  const image = firstImage(samples, index);
  return image ? (
    <Image
      image={image}
      alt=""
      sizes="(min-width: 768px) 50vw, 100vw"
      aspectRatio={ratio}
      className="h-full w-full object-cover"
    />
  ) : null;
}

function ContentSpecimen({ samples, picture }: { samples: CardSamples; picture?: Picture }) {
  return (
    <div className="sg-banner rounded-card">
      <div className="sg-banner-media" aria-hidden="true">
        {picture ? (
          <Picture picture={picture} ratio={2} />
        ) : (
          <SampleImage samples={samples} ratio={2} />
        )}
      </div>
      <div className="hcms-text-box sg-text-box" style={STAGE_STYLE}>
        <p className="type-heading-lg">New season, new favourites</p>
        <p className="type-body-sm">Text boxes like this sit over banners, slides and images.</p>
        <SampleButton
          className="button-primary hcms-button hcms-button--primary"
          label="Shop now"
        />
      </div>
    </div>
  );
}

function MediaSpecimen({
  samples,
  image,
  poster,
}: {
  samples: CardSamples;
  image?: Picture;
  poster?: Picture;
}) {
  return (
    <div className="sg-split">
      <figure className="sg-figure">
        <div className="hcms-media rounded-card bg-surface-secondary aspect-[4/3] overflow-hidden">
          {image ? (
            <Picture picture={image} ratio={4 / 3} />
          ) : (
            <SampleImage samples={samples} index={1} ratio={4 / 3} />
          )}
        </div>
        <figcaption className="sg-meta">Image</figcaption>
      </figure>
      <figure className="sg-figure">
        <div className="hcms-media rounded-card sg-video aspect-video overflow-hidden">
          {poster ? (
            <Picture picture={poster} ratio={16 / 9} />
          ) : (
            <SampleImage samples={samples} index={2} ratio={16 / 9} />
          )}
          <span className="sg-play" aria-hidden="true">
            ▶
          </span>
        </div>
        <figcaption className="sg-meta">Video</figcaption>
      </figure>
    </div>
  );
}

function PopupsSpecimen() {
  return (
    <div className="sg-split" inert>
      <div className="sg-stack">
        <p className="text-sm font-medium">
          Shop <span aria-hidden="true">▾</span>
        </p>
        <div className="nav-dropdown-inner sg-dropdown">
          {['New arrivals', 'Best sellers', 'Accessories', 'Gift cards'].map((item) => (
            <span key={item} className="nav-dropdown-item">
              {item}
            </span>
          ))}
        </div>
      </div>
      <div className="hcms-popup sg-popup bg-surface text-on-surface">
        <span className="sg-close" aria-hidden="true">
          ×
        </span>
        <p className="type-heading-md">Get 10% off</p>
        <p className="type-body-sm text-on-surface-secondary">Join the list for early access.</p>
        <input type="email" placeholder="Email" className="w-full px-3 py-2" aria-label="Email" />
        <SampleButton
          className="button-primary hcms-button hcms-button--primary"
          label="Subscribe"
        />
      </div>
    </div>
  );
}

function DrawerSpecimen({ samples, currency }: { samples: CardSamples; currency: string }) {
  const { formatMoney, Image } = useAppComponents();
  const lines = samples.products.slice(0, 2);
  const subtotal = lines.reduce((sum, p) => sum + Number(p.priceRange.minVariantPrice.amount), 0);
  const code = lines[0]?.priceRange.minVariantPrice.currencyCode ?? currency;
  return (
    <div className="sg-drawer-stage" inert>
      <div className="sg-backdrop" aria-hidden="true" />
      <div className="drawer-right sg-drawer bg-surface text-on-surface">
        <div className="sg-drawer-head">
          <p className="type-heading-sm">Your cart</p>
          <span aria-hidden="true">×</span>
        </div>
        <ul className="sg-drawer-lines">
          {lines.map((p) => (
            <li key={p.id}>
              <div className="rounded-card bg-surface-secondary sg-thumb overflow-hidden">
                {p.featuredImage ? (
                  <Image
                    image={p.featuredImage}
                    alt=""
                    sizes="64px"
                    aspectRatio={1}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div>
                <p className="text-sm font-medium">{p.title}</p>
                <p className="text-sm">{formatMoney(p.priceRange.minVariantPrice)}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="sg-drawer-foot">
          <p className="flex justify-between text-sm">
            <span>Subtotal </span>
            <b>{formatMoney({ amount: subtotal.toFixed(2), currencyCode: code })}</b>
          </p>
          <SampleButton
            className="button-primary hcms-button hcms-button--primary w-full"
            label="Check out"
          />
        </div>
      </div>
    </div>
  );
}

const BADGE = 'hcms-badge inline-flex rounded-full font-medium';

function BadgesSpecimen({ guide, samples }: { guide: StyleGuide; samples: CardSamples }) {
  return (
    <div className="sg-split">
      <div className="sg-stack">
        <div className="flex flex-wrap gap-2">
          <span className={`badge-sale ${BADGE}`}>Sale</span>
          <span className={`badge-soldout ${BADGE}`}>Sold out</span>
          <span className={`badge-default ${BADGE}`}>New</span>
          {guide.badges.map((b) => (
            <span key={b.id} className={`badge-default hcms-badge--${b.id} ${BADGE}`}>
              {b.label}
            </span>
          ))}
        </div>
        <p className="sg-meta">
          Sale and sold out badges use their color schemes; custom badges come from Theme settings ›
          Styles.
        </p>
      </div>
      <div className="sg-badge-tile relative rounded-card bg-surface-secondary aspect-square overflow-hidden">
        <SampleImage samples={samples} ratio={1} />
        <div className="hcms-badges pointer-events-none absolute flex max-w-[calc(100%-1rem)] flex-wrap gap-1 [inset-block:var(--badge-inset-block,auto_0.5rem)] [inset-inline:var(--badge-inset-inline,0.5rem_auto)]">
          <span className={`badge-sale ${BADGE}`}>Sale</span>
        </div>
      </div>
    </div>
  );
}

function CurrencySpecimen({ samples, currency }: { samples: CardSamples; currency: string }) {
  const { formatMoney } = useAppComponents();
  const root = useRouteLoaderData<RootData>('root');
  const on = Boolean(root?.theme?.flags?.currencyCode);
  const sale = samples.products.find(
    (p) =>
      Number(p.compareAtPriceRange?.minVariantPrice?.amount ?? 0) >
      Number(p.priceRange.minVariantPrice.amount),
  );
  const price: Money = samples.products[0]?.priceRange.minVariantPrice ?? {
    amount: '48.00',
    currencyCode: root?.currency ?? currency,
  };
  const rows: { label: string; node: ReactNode }[] = [
    { label: 'Price', node: formatMoney(price) },
    {
      label: 'Large amount',
      node: formatMoney({ amount: '1249.5', currencyCode: price.currencyCode }),
    },
    {
      label: 'Sale',
      node: (
        <>
          <span className="text-sale font-semibold">
            {formatMoney(
              sale?.priceRange.minVariantPrice ?? {
                amount: '36.00',
                currencyCode: price.currencyCode,
              },
            )}
          </span>{' '}
          <s className="text-compare text-sm">
            {formatMoney(
              sale?.compareAtPriceRange?.minVariantPrice ?? {
                amount: '48.00',
                currencyCode: price.currencyCode,
              },
            )}
          </s>
        </>
      ),
    },
  ];
  return (
    <div className="sg-stack">
      <dl className="sg-prices">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="sg-meta">{r.label}</dt>
            <dd className="type-heading-sm">{r.node}</dd>
          </div>
        ))}
      </dl>
      <p className="sg-meta">
        Currency codes are {on ? 'on' : 'off'}: {formatMoney(price, { currencyCode: true })} or{' '}
        {formatMoney(price, { currencyCode: false })}.
      </p>
    </div>
  );
}

function StylesSpecimen({ guide }: { guide: StyleGuide }) {
  if (!guide.styles.length)
    return (
      <Note>
        No named styles yet. Add button, card or badge styles in Theme settings › Styles and pick
        them in any section.
      </Note>
    );
  return (
    <ul className="sg-style-list">
      {guide.styles.map((s) => (
        <li key={`${s.kind}:${s.id}`}>
          <div>
            <p className="sg-label">{s.group}</p>
            <p className="font-medium">{s.label}</p>
            <p className="sg-meta">
              {s.edited ? `${s.edited} setting${s.edited === 1 ? '' : 's'} changed` : 'Named only'}
            </p>
          </div>
          <StyleSample kind={s.kind} id={s.id} label={s.label} />
        </li>
      ))}
    </ul>
  );
}

function StyleSample({ kind, id, label }: { kind: string; id: string; label: string }) {
  switch (kind) {
    case 'button':
      return id === 'link' ? (
        <span className="hcms-button--link text-sm underline underline-offset-4">{label}</span>
      ) : (
        <SampleButton
          className={`${id === 'secondary' ? 'button-outline' : id === 'tertiary' ? 'button-ghost' : 'button-primary'} hcms-button hcms-button--${id}`}
          label={label}
        />
      );
    case 'card':
      return (
        <div className={`hcms-card hcms-card--product hcms-card--style-${id} sg-mini-card`}>
          <div className="sg-tile rounded-card" aria-hidden="true" />
          <div className="hcms-card__info text-sm">Card</div>
        </div>
      );
    case 'badge':
      return <span className={`badge-default hcms-badge--${id} ${BADGE}`}>{label}</span>;
    case 'type':
      return <span className={`type-preset-${id}`}>Aa</span>;
    case 'divider':
      return <hr className="hcms-divider sg-divider opacity-20" />;
    default:
      return null;
  }
}

function CartSpecimen({ guide }: { guide: StyleGuide }) {
  const { cart } = guide;
  return (
    <div className="sg-stack" inert>
      {cart.subtotal && cart.thresholds ? (
        <FreeShippingBar subtotal={cart.subtotal} thresholds={cart.thresholds} />
      ) : (
        <Note>
          Free shipping goals are off. Add a goal in Theme settings › Cart to show the bar.
        </Note>
      )}
      {cart.giftWrap ? (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="accent-interactive size-5 shrink-0" />
          <span className="flex-1">Add gift wrap</span>
        </label>
      ) : null}
      {cart.giftMessage ? (
        <label className="sg-field">
          <span className="text-sm font-medium">Gift message</span>
          <textarea
            rows={2}
            className="w-full px-3 py-2"
            placeholder="Write a note for the recipient"
          />
        </label>
      ) : null}
      {!cart.giftWrap && !cart.giftMessage ? (
        <Note>Gift wrap and gift messages are off.</Note>
      ) : null}
    </div>
  );
}

function MarketsSpecimen({ guide }: { guide: StyleGuide }) {
  if (!guide.geolocation)
    return (
      <Note>
        The country suggestion banner is off. Turn it on in Theme settings › Markets to suggest the
        right market to shoppers from other countries.
      </Note>
    );
  return (
    <div className="sg-stack" inert>
      <MarketSuggestionBanner
        suggestion={{ countryName: 'Canada', currency: 'CAD', href: '#sg-markets' }}
      />
      <p className="sg-meta">
        Sample: shoppers see it above the header when their country has its own market. It never
        shows in the editor preview.
      </p>
    </div>
  );
}

function CustomCssSpecimen({ guide }: { guide: StyleGuide }) {
  const { set, characters } = guide.customCss;
  return (
    <div className="sg-stack">
      <p className="type-body-sm">
        {set ? (
          <>
            <b>Custom CSS is on</b> · {characters.toLocaleString('en')} characters
          </>
        ) : (
          <b>No custom CSS</b>
        )}
      </p>
      <p className="sg-meta">
        Custom CSS applies to every page of your store, this one included, after all theme settings.
      </p>
    </div>
  );
}

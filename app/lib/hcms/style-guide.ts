/**
 * Style guide page (T-2.85 follow-up): loader data for `/__hcms/styles`, the editor's Theme settings
 * preview. Pure (node:test loads it): the draft's theme settings → one specimen model per Theme
 * settings category, with the values the merchant set (or Dawn's default) spelled out. The page
 * itself renders with the real theme CSS, so these values are labels, never styles.
 */
import {
  THEME_TOKENS,
  cartGiftsFrom,
  componentStyleLabel,
  freeShippingThresholdsFrom,
  readComponentStyles,
  themeTokenValue,
  type CartGoals,
  type ThemeToken,
  type ThemeTokenGroup,
} from '@hcms/schema';
import { colorSchemeClass, parseFontHandle } from '@hcms/hydrogen';

export type StyleCategoryId =
  | 'colors'
  | 'typography'
  | 'layout'
  | 'animations'
  | 'icons'
  | 'buttons'
  | 'variant_pills'
  | 'inputs'
  | 'product_cards'
  | 'collection_cards'
  | 'blog_cards'
  | 'content_containers'
  | 'media'
  | 'popups'
  | 'drawers'
  | 'badges'
  | 'currency_format'
  | 'styles'
  | 'cart'
  | 'markets'
  | 'custom_css';

/** Theme settings categories, in the editor's order (ids are the editor contract). */
export const STYLE_CATEGORIES: readonly { id: StyleCategoryId; label: string; blurb: string }[] = [
  { id: 'colors', label: 'Colors', blurb: 'Color schemes for backgrounds, text and buttons.' },
  { id: 'typography', label: 'Typography', blurb: 'Heading and body fonts and the size scale.' },
  { id: 'layout', label: 'Layout', blurb: 'Page width, space between sections and grid gaps.' },
  { id: 'animations', label: 'Animations', blurb: 'Reveal on scroll and the hover effect.' },
  { id: 'icons', label: 'Icons', blurb: 'Line weight of the header and product icons.' },
  { id: 'buttons', label: 'Buttons', blurb: 'Every button style, its border, corners and shadow.' },
  {
    id: 'variant_pills',
    label: 'Variant pills',
    blurb: 'The option buttons shoppers use to pick a size or color.',
  },
  { id: 'inputs', label: 'Inputs', blurb: 'Text fields, dropdowns, checkboxes and quantity.' },
  {
    id: 'product_cards',
    label: 'Product cards',
    blurb: 'How products look in grids, carousels and search.',
  },
  {
    id: 'collection_cards',
    label: 'Collection cards',
    blurb: 'How collections look in lists and grids.',
  },
  { id: 'blog_cards', label: 'Blog cards', blurb: 'How blog posts look in lists.' },
  {
    id: 'content_containers',
    label: 'Content containers',
    blurb: 'Text boxes over banners, slides and images.',
  },
  { id: 'media', label: 'Media', blurb: 'Corners, border and shadow of images and videos.' },
  {
    id: 'popups',
    label: 'Dropdowns and pop-ups',
    blurb: 'Menus, dropdowns and pop-up windows.',
  },
  { id: 'drawers', label: 'Drawers', blurb: 'Panels that slide in, like the cart and menu.' },
  { id: 'badges', label: 'Badges', blurb: 'Sale, sold out and custom labels on cards.' },
  { id: 'currency_format', label: 'Currency format', blurb: 'How prices are written.' },
  { id: 'styles', label: 'Styles', blurb: 'Named styles you can pick in any section.' },
  { id: 'cart', label: 'Cart', blurb: 'Free shipping goals, gift wrap and gift messages.' },
  { id: 'markets', label: 'Markets', blurb: 'The country suggestion banner.' },
  { id: 'custom_css', label: 'Custom CSS', blurb: 'Your own CSS for the whole store.' },
];

/** Wrapper id the editor selects/scrolls/outlines through the preview bridge. */
export const styleSectionId = (id: StyleCategoryId) => `__lib-style-${id}`;

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** `scheme-1` → "Scheme 1" (the editor's label). */
export const schemeLabel = (id: string) => id.replace(/^scheme-/, 'Scheme ');

export type SchemeSpecimen = {
  id: string;
  name: string;
  className: string;
  /** Every stored role with its value, the four core roles first. */
  colors: { role: string; label: string; value: string }[];
};

const CORE_ROLES = ['background', 'text', 'button', 'button_label'];
const roleLabel = (role: string) =>
  role === 'button_label'
    ? 'Button label'
    : (role.charAt(0).toUpperCase() + role.slice(1)).replace(/_/g, ' ');
const SCHEME_ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR_VALUE = /^[#a-z0-9(),.%\s/+-]{1,120}$/i;

/** The draft's colour schemes (`settings.colors.schemes`), in stored order. */
export function colorSchemes(settings: unknown): SchemeSpecimen[] {
  const schemes = record(record(record(settings).colors).schemes);
  return Object.entries(schemes)
    .filter(([id]) => SCHEME_ID.test(id))
    .map(([id, value]) => {
      const roles = Object.entries(record(value)).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && COLOR_VALUE.test(entry[1]),
      );
      roles.sort(
        ([a], [b]) =>
          (CORE_ROLES.indexOf(a) + 1 || 99) - (CORE_ROLES.indexOf(b) + 1 || 99) ||
          a.localeCompare(b),
      );
      return {
        id,
        name: schemeLabel(id),
        className: colorSchemeClass(id),
        colors: roles.map(([role, v]) => ({ role, label: roleLabel(role), value: v })),
      };
    });
}

export type FontSpecimen = {
  role: 'heading' | 'body';
  /** Family name as shoppers see it ("DM Sans"), or a system stack label. */
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  source: string;
  /** False = no font picked; the storefront's own font shows. */
  set: boolean;
};

const SYSTEM_LABEL: Record<string, string> = {
  sans_serif: 'System sans-serif',
  serif: 'System serif',
  monospace: 'System monospace',
  system_ui: 'System UI',
};
const SOURCE_LABEL: Record<string, string> = {
  google: 'Google Fonts',
  system: 'System font',
  custom: 'Uploaded font',
  adobe: 'Adobe Fonts',
};

export function themeFonts(settings: unknown): FontSpecimen[] {
  const typography = record(record(settings).typography);
  return (['heading', 'body'] as const).map((role) => {
    const font = parseFontHandle(typography[role]);
    if (!font)
      return {
        role,
        family: 'Store default',
        weight: 400,
        style: 'normal',
        source: '',
        set: false,
      };
    const source = font.source ?? (font.system ? 'system' : 'google');
    return {
      role,
      family: font.system ? (SYSTEM_LABEL[font.family] ?? font.family) : font.family,
      weight: font.weight,
      style: font.style,
      source: SOURCE_LABEL[source] ?? source,
      set: true,
    };
  });
}

export type TokenRow = { id: string; label: string; value: string; edited: boolean };

const unitValue = (n: number, unit: string) => `${n}${unit === '%' ? '%' : 'px'}`;

function formatToken(token: ThemeToken, value: number | boolean | string): string {
  switch (token.type) {
    case 'range':
      return unitValue(value as number, token.unit);
    case 'checkbox':
      return value ? 'On' : 'Off';
    case 'select':
      return token.options.find((o) => o.value === value)?.label ?? String(value);
    case 'color_scheme':
      return schemeLabel(String(value));
  }
}

/** Unset = the storefront keeps its own look (themeStyles writes nothing), not Dawn's value. */
export const UNSET = 'Default';

/** Every token of a Theme settings group with its stored value, else `Default`. */
export function tokenRows(settings: unknown, group: ThemeTokenGroup): TokenRow[] {
  const root = record(settings);
  return THEME_TOKENS.filter((t) => t.group === group).map((token) => {
    const stored = themeTokenValue(token, root[token.id]);
    return {
      id: token.id,
      label: token.label,
      value: stored === null ? UNSET : formatToken(token, stored),
      edited: stored !== null,
    };
  });
}

const numberAt = (settings: unknown, path: string[]): number | null => {
  let node: unknown = settings;
  for (const key of path) node = record(node)[key];
  return typeof node === 'number' && Number.isFinite(node) ? node : null;
};

/** Grouped (older) settings shown next to the tokens: page width, scale, button radius. */
function legacyRows(settings: unknown, category: StyleCategoryId): TokenRow[] {
  const row = (id: string, label: string, path: string[], fmt: (n: number) => string) => {
    const n = numberAt(settings, path);
    return { id, label, value: n === null ? UNSET : fmt(n), edited: n !== null };
  };
  if (category === 'layout')
    return [
      row('page_width', 'Page width', ['layout', 'pageWidth'], (n) => `${n}px`),
      row('spacing', 'Spacing unit', ['layout', 'spacing'], (n) => `${n}px`),
    ];
  if (category === 'typography')
    return [
      row(
        'body_scale',
        'Font size scale',
        ['typography', 'scale'],
        (n) => `${Math.round(n * 100)}%`,
      ),
    ];
  if (category === 'buttons')
    return [row('buttons_radius', 'Corner radius', ['buttons', 'radius'], (n) => `${n}px`)];
  return [];
}

export type TypeStep = { className: string; label: string; px: number; heading: boolean };

const TYPE_STEPS: [className: string, label: string, base: number, heading: boolean][] = [
  ['type-display', 'Display', 36, true],
  ['type-heading-xl', 'Heading XL', 30, true],
  ['type-heading-lg', 'Heading L', 24, true],
  ['type-heading-md', 'Heading M', 20, true],
  ['type-heading-sm', 'Heading S', 18, true],
  ['type-body-lg', 'Body L', 18, false],
  ['type-body', 'Body', 16, false],
  ['type-body-sm', 'Body S', 14, false],
];

/**
 * The core type scale with the sizes the theme CSS computes (`hcms-tokens.css`): body steps ×
 * font size scale; heading steps × heading scale (Dawn: `--font-heading-scale` = heading ÷ body, so
 * a set heading scale is absolute).
 */
export function typeScale(settings: unknown): TypeStep[] {
  const body = numberAt(settings, ['typography', 'scale']);
  const bodyScale = body !== null && body >= 0.5 && body <= 2 ? body : 1;
  const token = THEME_TOKENS.find((t) => t.id === 'heading_scale') as ThemeToken;
  const heading = themeTokenValue(token, record(settings).heading_scale);
  const headingScale = typeof heading === 'number' ? heading / 100 : bodyScale;
  return TYPE_STEPS.map(([className, label, base, isHeading]) => ({
    className,
    label,
    px: Math.round(base * (isHeading ? headingScale : bodyScale) * 10) / 10,
    heading: isHeading,
  }));
}

export type ButtonSpecimen = { id: string; label: string; className: string; custom: boolean };

const BUTTON_BASE: Record<string, string> = {
  primary: 'button-primary',
  secondary: 'button-outline',
  tertiary: 'button-ghost',
};

/**
 * The button styles to show: the four built-ins plus every custom style the draft defines (named or
 * with values), with the same classes as the sections' `ButtonLink`.
 */
export function buttonStyles(settings: unknown): ButtonSpecimen[] {
  const customs = new Set(
    readComponentStyles(settings)
      .filter((s) => s.def.kind === 'button' && s.style.custom)
      .map((s) => s.style.id),
  );
  const ids = [
    'primary',
    'secondary',
    'tertiary',
    'link',
    ...[1, 2, 3, 4].map((n) => `custom-${n}`).filter((id) => customs.has(id)),
  ];
  return ids.map((id) => ({
    id,
    label: componentStyleLabel(settings, 'button', id) ?? id,
    className:
      id === 'link'
        ? 'hcms-button--link underline underline-offset-4'
        : `${BUTTON_BASE[id] ?? 'button-primary'} hcms-button hcms-button--${id}`,
    custom: id.startsWith('custom-'),
  }));
}

export type NamedStyle = {
  kind: string;
  group: string;
  id: string;
  label: string;
  /** Fields the merchant changed from the defaults. */
  edited: number;
  custom: boolean;
};

/** Theme settings › Styles: every style that has a name or edited values. */
export function namedStyles(settings: unknown): NamedStyle[] {
  return readComponentStyles(settings).map((s) => ({
    kind: s.def.kind,
    group: s.def.label,
    id: s.style.id,
    label: componentStyleLabel(settings, s.def.kind, s.style.id) ?? s.style.label,
    edited: s.values.size,
    custom: Boolean(s.style.custom),
  }));
}

/** Custom badge styles defined in the draft (`badge-default hcms-badge--custom-N`). */
export function badgeStyles(settings: unknown): { id: string; label: string }[] {
  return readComponentStyles(settings)
    .filter((s) => s.def.kind === 'badge')
    .map((s) => ({
      id: s.style.id,
      label: componentStyleLabel(settings, 'badge', s.style.id) ?? s.style.label,
    }));
}

export type Money = { amount: string; currencyCode: string };

export type CartSpecimen = {
  /** Goals in the sample currency, or null when no free shipping is set up. */
  thresholds: CartGoals | null;
  /** About 60 % of the way to the first goal. */
  subtotal: Money | null;
  giftWrap: boolean;
  giftMessage: boolean;
};

/** Cents-free decimal maths on the stored strings (no float drift on display). */
const fraction = (amount: string, ratio: number) => {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? (Math.round(n * ratio * 100) / 100).toFixed(2) : null;
};

export function cartSpecimen(settings: unknown, currency: string): CartSpecimen {
  const goals = freeShippingThresholdsFrom(settings);
  const code = goals[currency] ? currency : Object.keys(goals)[0];
  const first = code ? goals[code]?.[0] : undefined;
  const amount = first ? fraction(first.amount, 0.6) : null;
  const gifts = cartGiftsFrom(settings);
  return {
    thresholds: code && amount ? { [code]: goals[code] ?? [] } : null,
    subtotal: code && amount ? { amount, currencyCode: code } : null,
    giftWrap: Boolean(gifts?.wrapVariantId),
    giftMessage: Boolean(gifts?.message),
  };
}

export function customCssInfo(settings: unknown): { set: boolean; characters: number } {
  const css = record(settings).custom_css;
  const characters = typeof css === 'string' ? css.trim().length : 0;
  return { set: characters > 0, characters };
}

export const geolocationOn = (settings: unknown) =>
  record(record(settings).markets).geolocation_banner === true;

// --- Demo catalogue (cards) ---------------------------------------------------------------------

type Img = { url: string; altText?: string | null; width?: number | null; height?: number | null };
export type SampleProduct = {
  id: string;
  handle: string;
  title: string;
  vendor?: string | null;
  availableForSale: boolean;
  featuredImage?: Img | null;
  images?: { nodes: Img[] } | null;
  priceRange: { minVariantPrice: Money; maxVariantPrice?: Money | null };
  compareAtPriceRange?: { minVariantPrice?: Money | null } | null;
};
export type SampleCollection = {
  id: string;
  handle: string;
  title: string;
  image?: Img | null;
  products?: { nodes: { featuredImage?: Img | null }[] } | null;
};
export type SampleArticle = {
  id: string;
  handle: string;
  title: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  blog?: { handle: string } | null;
  image?: Img | null;
  authorV2?: { name: string } | null;
};
export type CardSamples = {
  products: SampleProduct[];
  collections: SampleCollection[];
  articles: SampleArticle[];
};

const onSale = (p: SampleProduct) =>
  Number(p.compareAtPriceRange?.minVariantPrice?.amount ?? 0) >
  Number(p.priceRange.minVariantPrice.amount);

/**
 * Three products that show the card's states: a regular one, one on sale and one sold out, when
 * the catalogue has them (pictured products first); else the first three.
 */
export function pickProducts(products: readonly SampleProduct[], count = 3): SampleProduct[] {
  // Only pictured products when there are any: an empty image reads as a broken card.
  const withImage = products.filter((p) => p.featuredImage);
  const pictured = withImage.length ? withImage : [...products];
  const picks: SampleProduct[] = [];
  const take = (p: SampleProduct | undefined) => {
    if (p && !picks.includes(p) && picks.length < count) picks.push(p);
  };
  take(pictured.find((p) => p.availableForSale && !onSale(p)));
  take(pictured.find((p) => p.availableForSale && onSale(p)));
  take(pictured.find((p) => !p.availableForSale));
  for (const p of pictured) take(p);
  return picks;
}

/** Raw query data → card samples (tolerant: missing lists are empty). */
export function cardSamples(data: unknown): CardSamples {
  const nodes = <T>(key: string) => {
    const list = record(record(data)[key]).nodes;
    return (Array.isArray(list) ? list : []).filter(
      (n): n is T =>
        Boolean(n) && typeof n === 'object' && typeof (n as { id?: unknown }).id === 'string',
    );
  };
  return {
    products: pickProducts(
      nodes<SampleProduct>('products').filter((p) => p.priceRange?.minVariantPrice),
    ),
    collections: nodes<SampleCollection>('collections').slice(0, 3),
    articles: nodes<SampleArticle>('articles').slice(0, 3),
  };
}

/** One request for every card specimen (the sections' fragments, appended verbatim). */
export const STYLE_GUIDE_QUERY_BODY = `query HcmsStyleGuideSamples($country: CountryCode, $language: LanguageCode)
@inContext(country: $country, language: $language) {
  products(first: 12, sortKey: BEST_SELLING) { nodes { ...HcmsProductCard } }
  collections(first: 3, sortKey: UPDATED_AT, reverse: true) { nodes { ...HcmsCollectionCard } }
  articles(first: 3, sortKey: PUBLISHED_AT, reverse: true) {
    nodes { id handle title excerpt publishedAt blog { handle } image { url altText width height } authorV2 { name } }
  }
}`;

// --- Page model ---------------------------------------------------------------------------------

export type StyleGuide = {
  categories: typeof STYLE_CATEGORIES;
  schemes: SchemeSpecimen[];
  fonts: FontSpecimen[];
  typeScale: TypeStep[];
  /** Token values per category (Theme settings rows), with grouped legacy settings first. */
  values: Partial<Record<StyleCategoryId, TokenRow[]>>;
  buttons: ButtonSpecimen[];
  badges: { id: string; label: string }[];
  styles: NamedStyle[];
  cart: CartSpecimen;
  geolocation: boolean;
  customCss: { set: boolean; characters: number };
  /** Reveal on scroll, hover effect (raw option value: `default` = none). */
  animations: { reveal: boolean; hover: string };
  icons: { stroke: string };
};

const TOKEN_CATEGORIES: ThemeTokenGroup[] = [
  'typography',
  'layout',
  'animations',
  'icons',
  'buttons',
  'variant_pills',
  'inputs',
  'product_cards',
  'collection_cards',
  'blog_cards',
  'content_containers',
  'media',
  'popups',
  'drawers',
  'badges',
  'currency_format',
];

export function buildStyleGuide(settings: unknown, options: { currency: string }): StyleGuide {
  const values: StyleGuide['values'] = {};
  for (const group of TOKEN_CATEGORIES)
    values[group] = [...legacyRows(settings, group), ...tokenRows(settings, group)];
  const root = record(settings);
  return {
    categories: STYLE_CATEGORIES,
    schemes: colorSchemes(settings),
    fonts: themeFonts(settings),
    typeScale: typeScale(settings),
    values,
    buttons: buttonStyles(settings),
    badges: badgeStyles(settings),
    styles: namedStyles(settings),
    cart: cartSpecimen(settings, options.currency),
    geolocation: geolocationOn(settings),
    customCss: customCssInfo(settings),
    animations: {
      // Unset = on (Dawn), like the SDK's `revealOnScroll` flag.
      reveal:
        root.animations_reveal_on_scroll === undefined || root.animations_reveal_on_scroll === true,
      hover:
        typeof root.animations_hover_elements === 'string'
          ? root.animations_hover_elements
          : 'default',
    },
    icons: {
      stroke:
        root.icon_stroke === 'thin' || root.icon_stroke === 'heavy' ? root.icon_stroke : 'default',
    },
  };
}

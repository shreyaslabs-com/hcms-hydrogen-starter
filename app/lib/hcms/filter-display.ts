/**
 * T-2.114 facet presentation (pure). The grid section resolves the merchant's `filter_settings`
 * into `filter.view` (`@hcms/sections` `arrangeFilters`): collapsed, values before "Show more"
 * and display (list / swatches / buttons; unset = automatic). Price stays range inputs.
 */
export type FacetDisplay = 'price' | 'list' | 'swatches' | 'buttons';

type Swatch = {
  color?: string | null;
  image?: { previewImage?: { url?: string | null } | null } | null;
} | null;

type FilterLike = {
  type?: string | null;
  presentation?: string | null;
  view?: { display?: 'list' | 'swatches' | 'buttons' } | undefined;
  values: readonly { label: string; swatch?: Swatch }[];
};

/**
 * Colour names that are also CSS named colours (a value labelled "Navy" can show a swatch when
 * Shopify has no swatch data). Only these exact words ever reach CSS.
 */
const NAMED_COLORS = new Set(
  'black white gray grey silver red maroon orange gold yellow olive green lime teal aqua cyan blue navy purple violet magenta fuchsia pink brown tan beige ivory khaki coral salmon crimson indigo lavender turquoise chocolate'.split(
    ' ',
  ),
);

export function namedColor(label: string): string | null {
  const word = label.trim().toLowerCase();
  return NAMED_COLORS.has(word) ? word : null;
}

const hasSwatch = (swatch: Swatch | undefined) =>
  !!(swatch?.color || swatch?.image?.previewImage?.url);

/** Swatch paint for one value: Shopify swatch first, then a safe colour name, else none. */
export function swatchPaint(value: { label: string; swatch?: Swatch }): {
  color: string | null;
  image: string | null;
} {
  const image = value.swatch?.image?.previewImage?.url ?? null;
  const color = value.swatch?.color ?? (image ? null : namedColor(value.label));
  return { color, image };
}

/** Which control a filter renders as. */
export function facetDisplay(filter: FilterLike): FacetDisplay {
  if (filter.type === 'PRICE_RANGE') return 'price';
  const display = filter.view?.display;
  if (display === 'list' || display === 'buttons') return display;
  if (display === 'swatches') {
    // Every value needs paint (Shopify swatch or a CSS colour name); otherwise a list.
    const paintable = filter.values.every((v) => {
      const paint = swatchPaint(v);
      return !!(paint.color || paint.image);
    });
    return paintable && filter.values.length > 0 ? 'swatches' : 'list';
  }
  return filter.presentation === 'SWATCH' || filter.values.some((v) => hasSwatch(v.swatch))
    ? 'swatches'
    : 'list';
}

/** Values before the "Show more" disclosure and the rest (all stay in the HTML). */
export function splitValues<T>(values: readonly T[], maxValues: number | undefined) {
  const max = maxValues && maxValues > 0 ? maxValues : values.length;
  // Hiding a single value behind "Show more (1)" helps nobody.
  if (values.length <= max + 1) return { shown: [...values], more: [] as T[] };
  return { shown: values.slice(0, max), more: values.slice(max) };
}

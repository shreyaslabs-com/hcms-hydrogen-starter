/**
 * The storefront's product form for the official `main-product` / `featured-product` sections
 * (D-22, T-1.3.7): Hydrogen's product form store (hydrogen-variant-form skill), URL-synced
 * selection, variant picker (pills/swatches as GET links, dropdown with a no-JS GET form),
 * quantity and buy buttons (cart store + Shop Pay). Products with purchase options (selling plans,
 * T-2.44) use `SellingPlanBuyButtons`: our own add path, since the store can't add selling plans.
 */
import {
  AnalyticsEvent,
  buildProductSelectionSearchParams,
  canAddToCart,
  type SelectedOption,
} from '@shopify/hydrogen';
import { ShopPayButton } from '@shopify/hydrogen/react';
import type { MoneyV2 as AnalyticsMoney } from '@shopify/hydrogen/storefront-api-types';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useLocation, useMatches, useNavigate } from 'react-router';
import type { AddToCartLine, AppComponents, VariantPickerLook } from '@hcms/hydrogen';
import { SET_VARIANT_EVENT } from '@hcms/hydrogen';

import { Link, useLocalePath } from '~/components/LocaleLink';
import { useCart, useCartActions } from '~/lib/cart';
import { useAfterAddToCart } from '~/lib/after-add-to-cart';
import { shopifyImageUrl } from '~/lib/image';
import { ProductProvider, useProductForm, type ProductData } from '~/lib/product';

const QuantityContext = createContext<[number, (n: number) => void]>([1, () => {}]);
/**
 * Quick view (T-2.77): `local` = selection stays in the form (no URL sync); `onAdded` runs after
 * an add, just before the theme's cart outcome (drawer, cart page, notification).
 */
const FormModeContext = createContext<{ local: boolean; onAdded?: (() => void) | undefined }>({
  local: false,
});
/** The section's product data (the store's `useProduct` result is not the raw product). */
const ProductDataContext = createContext<ProductData | null>(null);
function useProductData(): ProductData {
  const product = useContext(ProductDataContext);
  if (!product) throw new Error('Product blocks need HcmsProductForm');
  return product;
}

function variantUrl(
  product: Pick<ProductData, 'handle' | 'options'>,
  selectedOptions: SelectedOption[],
  handle = product.handle,
  base: URLSearchParams = new URLSearchParams(),
) {
  const params = buildProductSelectionSearchParams({
    selectedOptions,
    optionNames: product.options.map((option) => option.name),
    base,
  });
  const query = params.toString();
  return `/products/${handle}${query ? `?${query}` : ''}`;
}

/**
 * `afterSubmit` for this form's add to cart: the theme cart type's outcome. In a quick view
 * (T-2.77) the dialog closes first, so the drawer/notification gets focus; the dialog stays
 * mounted (hidden) so a page/notification outcome that waits for the cart still runs.
 */
function useAfterAdd(): () => void {
  const after = useAfterAddToCart();
  const { onAdded } = useContext(FormModeContext);
  return useCallback(() => {
    onAdded?.();
    after();
  }, [onAdded, after]);
}

/**
 * Adapter `useAddToCart` (T-2.77 card quick add of a single-variant product): Standard Actions
 * `updateCart` with the same `product_added_to_cart` detail as the product form
 * (hydrogen-cart-ui: code-driven cart changes), then the theme cart type's outcome. `null` = the
 * cart store isn't connected/loaded yet: the card's form POSTs natively instead.
 */
export function useHcmsAddToCart(): (
  line: AddToCartLine | AddToCartLine[],
) => Promise<{ errors: string[] } | null> {
  const afterAdd = useAfterAddToCart();
  const { refresh } = useCartActions();
  const ready = useCart(
    (state) => !state.loading && !('readyPromise' in state && state.readyPromise),
  );
  return useCallback(
    async (input: AddToCartLine | AddToCartLine[]) => {
      const updateCart = window.Shopify?.actions?.updateCart;
      if (!updateCart || updateCart.isDefault() || !ready) return null;
      const list = Array.isArray(input) ? input : [input];
      try {
        const result = await updateCart(
          {
            lines: list.map(({ merchandiseId, quantity, attributes }) => ({
              merchandiseId,
              quantity,
              ...(attributes?.length ? { attributes } : {}),
            })),
          },
          {
            event: {
              context: 'product',
              detail: {
                products: list.map(({ merchandiseId, variant }) => ({
                  id: merchandiseId,
                  price: variant.price,
                  title: variant.title,
                  image: variant.image ?? null,
                  product: variant.product,
                  selectedOptions: variant.selectedOptions,
                })),
              },
            },
          },
        );
        const errors = (result.userErrors ?? []).map((error) => error.message);
        if (errors.length === 0) {
          // Hydrogen 2026.10: the first add that CREATES the cart drops lines that carry
          // attributes (Build a box, personalisation) from the store until a reload, although
          // Shopify has them. Re-read the authoritative cart (hydrogen-cart-ui `refresh()`).
          if (list.some((line) => line.attributes?.length)) await refresh();
          afterAdd();
        }
        return { errors };
      } catch (error) {
        const cause = (error as { cause?: { userErrors?: { message: string }[] } }).cause;
        if (cause?.userErrors?.length) return { errors: cause.userErrors.map((e) => e.message) };
        return null;
      }
    },
    [afterAdd, ready, refresh],
  );
}

function ProductViewedTracker({ product }: { product: ProductData }) {
  useEffect(() => {
    const variant = product.selectedOrFirstAvailableVariant;
    window.Shopify?.analytics?.publish(AnalyticsEvent.PRODUCT_VIEWED, {
      products: [
        {
          id: product.id,
          title: product.title,
          price: (variant?.price ?? product.priceRange.minVariantPrice) as AnalyticsMoney,
          vendor: product.vendor ?? '',
          variantId: variant?.id ?? product.id,
          variantTitle: variant?.title ?? product.title,
          quantity: 1,
          sku: variant?.sku ?? undefined,
        },
      ],
    });
  }, [product]);
  return null;
}

/**
 * Adapter `ProductForm`: store provider + URL sync (provider `onSelect` is the only navigation).
 * `local` (quick view, T-2.77): no URL sync, no product-viewed event, no editor variant events;
 * a complete selection the store can't resolve locally goes to `onSelectOptions` (refetch).
 */
export function HcmsProductForm({
  product,
  children,
  local = false,
  onSelectOptions,
  onAdded,
}: {
  product: unknown;
  children: ReactNode;
  local?: boolean;
  onSelectOptions?: (selectedOptions: SelectedOption[]) => void;
  onAdded?: () => void;
}) {
  const data = product as ProductData;
  const navigate = useNavigate();
  const location = useLocation();
  const variantSources = useVariantSources();
  const quantity = useState(1);
  const anchor = useRef<HTMLSpanElement>(null);

  const mode = useMemo(() => ({ local, onAdded }), [local, onAdded]);

  // Editor preview (T-1.6.5): the bridge dispatches SET_VARIANT on this section's element.
  useEffect(() => {
    const section = local ? null : anchor.current?.closest('[data-hcms-section-id]');
    if (!section) return;
    const onSetVariant = (event: Event) => {
      const id = (event as CustomEvent<{ variantId?: string }>).detail?.variantId;
      const variant = [data.selectedOrFirstAvailableVariant, ...(data.adjacentVariants ?? [])].find(
        (v) => v?.id === id,
      );
      if (!variant?.selectedOptions) return;
      void navigate(
        variantUrl(
          data,
          variant.selectedOptions,
          data.handle,
          new URLSearchParams(location.search),
        ),
        { replace: true, preventScrollReset: true },
      );
    };
    section.addEventListener(SET_VARIANT_EVENT, onSetVariant);
    return () => section.removeEventListener(SET_VARIANT_EVENT, onSetVariant);
  }, [data, navigate, location.search, local]);

  return (
    <ProductProvider
      product={data}
      onSelect={(result) => {
        if (local) {
          const complete = result.selectedOptions.length === data.options.length;
          if (result.status === 'unresolved' && complete) onSelectOptions?.(result.selectedOptions);
          return;
        }
        const url = variantUrl(
          data,
          result.selectedOptions,
          result.selectedVariant?.product?.handle,
          new URLSearchParams(location.search),
        );
        void navigate(url, {
          replace: true,
          preventScrollReset: true,
          // A known variant renders from the loaded data, unless some setting is bound to
          // `variant.*` (e.g. a variant metafield): those resolve on the server per URL.
          ...(result.status === 'resolved' && !variantSources
            ? { defaultShouldRevalidate: false }
            : {}),
        });
      }}
    >
      <ProductDataContext.Provider value={data}>
        <FormModeContext.Provider value={mode}>
          <span ref={anchor} hidden />
          <QuantityContext.Provider value={quantity}>
            {local ? null : <ProductViewedTracker product={data} />}
            {children}
          </QuantityContext.Provider>
        </FormModeContext.Provider>
      </ProductDataContext.Provider>
    </ProductProvider>
  );
}

/** The page has settings bound to `variant.*` (`loadTemplatePage` → `hcms.variantSources`). */
function useVariantSources(): boolean {
  return useMatches().some(
    (match) =>
      (match.loaderData as { hcms?: { variantSources?: boolean } | null } | undefined)?.hcms
        ?.variantSources === true,
  );
}

/** Adapter `useSelectedVariant`. */
export function useHcmsSelectedVariant(): unknown {
  return useProductForm().selectedVariant;
}

function isPlainActivation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    (!event.currentTarget.target || event.currentTarget.target === '_self')
  );
}

/** Options a "variant image" swatch source applies to (else the first option). */
const COLOR_OPTION = /colou?r|shade|finish|pattern|print|tone/i;

function optionValueOf(product: ProductData, optionName: string, value: string) {
  return product.options
    .find((o) => o.name === optionName)
    ?.optionValues.find((v) => v.name === value);
}

/**
 * Swatch for a value: Shopify swatch data first; T-2.156 `swatchSource` fills options without it
 * (colour-name map, or the value's variant image on the colour-like / first option).
 */
function swatchFor(
  product: ProductData,
  optionName: string,
  value: string,
  look?: VariantPickerLook,
) {
  const optionValue = optionValueOf(product, optionName, value);
  const imageUrl = optionValue?.swatch?.image?.previewImage?.url ?? null;
  const color = optionValue?.swatch?.color ?? null;
  if (imageUrl || color) return { imageUrl, color };
  if (look?.swatchSource === 'colors') {
    const mapped = look.swatchColors?.[value.toLowerCase()];
    return mapped ? { imageUrl: null, color: mapped } : null;
  }
  if (look?.swatchSource === 'image') {
    const target =
      product.options.find((o) => COLOR_OPTION.test(o.name))?.name ?? product.options[0]?.name;
    const url = target === optionName ? optionValue?.firstSelectableVariant?.image?.url : null;
    return url ? { imageUrl: shopifyImageUrl(url, { width: 96, height: 96 }), color: null } : null;
  }
  return null;
}

/** T-2.156 `valueImages`: the value's swatch image, else its variant image (small). */
function valueImageFor(product: ProductData, optionName: string, value: string): string | null {
  const optionValue = optionValueOf(product, optionName, value);
  const url =
    optionValue?.swatch?.image?.previewImage?.url ??
    optionValue?.firstSelectableVariant?.image?.url;
  return url ? shopifyImageUrl(url, { width: 64, height: 64 }) : null;
}

type FormOption = ReturnType<typeof useProductForm>['options'][number];
type FormValue = FormOption['values'][number];

/** Values left after T-2.156 hide rules (the selected value always stays). */
function visibleValues(product: ProductData, option: FormOption, look?: VariantPickerLook) {
  return option.values.filter(
    (value) =>
      value.selected ||
      !(
        (look?.soldOutStyle === 'hide' && value.exists && !value.available) ||
        (look?.hideUnavailable && !value.exists && value.handle === product.handle)
      ),
  );
}

const legendClass = (look?: VariantPickerLook) =>
  look?.labelStyle === 'uppercase'
    ? 'text-xs font-medium tracking-widest uppercase'
    : 'text-sm font-medium';

const CARD_COLS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

/** Adapter `VariantPicker`: pills / swatches as GET links, dropdowns, or value cards (T-2.156). */
export function HcmsVariantPicker({
  pickerType,
  swatchShape,
  look,
}: {
  pickerType: 'button' | 'dropdown';
  swatchShape: 'circle' | 'square' | 'none';
  look?: VariantPickerLook;
}) {
  const product = useProductData();
  const { options, register } = useProductForm();
  const location = useLocation();
  const localize = useLocalePath();
  const { local } = useContext(FormModeContext);
  // Quick view: option links point at the product page, not this page's query.
  const search = local ? '' : location.search;
  const base = useMemo(() => new URLSearchParams(search), [search]);
  const idPrefix = `option${useId().replace(/[^\w-]/g, '')}`;
  // Nothing to choose: hide the whole picker (single-variant product).
  if (options.every((option) => option.values.length <= 1)) return null;

  if (pickerType === 'dropdown') {
    return (
      // Variant selection is NOT part of the cart form. Without JS this GET form reloads with the
      // chosen option params; with JS each change selects through the store.
      <form method="get" action={localize(`/products/${product.handle}`)} className="space-y-4">
        {options.map((option) => {
          const selected = option.values.find((v) => v.selected)?.name ?? '';
          return (
            <div key={option.name} className="space-y-2">
              <label
                className={`block ${legendClass(look)}`}
                htmlFor={`${idPrefix}-${option.name}`}
              >
                {option.name}
              </label>
              <select
                id={`${idPrefix}-${option.name}`}
                name={option.name}
                value={selected}
                className="border-border bg-surface min-h-11 w-full rounded border px-3"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  register('optionValue', { optionName: option.name, value }).onClick();
                }}
              >
                {visibleValues(product, option, look).map((value) => (
                  <option key={value.name} value={value.name} disabled={!value.exists}>
                    {value.name}
                    {value.exists && !value.available ? ' — Sold out' : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        <noscript>
          <button type="submit" className="button-outline rounded-button min-h-11 px-4 text-sm">
            Update
          </button>
        </noscript>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {options.map((option) =>
        look?.cards?.option === option.name ? (
          <OptionCards
            key={option.name}
            option={option}
            options={options}
            cards={look.cards}
            look={look}
          />
        ) : (
          <OptionPills
            key={option.name}
            option={option}
            swatchShape={swatchShape}
            look={look}
            base={base}
            name={`${idPrefix}-${option.name}`}
          />
        ),
      )}
    </div>
  );
}

/** One option as pills / swatches (GET links), with optional swatch group tabs (T-2.156). */
function OptionPills({
  option,
  swatchShape,
  look,
  base,
  name,
}: {
  option: FormOption;
  swatchShape: 'circle' | 'square' | 'none';
  look: VariantPickerLook | undefined;
  base: URLSearchParams;
  name: string;
}) {
  const product = useProductData();
  const { register } = useProductForm();
  const [group, setGroup] = useState(-1);
  const selectedValue = option.values.find((value) => value.selected)?.name;
  const swatches =
    swatchShape !== 'none' &&
    option.values.some((v) => swatchFor(product, option.name, v.name, look));
  const lower = (v: string) => v.toLowerCase();
  const groups = swatches
    ? (look?.swatchGroups ?? []).filter((g) =>
        g.values.some((v) => option.values.some((o) => lower(o.name) === lower(v))),
      )
    : [];
  const inGroup = (value: FormValue) =>
    group < 0 || !groups[group] || groups[group].values.some((v) => lower(v) === lower(value.name));
  const values = visibleValues(product, option, look).filter(inGroup);
  return (
    <fieldset className="space-y-2">
      <legend className={legendClass(look)}>
        {option.name}
        {selectedValue ? `: ${selectedValue}` : ''}
      </legend>
      {groups.length ? (
        // Filter tabs: native radios (arrow keys, one tab stop); filtering is visual only.
        <div
          role="radiogroup"
          aria-label={`Filter ${option.name}`}
          className="flex flex-wrap gap-2"
        >
          {[{ name: 'All', values: [] as string[] }, ...groups].map((g, index) => (
            <label key={g.name} className="hcms-swatch-tab">
              <input
                type="radio"
                className="sr-only"
                name={`${name}-group`}
                checked={group === index - 1}
                onChange={() => setGroup(index - 1)}
              />
              {g.name}
            </label>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const soldOut = !value.available;
          const crossProduct = value.handle !== product.handle;
          const registered = register('optionValue', {
            optionName: option.name,
            value: value.name,
          });
          const swatch = swatches ? swatchFor(product, option.name, value.name, look) : null;
          const shape = swatchShape === 'square' ? 'rounded-sm' : 'rounded-full';
          const slash = look?.soldOutStyle === 'slash';
          const image =
            !swatches && look?.valueImages ? valueImageFor(product, option.name, value.name) : null;
          const content = swatches ? (
            <>
              <span
                aria-hidden="true"
                className={`swatch-md border-border relative inline-flex overflow-hidden border-2 ${shape} ${value.selected ? 'border-interactive' : ''}`}
                style={
                  swatch?.imageUrl
                    ? {
                        backgroundImage: `url("${swatch.imageUrl}")`,
                        backgroundSize: 'cover',
                      }
                    : { backgroundColor: swatch?.color ?? undefined }
                }
              >
                {soldOut ? (
                  <svg
                    className="absolute inset-0 h-full w-full"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <line x1="4" y1="4" x2="20" y2="20" />
                  </svg>
                ) : null}
              </span>
              <span className="sr-only">
                {value.name}
                {soldOut ? ' (Sold out)' : ''}
              </span>
            </>
          ) : (
            <>
              {image ? (
                <img
                  src={image}
                  alt=""
                  width={24}
                  height={24}
                  className="me-2 size-6 rounded-sm object-cover"
                />
              ) : null}
              <span className={soldOut && !slash ? 'line-through' : undefined}>{value.name}</span>
              {soldOut ? <span className="sr-only"> (Sold out)</span> : null}
            </>
          );
          const pillLook = `${look?.selectedStyle === 'outline' ? 'option-pill--outline' : ''} ${soldOut && slash ? 'option-pill--slash' : ''}`;
          const className = swatches
            ? `min-h-touch-target min-w-touch-target inline-flex items-center justify-center ${soldOut ? 'opacity-60' : ''}`
            : `option-pill ${pillLook} ${value.selected ? 'is-selected' : ''} ${soldOut ? 'opacity-60' : ''}`;
          if (!crossProduct && !value.exists) {
            return (
              <button
                key={value.name}
                type="button"
                disabled
                aria-pressed={value.selected}
                className={className}
              >
                {content}
              </button>
            );
          }
          return (
            <Link
              key={value.name}
              to={variantUrl(product, value.selectedOptions, value.handle, base)}
              replace={!crossProduct}
              preventScrollReset
              className={className}
              aria-current={value.selected ? 'true' : undefined}
              onClick={
                crossProduct
                  ? undefined
                  : (event) => {
                      if (!isPlainActivation(event)) return;
                      event.preventDefault();
                      registered.onClick();
                    }
              }
            >
              {content}
            </Link>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * T-2.156 value cards: radios (one per value) with price, MRP, savings, sub-line, unit price and
 * ribbon. Without JS they sit in a GET form (other options as hidden fields + Update button).
 */
function OptionCards({
  option,
  options,
  cards,
  look,
}: {
  option: FormOption;
  options: FormOption[];
  cards: NonNullable<VariantPickerLook['cards']>;
  look: VariantPickerLook;
}) {
  const product = useProductData();
  const { register } = useProductForm();
  const localize = useLocalePath();
  const selectedValue = option.values.find((value) => value.selected)?.name;
  return (
    <form method="get" action={localize(`/products/${product.handle}`)}>
      <fieldset className="space-y-2">
        <legend className={legendClass(look)}>
          {option.name}
          {selectedValue ? `: ${selectedValue}` : ''}
        </legend>
        {options
          .filter((o) => o.name !== option.name)
          .map((o) => {
            const value = o.values.find((v) => v.selected)?.name;
            return value ? <input key={o.name} type="hidden" name={o.name} value={value} /> : null;
          })}
        <div
          className={`grid gap-3 pt-2 ${cards.mobileColumns === 2 ? 'grid-cols-2' : 'grid-cols-1'} ${CARD_COLS[cards.columns] ?? ''}`}
        >
          {visibleValues(product, option, look)
            .filter((value) => value.handle === product.handle)
            .map((value) => {
              const details = cards.values[value.name];
              const soldOut = value.exists && !(details?.available ?? value.available);
              return (
                <label
                  key={value.name}
                  className={`hcms-variant-card ${value.selected ? 'is-selected' : ''} ${soldOut ? 'is-soldout' : ''}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={option.name}
                    value={value.name}
                    checked={value.selected}
                    disabled={!value.exists}
                    onChange={() =>
                      register('optionValue', {
                        optionName: option.name,
                        value: value.name,
                      }).onClick()
                    }
                  />
                  {details?.badge ? (
                    <span className="hcms-variant-card__badge">{details.badge}</span>
                  ) : null}
                  <span className="font-medium">{value.name}</span>
                  {details?.subtitle ? (
                    <span className="text-on-surface-secondary text-sm">{details.subtitle}</span>
                  ) : null}
                  {details ? (
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">
                        {details.compareAt ? <span className="sr-only">Sale price </span> : null}
                        {details.price}
                      </span>
                      {details.compareAt ? (
                        <s className="text-compare text-sm">
                          <span className="sr-only">Regular price </span>
                          {details.compareAt}
                        </s>
                      ) : null}
                    </span>
                  ) : null}
                  {details?.save && !soldOut ? (
                    <span className="text-sale text-sm font-medium">{details.save}</span>
                  ) : null}
                  {details?.unitPrice ? (
                    <span className="text-on-surface-secondary text-xs">
                      <span className="sr-only">Unit price </span>
                      {details.unitPrice}
                    </span>
                  ) : null}
                  {soldOut ? <span className="text-xs font-medium">Sold out</span> : null}
                  {!value.exists ? <span className="sr-only"> (Unavailable)</span> : null}
                </label>
              );
            })}
        </div>
        <noscript>
          <button type="submit" className="button-outline rounded-button min-h-11 px-4 text-sm">
            Update
          </button>
        </noscript>
      </fieldset>
    </form>
  );
}

/** Adapter `QuantitySelector`: shared quantity, submitted by the buy buttons' form. */
export function HcmsQuantitySelector() {
  const [quantity, setQuantity] = useContext(QuantityContext);
  // Unique per form: a quick view can open on a product page (complementary products).
  const id = `product-quantity${useId().replace(/[^\w-]/g, '')}`;
  const clamp = (value: number) => Math.min(99, Math.max(1, value));
  return (
    <div>
      <label className="mb-2 block text-sm font-medium" htmlFor={id}>
        Quantity
      </label>
      <div className="quantity-selector-outlined rounded-input inline-flex items-center">
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center disabled:opacity-50"
          aria-label="Decrease quantity"
          onClick={() => setQuantity(clamp(quantity - 1))}
          disabled={quantity <= 1}
        >
          <img src="/icons/icon-minus.svg" alt="" className="size-4" aria-hidden="true" />
        </button>
        <input
          type="number"
          id={id}
          value={quantity}
          min={1}
          max={99}
          className="number-reset h-11 w-12 border-0 bg-transparent p-0 text-center text-sm"
          onChange={(event) =>
            setQuantity(clamp(Number.parseInt(event.currentTarget.value, 10) || 1))
          }
        />
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center disabled:opacity-50"
          aria-label="Increase quantity"
          onClick={() => setQuantity(clamp(quantity + 1))}
          disabled={quantity >= 99}
        >
          <img src="/icons/icon-plus.svg" alt="" className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

type Register = ReturnType<typeof useProductForm>['register'];

/**
 * Gift card recipient (Shopify line item properties, shopify.dev "Add a gift card recipient
 * form"): only sent when the buyer opts in; email required, optional name, message, send date.
 */
function GiftCardRecipient({ register }: { register: Register }) {
  const [enabled, setEnabled] = useState(false);
  const [fields, setFields] = useState({ email: '', name: '', message: '', sendOn: '' });
  const id = 'gift-card-recipient';
  const set = (key: keyof typeof fields) => (event: { currentTarget: { value: string } }) =>
    setFields((current) => ({ ...current, [key]: event.currentTarget.value }));
  const attr = (key: string, value: string) => (
    <input type="hidden" {...register('attributeValue', { key, value })} />
  );
  const input = 'border-border bg-surface min-h-11 w-full rounded border px-3';
  return (
    <fieldset className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        I want to send this as a gift
      </label>
      {enabled ? (
        <div className="space-y-3">
          <label className="block text-sm" htmlFor={`${id}-email`}>
            Recipient email
            <input
              id={`${id}-email`}
              type="email"
              required
              autoComplete="off"
              className={input}
              value={fields.email}
              onChange={set('email')}
            />
          </label>
          <label className="block text-sm" htmlFor={`${id}-name`}>
            Recipient name (optional)
            <input
              id={`${id}-name`}
              type="text"
              autoComplete="off"
              className={input}
              value={fields.name}
              onChange={set('name')}
            />
          </label>
          <label className="block text-sm" htmlFor={`${id}-message`}>
            Message (optional)
            <textarea
              id={`${id}-message`}
              maxLength={200}
              rows={3}
              className={`${input} py-2`}
              value={fields.message}
              onChange={set('message')}
            />
          </label>
          <label className="block text-sm" htmlFor={`${id}-date`}>
            Send on (optional)
            <input
              id={`${id}-date`}
              type="date"
              className={input}
              value={fields.sendOn}
              onChange={set('sendOn')}
            />
          </label>
          {attr('__shopify_send_gift_card_to_recipient', 'true')}
          {attr('__shopify_offset', String(new Date().getTimezoneOffset()))}
          {attr('Recipient email', fields.email)}
          {fields.name ? attr('Recipient name', fields.name) : null}
          {fields.message ? attr('Message', fields.message) : null}
          {fields.sendOn ? attr('Send on', fields.sendOn) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

type BuyButtonsProps = ComponentProps<NonNullable<AppComponents['BuyButtons']>>;
type PurchaseOptionsProp = NonNullable<BuyButtonsProps['purchaseOptions']>;

/**
 * Selling plans (T-2.44): the section's purchase-options radios (`sellingPlanId`) inside a form
 * that POSTs to `/__hcms/cart/add` (works without JS). Hydrated, submit goes through Standard
 * Actions `updateCart` (lines accept `sellingPlanId`), so the cart store shows the line, pending
 * state and errors like any add; until the store is connected and the cart loaded, the native
 * POST runs instead. No Shop Pay button: it can't carry a selling plan.
 */
function SellingPlanBuyButtons({
  purchaseOptions,
  lineProperties,
}: {
  purchaseOptions: PurchaseOptionsProp | null;
  lineProperties?: BuyButtonsProps['lineProperties'];
}) {
  const { selectedVariant } = useProductForm();
  const [quantity] = useContext(QuantityContext);
  const localize = useLocalePath();
  const location = useLocation();
  const afterAdd = useAfterAdd();
  const ready = useCart(
    (state) => !state.loading && !('readyPromise' in state && state.readyPromise),
  );
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const available = selectedVariant?.availableForSale === true;
  const addable = available && (purchaseOptions?.purchasable ?? true);
  const label = addable
    ? 'Add to cart'
    : !selectedVariant
      ? 'Select options'
      : !available
        ? 'Sold out'
        : 'Unavailable';

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    const updateCart = window.Shopify?.actions?.updateCart;
    // Not hydrated into a connected store yet: let the native POST add it.
    if (!updateCart || updateCart.isDefault() || !ready || !selectedVariant) return;
    event.preventDefault();
    if (pending) return;
    const plan = String(new FormData(event.currentTarget).get('sellingPlanId') ?? '');
    if (!plan && purchaseOptions?.requiresSellingPlan) return;
    setPending(true);
    setErrors([]);
    try {
      const result = await updateCart(
        {
          lines: [
            {
              merchandiseId: selectedVariant.id,
              quantity,
              ...(plan ? { sellingPlanId: plan } : {}),
              ...(lineProperties?.attributes.length
                ? { attributes: lineProperties.attributes }
                : {}),
            },
          ],
        },
        {
          event: {
            context: 'product',
            detail: {
              products: [
                {
                  id: selectedVariant.id,
                  price: selectedVariant.price,
                  title: selectedVariant.title,
                  image: selectedVariant.image ?? null,
                  product: selectedVariant.product,
                  selectedOptions: selectedVariant.selectedOptions,
                },
              ],
            },
          },
        },
      );
      const messages = (result.userErrors ?? []).map((e) => e.message);
      setErrors(messages);
      if (messages.length === 0) afterAdd();
    } catch (error) {
      const cause = (error as { cause?: { userErrors?: { message: string }[] } }).cause;
      setErrors(
        cause?.userErrors?.map((e) => e.message) ?? ['Couldn’t add this item. Please try again.'],
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        id={lineProperties?.formId}
        method="post"
        action={localize('/__hcms/cart/add')}
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="merchandiseId" value={selectedVariant?.id ?? ''} />
        <input type="hidden" name="quantity" value={String(quantity)} />
        <input type="hidden" name="return_to" value={`${location.pathname}${location.search}`} />
        {purchaseOptions?.picker}
        <button
          type="submit"
          className="rounded-button button-primary mt-3 inline-flex h-11 w-full cursor-pointer items-center justify-center px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!addable || pending}
          aria-busy={pending || undefined}
          data-testid="add-to-cart"
        >
          {label}
        </button>
      </form>
      {errors.length ? (
        <div className="grid gap-1 text-sm" role="alert">
          {errors.map((message) => (
            <p key={message} className="text-critical">
              {message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Adapter `BuyButtons`: add-to-cart form (merchandiseId + quantity) and Shop Pay. */
export function HcmsBuyButtons({
  showDynamicCheckout,
  showGiftCardRecipient,
  purchaseOptions,
  lineProperties,
  layout,
  buyNow,
}: BuyButtonsProps) {
  // Personalised products (T-2.95) take our own add path too: it posts `properties[…]` without
  // JS, and Shop Pay can't carry line properties.
  if (purchaseOptions || lineProperties)
    return (
      <SellingPlanBuyButtons
        purchaseOptions={purchaseOptions ?? null}
        lineProperties={lineProperties}
      />
    );
  return (
    <ProductBuyButtons
      showDynamicCheckout={showDynamicCheckout}
      showGiftCardRecipient={showGiftCardRecipient}
      side={layout === 'side'}
      plainBuyNow={buyNow === 'plain'}
    />
  );
}

/** Hydrogen product form path: add-to-cart form (merchandiseId + quantity) and Shop Pay. */
function ProductBuyButtons({
  showDynamicCheckout,
  showGiftCardRecipient,
  side = false,
  plainBuyNow = false,
}: {
  showDynamicCheckout: boolean;
  showGiftCardRecipient: boolean;
  side?: boolean;
  plainBuyNow?: boolean;
}) {
  const product = useProductData();
  const { options, register, formProps, errors, pending, selectedVariant } = useProductForm();
  const [quantity] = useContext(QuantityContext);
  const addable = canAddToCart(product, options);
  const label = addable ? 'Add to cart' : selectedVariant ? 'Sold out' : 'Select options';
  const afterAdd = useAfterAdd();
  const messages = [...errors.userErrors, ...errors.warnings, ...errors.networkErrors];
  return (
    <div className="flex flex-col gap-3">
      {/* T-2.156 `buttons_layout: side`: add to cart and the buy-now button share one row. */}
      <div className={side ? 'grid grid-cols-2 items-end gap-3' : 'contents'}>
        <form {...formProps({ afterSubmit: afterAdd })}>
          <input type="hidden" {...register('merchandiseId', {})} />
          <input type="hidden" {...register('quantity', { value: quantity })} />
          {showGiftCardRecipient ? <GiftCardRecipient register={register} /> : null}
          <button
            {...register('addToCart', {})}
            className="rounded-button button-primary mt-3 inline-flex h-11 w-full cursor-pointer items-center justify-center px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!addable || pending}
            data-testid="add-to-cart"
          >
            {label}
          </button>
        </form>
        {showDynamicCheckout && selectedVariant ? (
          plainBuyNow ? (
            <PlainBuyNow disabled={!addable || pending} />
          ) : (
            <ShopPayButton
              variants={[{ id: selectedVariant.id, quantity }]}
              disabled={!addable || pending}
              width="100%"
              borderRadius="8px"
            />
          )
        ) : null}
      </div>
      {messages.length ? (
        <div className="grid gap-1 text-sm" role="alert">
          {messages.map((m) => (
            <p key={m.message} className="text-critical">
              {m.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * T-2.156 `buy_now_type: plain`: a plain "Buy now" that adds the selected variant to the cart and
 * opens checkout. Without JS (or before the cart store is ready) the form POSTs to
 * `/__hcms/cart/add` with `checkout=1` (303 → the cart's checkout URL); hydrated, Standard Actions
 * `updateCart` adds it (same `product_added_to_cart` event) and the page goes to `checkoutUrl`.
 */
function PlainBuyNow({ disabled }: { disabled: boolean }) {
  const { selectedVariant } = useProductForm();
  const [quantity] = useContext(QuantityContext);
  const localize = useLocalePath();
  const location = useLocation();
  const ready = useCart(
    (state) => !state.loading && !('readyPromise' in state && state.readyPromise),
  );
  const [pending, setPending] = useState(false);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    const updateCart = window.Shopify?.actions?.updateCart;
    if (!updateCart || updateCart.isDefault() || !ready || !selectedVariant) return;
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await updateCart(
        { lines: [{ merchandiseId: selectedVariant.id, quantity }] },
        {
          event: {
            context: 'product',
            detail: {
              products: [
                {
                  id: selectedVariant.id,
                  price: selectedVariant.price,
                  title: selectedVariant.title,
                  image: selectedVariant.image ?? null,
                  product: selectedVariant.product,
                  selectedOptions: selectedVariant.selectedOptions,
                },
              ],
            },
          },
        },
      );
      // `/checkout` = Hydrogen's `handleShopifyRoutes` redirect to the current cart's checkout.
      if (!result.userErrors?.length) {
        window.location.assign(localize('/checkout'));
        return;
      }
    } catch {
      // Falls through to the cart page below.
    }
    setPending(false);
    window.location.assign(localize('/cart'));
  };
  return (
    <form
      method="post"
      action={localize('/__hcms/cart/add')}
      onSubmit={(event) => void onSubmit(event)}
    >
      <input type="hidden" name="merchandiseId" value={selectedVariant?.id ?? ''} />
      <input type="hidden" name="quantity" value={String(quantity)} />
      <input type="hidden" name="checkout" value="1" />
      <input type="hidden" name="return_to" value={`${location.pathname}${location.search}`} />
      <button
        type="submit"
        className="rounded-button button-outline inline-flex h-11 w-full cursor-pointer items-center justify-center px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        data-testid="buy-now"
      >
        Buy now
      </button>
    </form>
  );
}

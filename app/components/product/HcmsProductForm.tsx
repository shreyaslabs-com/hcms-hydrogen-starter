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
import type { AddToCartLine, AppComponents } from '@hcms/hydrogen';
import { SET_VARIANT_EVENT } from '@hcms/hydrogen';

import { Link, useLocalePath } from '~/components/LocaleLink';
import { useCart, useCartActions } from '~/lib/cart';
import { useAfterAddToCart } from '~/lib/after-add-to-cart';
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

function swatchFor(product: ProductData, optionName: string, value: string) {
  const swatch = product.options
    .find((o) => o.name === optionName)
    ?.optionValues.find((v) => v.name === value)?.swatch;
  const imageUrl = swatch?.image?.previewImage?.url ?? null;
  const color = swatch?.color ?? null;
  return imageUrl || color ? { imageUrl, color } : null;
}

/** Adapter `VariantPicker`: pills / swatches as GET links, or dropdowns. */
export function HcmsVariantPicker({
  pickerType,
  swatchShape,
}: {
  pickerType: 'button' | 'dropdown';
  swatchShape: 'circle' | 'square' | 'none';
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
              <label className="block text-sm font-medium" htmlFor={`${idPrefix}-${option.name}`}>
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
                {option.values.map((value) => (
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
      {options.map((option) => {
        const selectedValue = option.values.find((value) => value.selected)?.name;
        const swatches =
          swatchShape !== 'none' &&
          option.values.some((v) => swatchFor(product, option.name, v.name));
        return (
          <fieldset key={option.name} className="space-y-2">
            <legend className="text-sm font-medium">
              {option.name}
              {selectedValue ? `: ${selectedValue}` : ''}
            </legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const soldOut = !value.available;
                const crossProduct = value.handle !== product.handle;
                const registered = register('optionValue', {
                  optionName: option.name,
                  value: value.name,
                });
                const swatch = swatches ? swatchFor(product, option.name, value.name) : null;
                const shape = swatchShape === 'square' ? 'rounded-sm' : 'rounded-full';
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
                    <span className={soldOut ? 'line-through' : undefined}>{value.name}</span>
                    {soldOut ? <span className="sr-only"> (Sold out)</span> : null}
                  </>
                );
                const className = swatches
                  ? `min-h-touch-target min-w-touch-target inline-flex items-center justify-center ${soldOut ? 'opacity-60' : ''}`
                  : `option-pill ${value.selected ? 'is-selected' : ''} ${soldOut ? 'opacity-60' : ''}`;
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
      })}
    </div>
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
    />
  );
}

/** Hydrogen product form path: add-to-cart form (merchandiseId + quantity) and Shop Pay. */
function ProductBuyButtons({
  showDynamicCheckout,
  showGiftCardRecipient,
}: {
  showDynamicCheckout: boolean;
  showGiftCardRecipient: boolean;
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
        <ShopPayButton
          variants={[{ id: selectedVariant.id, quantity }]}
          disabled={!addable || pending}
          width="100%"
          borderRadius="8px"
        />
      ) : null}
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

/** One cart line (image, title, options, price, quantity form). Shared by the drawer and the cart
 * page; its own module so `/cart` doesn't pull the whole lazy `CartDrawer` chunk (ADR 005). */
import { type ReactNode, type SubmitEvent } from 'react';
import { Link } from '~/components/LocaleLink';
import { useCart, useCartForm } from '~/lib/cart';
import { lineOptionText, lineProductPath } from '~/lib/hcms/cart-line';
import { shopifyImageUrl } from '~/lib/image';
import { formatPrice } from '~/lib/money';

export type CartLineView = {
  id: string;
  quantity: number;
  cost: {
    totalAmount: { amount: string; currencyCode: string };
    /** Unit price / compare-at price (drawer offers; absent on optimistic lines). */
    amountPerQuantity?: { amount: string; currencyCode: string } | null;
    compareAtAmountPerQuantity?: { amount: string; currencyCode: string } | null;
  };
  discountAllocations?: ReadonlyArray<{
    discountedAmount?: { amount: string; currencyCode: string } | null;
    title?: string | null;
    code?: string | null;
  }> | null;
  attributes?: Array<{ key: string; value: string | null }>;
  /** Subscription plan (T-2.104); absent on optimistic lines until Shopify responds. */
  sellingPlanAllocation?: { sellingPlan?: { name?: string | null } | null } | null;
  merchandise?: {
    id?: string | null;
    title?: string | null;
    selectedOptions?: Array<{ name: string; value: string }> | null;
    image?: { url: string; altText?: string | null } | null;
    product?: { title?: string | null; handle?: string | null } | null;
  } | null;
};

export function CartLineItem({
  line,
  emptyCartFocusId,
  renderOffers,
  imageClassName = 'size-20',
}: {
  line: CartLineView;
  emptyCartFocusId: string;
  /** Thumbnail size (cart page: larger, the product sells itself). */
  imageClassName?: string;
  /** Replaces the plain line price with compare-at + discount labels (lazy drawer only). */
  renderOffers?: (line: CartLineView, pending: boolean) => ReactNode;
}) {
  const { formProps, register } = useCartForm();
  const pendingLines = useCart((state) => state.pending.lines);
  const lineError = useCart((state) => state.errors.lines.get(line.id));
  const merchandise = line.merchandise;
  const product = merchandise?.product;
  const pending = pendingLines.has(line.id);
  const optionText = lineOptionText(merchandise?.selectedOptions);
  const planName = line.sellingPlanAllocation?.sellingPlan?.name;
  const errorId = `cart-line-error-${line.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  // Removing a line unmounts the control that holds focus. Move focus to the same
  // control on a neighbouring line (or `emptyCartFocusId`) while the line still exists.
  const moveFocusBeforeRemoval = (event: SubmitEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    if (!form.contains(document.activeElement)) return;
    const intent = event.nativeEvent.submitter?.getAttribute('value');
    const quantity = new FormData(form).get('quantity');
    const removesLine =
      intent === 'remove' ||
      (intent === 'decrease' && line.quantity <= 1) ||
      (intent === 'set' && Number(quantity) <= 0);
    if (!removesLine) return;

    const item = form.closest('li');
    const neighbour = item?.nextElementSibling ?? item?.previousElementSibling;
    const selector = intent === 'set' ? 'input[name="quantity"]' : `button[value="${intent}"]`;
    const target =
      neighbour?.querySelector<HTMLElement>(selector) ?? document.getElementById(emptyCartFocusId);
    target?.focus();
  };

  return (
    <li
      className={`flex gap-3 py-4 transition-opacity ${pending ? 'opacity-60' : ''}`}
      data-testid="cart-line"
      {...(pending ? { 'aria-busy': 'true' } : {})}
    >
      <div
        className={`bg-surface-secondary rounded-card shrink-0 overflow-hidden ${imageClassName}`}
      >
        {merchandise?.image ? (
          <img
            src={shopifyImageUrl(merchandise.image.url, { width: 256 })}
            alt={merchandise.image.altText ?? product?.title ?? merchandise.title ?? ''}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="type-body-sm text-on-surface font-medium">
          {product?.handle ? (
            <Link
              to={lineProductPath(product.handle, merchandise?.selectedOptions)}
              className="text-on-surface no-underline"
            >
              {product.title ?? merchandise?.title ?? 'Product'}
            </Link>
          ) : (
            (product?.title ?? merchandise?.title ?? 'Product')
          )}
        </p>
        {optionText ? <p className="text-on-surface-secondary mt-1 text-xs">{optionText}</p> : null}
        {planName ? (
          <p className="text-on-surface-secondary mt-1 text-xs" data-selling-plan="">
            {planName}
          </p>
        ) : null}
        {line.attributes
          ?.filter((attr) => !attr.key.startsWith('_') && attr.value != null)
          .map((attr) => (
            <p key={attr.key} className="text-on-surface-secondary mt-1 text-xs italic">
              {attr.key}: {attr.value}
            </p>
          ))}
        {renderOffers ? (
          renderOffers(line, pending)
        ) : (
          <p className={`text-on-surface mt-2 text-sm ${pending ? 'opacity-50' : ''}`}>
            {formatPrice(line.cost.totalAmount)}
          </p>
        )}
        <form
          {...formProps({ beforeSubmit: moveFocusBeforeRemoval })}
          className="mt-3 flex items-center gap-2"
        >
          <button {...register('set')} />
          <input type="hidden" {...register('lineId', { value: line.id })} />
          <div className="quantity-selector-outlined rounded-input inline-flex items-center">
            <button
              type="submit"
              {...register('decrease')}
              className="text-on-surface-secondary hover:text-on-surface inline-flex size-11 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-[color,transform] motion-safe:active:scale-[0.90]"
              aria-label={`Decrease quantity for ${product?.title ?? merchandise?.title ?? 'item'}`}
            >
              <img src="/icons/icon-minus.svg" alt="" className="size-4" aria-hidden="true" />
            </button>
            <input
              {...register('quantity', { value: line.quantity, interactive: true })}
              className={`number-reset text-on-surface h-11 w-12 rounded-none border-0 bg-transparent p-0 text-center text-sm ${pending ? 'opacity-50' : ''}`}
              aria-label="Quantity"
              aria-describedby={lineError?.userErrors.length ? errorId : undefined}
              aria-invalid={lineError?.userErrors.length ? true : undefined}
            />
            <button
              type="submit"
              {...register('increase')}
              className="text-on-surface-secondary hover:text-on-surface inline-flex size-11 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-[color,transform] motion-safe:active:scale-[0.90]"
              aria-label={`Increase quantity for ${product?.title ?? merchandise?.title ?? 'item'}`}
            >
              <img src="/icons/icon-plus.svg" alt="" className="size-4" aria-hidden="true" />
            </button>
          </div>
          <button
            type="submit"
            {...register('remove')}
            className="text-on-surface-secondary hover:text-on-surface inline-flex size-11 items-center justify-center rounded motion-safe:transition-[color,transform] motion-safe:active:scale-[0.90]"
            aria-label={`Remove ${product?.title ?? merchandise?.title ?? 'item'}`}
          >
            <img src="/icons/icon-trash.svg" alt="" className="size-5" aria-hidden="true" />
          </button>
        </form>
        {lineError?.userErrors.length ? (
          <p id={errorId} className="text-critical mt-2 text-sm" role="alert">
            {lineError.userErrors[0]?.message}
          </p>
        ) : null}
      </div>
    </li>
  );
}

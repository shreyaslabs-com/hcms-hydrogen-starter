/**
 * One Build a box (ADR 010) as ONE cart row, like Shopify's bundle display: box name + item count,
 * "Show/Hide N items" list of the child products, struck original + discounted box total, one
 * Remove for the whole box. Shared by the drawer and the cart page (keep it small: `/cart` budget).
 * Remove, hydrated: ONE Standard Actions `updateCart` with every line at `quantity: 0` (parallel
 * per-line calls race: only one stuck). Without JS (or before the runtime is ready) the form is the Hydrogen line
 * form's `remove` intent for the first line, so each submit removes one line. A Cart Transform
 * merged bundle line is one row too: its `lineComponents` are the items, Remove deletes that line.
 */
import { useId, useState, type SubmitEvent } from 'react';

import { announceCart } from '~/components/cart-announcement';
import { type CartLineView } from '~/components/CartLineItem';
import { useCart, useCartActions, useCartForm } from '~/lib/cart';
import { boxDiscounted, type CartBox } from '~/lib/hcms/cart-boxes';
import { fromMilli, toMilli } from '~/lib/hcms/cart-savings';
import { formatPrice } from '~/lib/money';

export function CartBoxRow({
  box,
  emptyCartFocusId,
}: {
  box: CartBox<CartLineView>;
  emptyCartFocusId: string;
}) {
  const { formProps, register } = useCartForm();
  const { refresh } = useCartActions();
  const pendingLines = useCart((state) => state.pending.lines);
  const errors = useCart((state) => state.errors.lines);
  const [open, setOpen] = useState(false);
  const id = useId();
  const listId = `${id}-items`;
  const errorId = `${id}-error`;
  const pending = box.lineIds.some((lineId) => pendingLines.has(lineId));
  const error = box.lineIds
    .map((lineId) => errors.get(lineId)?.userErrors[0]?.message)
    .find(Boolean);
  const image = box.lines.find((line) => line.merchandise?.image)?.merchandise?.image;
  const countLabel = `${box.itemCount} ${box.itemCount === 1 ? 'item' : 'items'}`;

  const removeBox = (event: SubmitEvent<HTMLFormElement>) => {
    const updateCart = window.Shopify?.actions?.updateCart;
    // Runtime not ready: let the form remove the first line (same as without JS).
    if (!updateCart || updateCart.isDefault()) return;
    event.preventDefault();
    // The row unmounts: move focus to the neighbouring row's Remove (or the cart title) first.
    const item = event.currentTarget.closest('li');
    const neighbour = item?.nextElementSibling ?? item?.previousElementSibling;
    (
      neighbour?.querySelector<HTMLElement>('button[value="remove"]') ??
      document.getElementById(emptyCartFocusId)
    )?.focus();
    announceCart(`Removed ${box.name}`);
    // ONE update for every line: parallel per-line updates race and only one of them sticks.
    // The store doesn't project a call that removes several lines, and settles only the lines a
    // response still contains: removed lines stayed on screen (count and total already 0) until
    // a reload. Re-read the cart once the update lands (hydrogen-cart-ui `refresh()`).
    void updateCart(
      { lines: box.lineIds.map((lineId) => ({ id: lineId, quantity: 0 })) },
      { event: { context: 'cart' } },
    ).then(
      () => refresh(),
      () => undefined, // Failures land in the store's errors (line / banner).
    );
  };

  return (
    <li
      className={`flex gap-3 py-4 transition-opacity ${pending ? 'opacity-60' : ''}`}
      data-testid="cart-box"
      data-box={box.key}
      {...(pending ? { 'aria-busy': 'true' } : {})}
    >
      <div className="bg-surface-secondary size-20 shrink-0 overflow-hidden">
        {image ? (
          <img src={image.url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="type-body-sm text-on-surface font-medium">{box.name}</p>
        <p className="text-on-surface-secondary mt-1 text-xs">{countLabel}</p>
        <p className="text-on-surface mt-2 text-sm">
          {boxDiscounted(box) ? (
            <>
              <s className="text-on-surface-secondary me-2">
                <span className="sr-only">Was </span>
                {formatPrice(box.original)}
              </s>
              <span className="sr-only">Now </span>
            </>
          ) : null}
          {formatPrice(box.total)}
        </p>
        {boxDiscounted(box) ? (
          // S2-5: the box price comparison, like the Build a box tray.
          <p className="text-success mt-1 text-xs font-medium">
            You save{' '}
            {formatPrice(
              fromMilli(
                toMilli(box.original.amount) - toMilli(box.total.amount),
                box.total.currencyCode,
              ),
            )}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-on-surface min-h-11 text-sm underline underline-offset-2"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Hide' : 'Show'} {countLabel}
          </button>
          <form {...formProps({ beforeSubmit: removeBox })}>
            <input type="hidden" {...register('lineId', { value: box.lineIds[0] ?? '' })} />
            <button
              type="submit"
              {...register('remove')}
              className="text-on-surface-secondary hover:text-on-surface inline-flex size-11 items-center justify-center rounded motion-safe:transition-[color,transform] motion-safe:active:scale-[0.90]"
              aria-label={`Remove ${box.name}`}
              aria-describedby={error ? errorId : undefined}
            >
              <img src="/icons/icon-trash.svg" alt="" className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>
        <ul id={listId} role="list" className="mt-1 grid gap-2" hidden={!open}>
          {box.lines.map((line) => {
            const merchandise = line.merchandise;
            const variant = merchandise?.title;
            return (
              <li key={line.id} className="flex items-center gap-2 text-xs">
                <span className="bg-surface-secondary size-10 shrink-0 overflow-hidden">
                  {merchandise?.image ? (
                    <img
                      src={merchandise.image.url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="text-on-surface block">
                    {line.quantity} × {merchandise?.product?.title ?? variant ?? 'Product'}
                  </span>
                  {variant && variant !== 'Default Title' ? (
                    <span className="text-on-surface-secondary block">{variant}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p id={errorId} className="text-critical mt-2 text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

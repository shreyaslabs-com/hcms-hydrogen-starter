import { FreeShippingBar } from '@hcms/sections';
import { useId, useState, type SubmitEvent } from 'react';
import { useRouteLoaderData } from 'react-router';

import { useCart, useCartForm } from '~/lib/cart';
import { discountRowMessages } from '~/lib/hcms/cart-discounts';
import type { CartFreeShipping } from '~/lib/hcms/free-shipping';

/**
 * Cart discount codes and order note (T-2.43), following the Hydrogen cart form contract: each
 * remove is its own form, apply validates empty/duplicate input, errors sit next to what they
 * describe (`role="alert"`, `aria-invalid`), unconfirmed values are dimmed, controls stay usable.
 * Works without JS (plain form posts to the cart route).
 */
/**
 * The store may keep an empty error group for a key: only Shopify's own messages (user errors,
 * then warnings) are shown. "Not applicable" codes are already labelled in the list.
 */
function groupMessage(
  group: { userErrors: { message: string }[]; warnings: { message: string }[] } | undefined,
): string | null {
  return group?.userErrors[0]?.message ?? group?.warnings[0]?.message ?? null;
}

export function CartDiscounts() {
  const { formProps, register } = useCartForm();
  const codes = useCart((state) => state.data.discountCodes);
  const pending = useCart((state) => state.pending.discountCodes);
  const errors = useCart((state) => state.errors.discountCodes);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  // Last code the shopper tried to apply: its error shows under the input.
  const [tried, setTried] = useState('');
  const applyError = tried ? groupMessage(errors.get(tried)) : null;
  // One message per text (SF-13): Shopify repeats the same error under every code.
  const rowErrors = discountRowMessages(codes, (code) => groupMessage(errors.get(code)), tried);

  const apply = formProps();
  const onApply = (event: SubmitEvent<HTMLFormElement>) => {
    const raw = new FormData(event.currentTarget).get('discountCode');
    const code = typeof raw === 'string' ? raw.trim() : '';
    // Empty or already applied: do nothing (skill UAT 10, 11).
    if (!code || codes.some((c) => c.code.toLowerCase() === code.toLowerCase())) {
      event.preventDefault();
      return;
    }
    setTried(code);
    apply.onSubmit?.(event);
  };

  return (
    <div className="flex flex-col gap-2">
      <form {...apply} onSubmit={onApply} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Discount code
        </label>
        <input
          id={inputId}
          {...register('discountCode', { defaultValue: '' })}
          placeholder="Discount code"
          autoComplete="off"
          aria-invalid={applyError ? true : undefined}
          aria-describedby={applyError ? errorId : undefined}
          className="border-border bg-surface min-h-11 w-full rounded border px-3 text-sm"
        />
        <button
          type="submit"
          {...register('discount-apply')}
          className="rounded-button button-outline min-h-11 shrink-0 px-4 text-sm"
        >
          Apply
        </button>
      </form>
      {applyError ? (
        <p id={errorId} role="alert" className="text-critical text-xs">
          {applyError}
        </p>
      ) : null}
      {codes.length ? (
        <ul role="list" className="flex flex-col gap-1">
          {codes.map(({ code, applicable }) => {
            const error = rowErrors.get(code);
            const isPending = pending.has(code);
            return (
              <li key={code} className="flex flex-col gap-1">
                <form {...formProps()} className="flex items-center justify-between gap-2 text-sm">
                  <input type="hidden" {...register('discountCode', { value: code })} />
                  <span className={isPending ? 'opacity-40' : ''}>
                    <span className="font-medium">{code}</span>{' '}
                    {!isPending && !applicable ? (
                      <span className="text-on-surface-secondary text-xs">(not applicable)</span>
                    ) : null}
                  </span>
                  <button
                    type="submit"
                    {...register('discount-remove')}
                    aria-label={`Remove discount ${code}`}
                    className="text-xs underline underline-offset-2"
                  >
                    Remove
                  </button>
                </form>
                {error ? (
                  <p role="alert" className="text-critical text-xs">
                    {error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function CartNote() {
  const { formProps, register } = useCartForm();
  const note = useCart((state) => state.data.note ?? '');
  const pending = useCart((state) => state.pending.note);
  const error = useCart((state) => state.errors.note);
  const id = useId();

  const form = formProps();
  const message = groupMessage(error);
  return (
    <form
      {...form}
      onSubmit={(event) => {
        // Uncontrolled field: confirmed responses never clobber typing in progress.
        const draft = new FormData(event.currentTarget).get('note');
        if (draft === note) {
          event.preventDefault(); // nothing to save, but the button stays clickable
          return;
        }
        form.onSubmit?.(event);
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor={id} className="text-sm font-medium">
        Order note
      </label>
      <textarea
        id={id}
        {...register('note', { defaultValue: note })}
        rows={3}
        maxLength={5000}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? `${id}-error` : undefined}
        className="border-border bg-surface w-full rounded border px-3 py-2 text-sm"
      />
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-critical text-xs">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        {...register('note-update')}
        aria-busy={pending}
        className="rounded-button button-outline min-h-11 self-start px-4 text-sm"
      >
        {pending ? 'Saving…' : 'Save note'}
      </button>
    </form>
  );
}

/**
 * Cart page order note as a closed disclosure row (templates review, Nov 9): open when a note is
 * saved, so the summary stays short and Checkout stays near the top. `<details>`: no extra JS.
 */
export function CartNoteDisclosure() {
  const note = useCart((state) => state.data.note ?? '');
  return (
    <details className="hcms-cart-disclosure border-border border-t" open={note ? true : undefined}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium">
        Add an order note
      </summary>
      <div className="pb-3">
        <CartNote />
      </div>
    </details>
  );
}

/**
 * Free-shipping progress (T-2.43) for the cart subtotal: thresholds per currency from theme
 * settings (root loader); nothing when the cart's currency has none. `drawer` also follows the
 * cart page's `main-cart` `show_free_shipping` toggle (the page passes the live section value).
 */
export function CartFreeShippingBar({
  drawer = false,
  className,
}: {
  drawer?: boolean;
  className?: string;
}) {
  const config = useRouteLoaderData<{ cartFreeShipping?: CartFreeShipping }>(
    'root',
  )?.cartFreeShipping;
  const subtotal = useCart((state) => state.data.cost.subtotalAmount);
  if (!config?.thresholds || (drawer && !config.drawer) || !subtotal) return null;
  return (
    <FreeShippingBar subtotal={subtotal} thresholds={config.thresholds} className={className} />
  );
}

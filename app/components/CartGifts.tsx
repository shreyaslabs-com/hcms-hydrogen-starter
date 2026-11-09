/**
 * Gift wrap checkbox + gift message (T-2.80) for the cart drawer and cart page, following the
 * `hydrogen-cart-ui` skill:
 * - Gift wrap = the merchant's variant as a normal cart line (one per order). Hydrated: Standard
 *   Actions `updateCart` add/remove (the store tracks pending/errors). Without JS: the checkbox sits
 *   in a real form — add POSTs to `/__hcms/cart/add` (303 → /cart), remove is the Hydrogen line
 *   form's `remove` intent — submitted by a `<noscript>` "Update" button. Removed automatically when
 *   it's the only line left (rule runs on settled state only).
 * - Gift message = cart attribute `Gift message` via the cart form's `attributes-update` (other
 *   attributes resent as hidden fields), length-limited, works without JS.
 */
import { useStrings } from '@hcms/sections';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useRouteLoaderData } from 'react-router';

import { useLocalePath } from '~/components/LocaleLink';
import { useCart, useCartForm } from '~/lib/cart';
import {
  GIFT_MESSAGE_KEY,
  GIFT_MESSAGE_MAX,
  giftWrapLine,
  onlyGiftWrap,
  otherAttributes,
  type CartGifts as CartGiftsConfig,
} from '~/lib/hcms/cart-gifts';
import { formatPrice } from '~/lib/money';

type Money = { amount: string; currencyCode: string };
/** Gift-wrap price per market path + variant, fetched once per page (App Store 1.1.9). */
const priceCache = new Map<string, Promise<Money | null>>();

/** The gift-wrap price before it is added, so the checkbox shows what it costs. */
function useGiftWrapPrice(variantId: string, skip: boolean): Money | null {
  const localize = useLocalePath();
  const [price, setPrice] = useState<Money | null>(null);
  useEffect(() => {
    if (skip) return;
    const url = `${localize('/__hcms/gift-wrap')}?variant=${encodeURIComponent(variantId)}`;
    let request = priceCache.get(url);
    if (!request) {
      request = fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<{ price: Money | null }>) : { price: null }))
        .then((body) => body.price)
        .catch(() => null);
      priceCache.set(url, request);
    }
    let live = true;
    void request.then((value) => live && setPrice(value));
    return () => {
      live = false;
    };
  }, [variantId, skip, localize]);
  return price;
}

const BUTTON =
  'rounded-button button-outline min-h-11 self-start px-4 text-sm disabled:cursor-not-allowed';

function CartGiftWrap({ variantId }: { variantId: string }) {
  const s = useStrings();
  const localize = useLocalePath();
  const { formProps, register } = useCartForm();
  const lines = useCart((state) => state.data.lines.nodes);
  const pendingLines = useCart((state) => state.pending.lines);
  const cartId = useCart((state) => state.data.id);
  const settled = useCart(
    (state) =>
      !state.loading &&
      !('readyPromise' in state && state.readyPromise) &&
      state.pending.lines.size === 0 &&
      !('revalidating' in state && state.revalidating === true),
  );
  const line = giftWrapLine(lines, variantId);
  const lineError = useCart((state) => (line ? state.errors.lines.get(line.id) : undefined));
  const only = onlyGiftWrap(lines, variantId);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const errorId = `${id}-error`;
  const price = useGiftWrapPrice(variantId, Boolean(line));

  // Nothing left to wrap: drop the wrap line once the cart has settled (never on a projection).
  const removed = useRef<string | null>(null);
  useEffect(() => {
    if (!settled || !only || !line || removed.current === line.id) return;
    const updateCart = window.Shopify?.actions?.updateCart;
    if (!updateCart || updateCart.isDefault()) return;
    removed.current = line.id;
    void updateCart(
      { lines: [{ id: line.id, quantity: 0 }] },
      { event: { context: 'cart' } },
    ).catch(() => undefined);
  }, [settled, only, line]);

  if (only) return null;

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const add = event.currentTarget.checked;
    const form = event.currentTarget.form;
    const updateCart = window.Shopify?.actions?.updateCart;
    if (!updateCart || updateCart.isDefault() || !cartId) {
      // Runtime not ready: the add form still works as a plain POST (remove waits for it).
      if (add && !line) form?.requestSubmit();
      return;
    }
    setError(null);
    if (add) setAdding(true);
    try {
      const result = add
        ? await updateCart(
            { lines: [{ merchandiseId: variantId, quantity: 1 }] },
            { event: { context: 'cart' } },
          )
        : line
          ? await updateCart(
              { lines: [{ id: line.id, quantity: 0 }] },
              { event: { context: 'cart' } },
            )
          : null;
      setError(result?.userErrors?.[0]?.message ?? null);
    } catch {
      // Transport errors land in the store's `errors.network` (cart error banner).
    } finally {
      setAdding(false);
    }
  };

  const message = error ?? lineError?.userErrors[0]?.message ?? null;
  const busy = adding || (line ? pendingLines.has(line.id) : false);
  // The label comes first in both forms so the checkbox keeps focus when the form switches.
  const control = (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input
        id={id}
        type="checkbox"
        name="gift_wrap"
        checked={Boolean(line) || adding}
        onChange={onChange}
        aria-busy={busy || undefined}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        className="accent-interactive size-5 shrink-0"
      />
      <span className="flex-1">{s('sections.cart.gift_wrap')}</span>
      {line ? (
        <span className={busy ? 'opacity-50' : ''}>{formatPrice(line.cost.totalAmount)}</span>
      ) : price ? (
        <span>{formatPrice(price)}</span>
      ) : null}
    </label>
  );
  const update = (
    <noscript>
      <button type="submit" className={BUTTON} {...(line ? register('remove') : {})}>
        {s('sections.cart.update')}
      </button>
    </noscript>
  );
  return (
    <div data-gift-wrap={line ? 'on' : 'off'}>
      {line ? (
        <form {...formProps()} className="flex flex-col gap-2">
          {control}
          <input type="hidden" {...register('lineId', { value: line.id })} />
          {update}
        </form>
      ) : (
        <form method="post" action={localize('/__hcms/cart/add')} className="flex flex-col gap-2">
          {control}
          <input type="hidden" name="merchandiseId" value={variantId} />
          <input type="hidden" name="quantity" value="1" />
          <input type="hidden" name="return_to" value={localize('/cart')} />
          {update}
        </form>
      )}
      {message ? (
        <p id={errorId} role="alert" className="text-critical text-xs">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function CartGiftMessage() {
  const s = useStrings();
  const { formProps, register } = useCartForm();
  const attributes = useCart((state) => state.data.attributes);
  const pending = useCart((state) => state.pending.attributes);
  const error = useCart((state) => state.errors.attributes.get(GIFT_MESSAGE_KEY));
  const id = useId();
  const current = attributes?.find((a) => a.key === GIFT_MESSAGE_KEY)?.value ?? '';
  const message = error?.userErrors[0]?.message ?? error?.warnings[0]?.message ?? null;
  const form = formProps();
  return (
    <form
      {...form}
      onSubmit={(event) => {
        // Uncontrolled field: confirmed responses never clobber typing in progress.
        const draft = event.currentTarget.querySelector('textarea')?.value;
        if (draft === current) {
          event.preventDefault(); // nothing to save, but the button stays clickable
          return;
        }
        form.onSubmit?.(event);
      }}
      className="flex flex-col gap-2"
    >
      {otherAttributes(attributes).map((attribute) => (
        <input
          key={attribute.key}
          type="hidden"
          {...register('attributeValue', { key: attribute.key, value: attribute.value })}
        />
      ))}
      <label htmlFor={id} className="text-sm font-medium">
        {s('sections.cart.gift_message')}
      </label>
      <textarea
        id={id}
        {...register('attributeValue', { key: GIFT_MESSAGE_KEY, defaultValue: current })}
        rows={3}
        maxLength={GIFT_MESSAGE_MAX}
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
        {...register('attributes-update')}
        disabled={pending}
        aria-busy={pending}
        className={BUTTON}
      >
        {s('sections.cart.gift_message_save')}
      </button>
    </form>
  );
}

/**
 * Gift options the merchant turned on (theme settings via the root loader); nothing otherwise. In
 * the drawer the message box sits in a `<details>` like the discount code.
 */
export function CartGifts({
  drawer = false,
  collapsed = false,
  className,
}: {
  drawer?: boolean;
  /** Cart page: the message box as a closed disclosure row (open once a message is saved). */
  collapsed?: boolean;
  className?: string;
}) {
  const s = useStrings();
  const gifts = useRouteLoaderData<{ cartGifts?: CartGiftsConfig | null }>('root')?.cartGifts;
  const attributes = useCart((state) => state.data.attributes);
  if (!gifts) return null;
  const saved = Boolean(attributes?.find((a) => a.key === GIFT_MESSAGE_KEY)?.value);
  return (
    <div className={className} data-cart-gifts="">
      {gifts.wrapVariantId ? <CartGiftWrap variantId={gifts.wrapVariantId} /> : null}
      {gifts.message ? (
        collapsed ? (
          <details className="hcms-cart-disclosure" open={saved ? true : undefined}>
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium">
              {s('sections.cart.gift_message')}
            </summary>
            <div className="pb-3">
              <CartGiftMessage />
            </div>
          </details>
        ) : drawer ? (
          <details className="text-sm">
            <summary className="cursor-pointer">{s('sections.cart.gift_message')}</summary>
            <div className="pt-2">
              <CartGiftMessage />
            </div>
          </details>
        ) : (
          <CartGiftMessage />
        )
      ) : null}
    </div>
  );
}

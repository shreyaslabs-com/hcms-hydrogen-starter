import { useEffect, useId, useMemo, useState } from 'react';
import { useRouteLoaderData } from 'react-router';

import { Link, useLocalePath } from '~/components/LocaleLink';
import { useCart } from '~/lib/cart';
import type { CartRail } from '~/lib/hcms/cart-display';
import {
  DEFAULT_RAILS,
  UPSELL_MAX,
  railItems,
  upsellItems,
  upsellQuery,
  upsellSeed,
  type RailSpec,
  type UpsellItem,
  type UpsellProduct,
} from '~/lib/hcms/upsell';
import { shopifyImageUrl } from '~/lib/image';
import { useFormatPrice } from '~/lib/money';

type UpsellData = {
  complementary?: UpsellProduct[];
  related?: UpsellProduct[];
  /** Collection / product-list results, indexed like the configured rails (P1-7). */
  rails?: UpsellProduct[][];
};

/** Per page session: one request per market + seed product, shared by the drawer and cart page. */
const cache = new Map<string, Promise<UpsellData | null>>();

function loadUpsell(url: string): Promise<UpsellData | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? (res.json() as Promise<UpsellData>) : null))
      .catch(() => null);
    cache.set(url, pending);
    // A failed load may be retried on the next open.
    void pending.then((data) => {
      if (!data) cache.delete(url);
    });
  }
  return pending;
}

/**
 * "You may also like" (T-2.43) for the cart drawer and cart page: recommendations for the first
 * cart line's product (`/__hcms/upsell`, COMPLEMENTARY → RELATED), loaded on the client only when
 * `active` (drawer open / page mounted). Single-variant products add in one click through Standard
 * Actions `updateCart` (the cart store projects the line and tracks pending/errors, per the
 * `hydrogen-cart-ui` skill); others link to the product page. Prices come from the server.
 */
export function CartUpsell({ active, compact = false }: { active: boolean; compact?: boolean }) {
  const lines = useCart((state) => state.data.lines.nodes);
  const loading = useCart((state) => state.loading);
  const localize = useLocalePath();
  const configured = useRouteLoaderData<{ cartRails?: CartRail[] }>('root')?.cartRails;
  const rails: (RailSpec & { heading?: string; imageUrl?: string | null })[] = configured?.length
    ? configured
    : DEFAULT_RAILS;
  const { handle, inCart } = useMemo(() => upsellSeed(lines), [lines]);
  const [data, setData] = useState<{ key: string; value: UpsellData | null } | null>(null);
  const query = upsellQuery(rails, handle);
  const url = query ? `${localize('/__hcms/upsell')}?${query}` : null;

  useEffect(() => {
    if (!active || loading || !url) return;
    let live = true;
    void loadUpsell(url).then((value) => {
      if (live) setData({ key: url, value });
    });
    return () => {
      live = false;
    };
  }, [active, loading, url]);

  const value = data && data.key === url ? data.value : null;
  if (!url || !value) return null;
  return (
    <>
      {rails.map((rail, i) => (
        <UpsellRail
          key={i}
          rail={rail}
          items={
            rail.source === 'auto'
              ? upsellItems(value, inCart, compact ? UPSELL_MAX : PAGE_ITEMS)
              : railItems(value.rails?.[i], inCart, compact ? undefined : PAGE_ITEMS)
          }
          compact={compact}
        />
      ))}
    </>
  );
}

function UpsellRail({
  rail,
  items,
  compact,
}: {
  rail: { heading?: string; imageUrl?: string | null };
  items: UpsellItem[];
  compact: boolean;
}) {
  const headingId = useId();
  if (items.length === 0) return null;
  const image = rail.imageUrl ? shopifyImageUrl(rail.imageUrl, { width: 800 }) : null;
  return (
    <section
      aria-labelledby={headingId}
      className={`${compact ? 'mt-6' : 'mt-10'} ${image ? 'rounded bg-cover bg-center p-3' : ''}`}
      style={image ? { backgroundImage: `url("${image}")` } : undefined}
      data-upsell-rail=""
    >
      <h2
        id={headingId}
        className={`${compact ? 'text-on-surface text-sm font-medium' : 'type-heading-md'} ${image ? 'bg-surface inline-block rounded px-2 py-1' : ''}`}
      >
        {rail.heading ?? 'You may also like'}
      </h2>
      <ul
        role="list"
        className={`mt-3 grid ${compact ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4'} ${image ? 'bg-surface rounded p-2' : ''}`}
      >
        {items.map((item) => (
          <UpsellCard key={item.handle} item={item} compact={compact} />
        ))}
      </ul>
    </section>
  );
}

/** Cart page cross-sell: product cards, 2 per row on phones and 4 from `lg` (templates review). */
const PAGE_ITEMS = 4;

function UpsellCard({ item, compact }: { item: UpsellItem; compact: boolean }) {
  const formatPrice = useFormatPrice();
  const cartId = useCart((state) => state.data.id);
  const ready = useCart(
    (state) => !state.loading && !('readyPromise' in state && state.readyPromise),
  );
  const [status, setStatus] = useState<'idle' | 'adding' | 'error'>('idle');
  const errorId = useId();

  const add = async () => {
    const updateCart = window.Shopify?.actions?.updateCart;
    // Wait for the connected store (skill: "Code-driven cart changes").
    if (!item.variantId || !updateCart || updateCart.isDefault() || !ready || !cartId) return;
    setStatus('adding');
    try {
      const result = await updateCart(
        { lines: [{ merchandiseId: item.variantId, quantity: 1 }] },
        {
          event: {
            context: 'cart',
            detail: {
              products: [
                {
                  id: item.variantId,
                  price: item.price,
                  title: item.variantTitle,
                  image: item.image,
                  product: { title: item.title, handle: item.handle },
                  selectedOptions: [],
                },
              ],
            },
          },
        },
      );
      setStatus(result.userErrors?.length ? 'error' : 'idle');
    } catch {
      setStatus('error');
    }
  };

  const size = compact ? 128 : 480;
  return (
    <li className={compact ? 'flex items-center gap-3' : 'flex flex-col gap-3'}>
      <div
        className={`bg-surface-secondary shrink-0 overflow-hidden ${compact ? 'size-16' : 'rounded-card aspect-square w-full'}`}
      >
        {item.image ? (
          <img
            src={shopifyImageUrl(item.image.url, { width: size, height: size, crop: 'center' })}
            alt={item.image.altText ?? ''}
            width={size / 2}
            height={size / 2}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          to={`/products/${item.handle}`}
          className="text-on-surface line-clamp-2 text-sm no-underline"
        >
          {item.title}
        </Link>
        <p className="text-on-surface-secondary mt-1 text-sm">{formatPrice(item.price)}</p>
        {status === 'error' ? (
          <p id={errorId} role="alert" className="text-critical mt-1 text-xs">
            Couldn&apos;t add this item. Please try again.
          </p>
        ) : null}
      </div>
      {item.variantId ? (
        <button
          type="button"
          onClick={() => void add()}
          aria-label={`Add ${item.title} to cart`}
          aria-describedby={status === 'error' ? errorId : undefined}
          aria-busy={status === 'adding' || undefined}
          disabled={status === 'adding'}
          className={`rounded-button button-outline inline-flex min-h-11 shrink-0 items-center justify-center px-4 text-sm disabled:opacity-60 ${compact ? '' : 'w-full'}`}
        >
          Add
        </button>
      ) : (
        <Link
          to={`/products/${item.handle}`}
          aria-label={`Choose options for ${item.title}`}
          className={`rounded-button button-outline inline-flex min-h-11 shrink-0 items-center justify-center px-4 text-sm no-underline ${compact ? '' : 'w-full'}`}
        >
          Choose
        </Link>
      )}
    </li>
  );
}

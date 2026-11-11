import { useEffect, useId, useMemo, useState } from 'react';
import { useRouteLoaderData } from 'react-router';

import { announceCart } from '~/components/cart-announcement';
import { Link, useLocalePath } from '~/components/LocaleLink';
import { useCart } from '~/lib/cart';
import type { CartDrawer, CartRail } from '~/lib/hcms/cart-display';
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
  /** Theme fallback collection for the automatic rail (T-2.159). */
  fallback?: UpsellProduct[];
  /** Collection / product-list results, indexed like the configured rails (P1-7). */
  rails?: UpsellProduct[][];
};

/** Drawer card rail (T-2.159): a few more than the list, they scroll sideways. */
const CARD_ITEMS = 6;

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

type Look = 'list' | 'cards' | 'page';

/**
 * "You may also like" (T-2.43) for the cart drawer and cart page: recommendations for the first
 * cart line's product (`/__hcms/upsell`, COMPLEMENTARY → RELATED → theme fallback collection),
 * loaded on the client only when `active` (drawer open / page mounted). Single-variant products add
 * in one click through Standard Actions `updateCart` (the cart store projects the line and tracks
 * pending/errors, per the `hydrogen-cart-ui` skill); others link to the product page. Prices come
 * from the server. Drawer look = theme `cart.upsell_layout` (T-2.159: `list` rows or `cards`).
 */
export function CartUpsell({ active, compact = false }: { active: boolean; compact?: boolean }) {
  const lines = useCart((state) => state.data.lines.nodes);
  const loading = useCart((state) => state.loading);
  const localize = useLocalePath();
  const root = useRouteLoaderData<{ cartRails?: CartRail[]; cartDrawer?: CartDrawer }>('root');
  const configured = root?.cartRails;
  const rails: (RailSpec & { heading?: string; imageUrl?: string | null })[] = configured?.length
    ? configured
    : DEFAULT_RAILS;
  const look: Look = compact ? (root?.cartDrawer?.upsellLayout ?? 'list') : 'page';
  const { handle, inCart } = useMemo(() => upsellSeed(lines), [lines]);
  const [data, setData] = useState<{ key: string; value: UpsellData | null } | null>(null);
  const query = upsellQuery(rails, handle, root?.cartDrawer?.fallbackCollection ?? null);
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
  const max = look === 'page' ? PAGE_ITEMS : look === 'cards' ? CARD_ITEMS : UPSELL_MAX;
  return (
    <>
      {rails.map((rail, i) => (
        <UpsellRail
          key={i}
          rail={rail}
          items={
            rail.source === 'auto'
              ? upsellItems(value, inCart, max)
              : railItems(value.rails?.[i], inCart, look === 'list' ? undefined : max)
          }
          look={look}
        />
      ))}
    </>
  );
}

const LIST_CLASS: Record<Look, string> = {
  list: 'grid grid-cols-1 gap-3',
  // Sideways scroll, snap per card; the cards keep a fixed width so nothing shifts as images load.
  cards: 'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]',
  page: 'grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4',
};

function UpsellRail({
  rail,
  items,
  look,
}: {
  rail: { heading?: string; imageUrl?: string | null };
  items: UpsellItem[];
  look: Look;
}) {
  const headingId = useId();
  if (items.length === 0) return null;
  const compact = look !== 'page';
  const image = rail.imageUrl ? shopifyImageUrl(rail.imageUrl, { width: 800 }) : null;
  return (
    <section
      aria-labelledby={headingId}
      className={`${compact ? 'mt-6' : 'mt-10'} ${image ? 'rounded bg-cover bg-center p-3' : ''}`}
      style={image ? { backgroundImage: `url("${image}")` } : undefined}
      data-upsell-rail=""
      data-upsell-layout={look}
    >
      <h2
        id={headingId}
        className={`${compact ? 'text-on-surface text-sm font-medium' : 'type-heading-md'} ${image ? 'bg-surface inline-block rounded px-2 py-1' : ''}`}
      >
        {rail.heading ?? 'You may also like'}
      </h2>
      <ul
        role="list"
        className={`mt-3 ${LIST_CLASS[look]} ${image ? 'bg-surface rounded p-2' : ''}`}
      >
        {items.map((item) => (
          <UpsellCard key={item.handle} item={item} look={look} />
        ))}
      </ul>
    </section>
  );
}

/** Cart page cross-sell: product cards, 2 per row on phones and 4 from `lg` (templates review). */
const PAGE_ITEMS = 4;

function UpsellCard({ item, look }: { item: UpsellItem; look: Look }) {
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
      const failed = Boolean(result.userErrors?.length);
      setStatus(failed ? 'error' : 'idle');
      // The card leaves the rail once the product is in the cart: say what happened (T-2.159).
      if (!failed) announceCart(`${item.title} added to your cart`);
    } catch {
      setStatus('error');
    }
  };

  const cards = look === 'cards';
  const row = look === 'list';
  const size = row ? 128 : cards ? 288 : 480;
  const button = `rounded-button button-outline inline-flex min-h-11 shrink-0 items-center justify-center text-sm ${row ? 'px-4' : cards ? 'w-full px-3' : 'w-full px-4'}`;
  return (
    <li
      className={
        row
          ? 'flex items-center gap-3'
          : cards
            ? 'flex w-36 shrink-0 snap-start flex-col gap-2'
            : 'flex flex-col gap-3'
      }
      data-upsell-card={cards ? '' : undefined}
    >
      <div
        className={`bg-surface-secondary shrink-0 overflow-hidden ${row ? 'size-16' : 'rounded-card aspect-square w-full'}`}
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
      <div className={`min-w-0 ${cards ? 'flex flex-1 flex-col' : 'flex-1'}`}>
        <Link
          to={`/products/${item.handle}`}
          className={`text-on-surface line-clamp-2 text-sm no-underline ${cards ? 'min-h-[2lh]' : ''}`}
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
          className={`${button} disabled:opacity-60`}
        >
          {cards ? (
            <>
              <span aria-hidden="true">+</span>&nbsp;Add
            </>
          ) : (
            'Add'
          )}
        </button>
      ) : (
        <Link
          to={`/products/${item.handle}`}
          aria-label={`Choose options for ${item.title}`}
          className={`${button} no-underline`}
        >
          Choose
        </Link>
      )}
    </li>
  );
}

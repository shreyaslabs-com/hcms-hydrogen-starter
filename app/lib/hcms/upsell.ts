/**
 * Cart upsell (T-2.43): pure helpers, so `node:test` can load them. Recommendations come from
 * `/__hcms/upsell?handle=` (Storefront `productRecommendations`, COMPLEMENTARY first, RELATED as
 * the fallback), fetched on the client after the cart drawer opens / the cart page loads.
 */

type Money = { amount: string; currencyCode: string };
type Img = { url: string; altText?: string | null; width?: number | null; height?: number | null };

export type UpsellProduct = {
  id: string;
  handle: string;
  title: string;
  availableForSale: boolean;
  featuredImage?: Img | null;
  variantsCount?: { count: number } | null;
  selectedOrFirstAvailableVariant?: {
    id: string;
    title: string;
    availableForSale: boolean;
    price: Money;
    image?: Img | null;
  } | null;
};

/** One card: `variantId` only when the product can be added in one click (single variant). */
export type UpsellItem = {
  handle: string;
  title: string;
  image: Img | null;
  price: Money;
  variantId: string | null;
  variantTitle: string;
};

export const UPSELL_MAX = 3;
export const UPSELL_HANDLE = /^[a-z0-9][a-z0-9-]{0,254}$/i;

/**
 * COMPLEMENTARY when the merchant set any up (Search & Discovery), else RELATED. Products already
 * in the cart, sold-out products and duplicates are dropped.
 */
export function upsellItems(
  data: { complementary?: UpsellProduct[] | null; related?: UpsellProduct[] | null } | null,
  excludeHandles: Iterable<string> = [],
  max = UPSELL_MAX,
): UpsellItem[] {
  const exclude = new Set(excludeHandles);
  const usable = (list?: UpsellProduct[] | null) =>
    (list ?? []).filter(
      (p) =>
        p?.handle &&
        p.availableForSale &&
        p.selectedOrFirstAvailableVariant?.availableForSale &&
        !exclude.has(p.handle),
    );
  const complementary = usable(data?.complementary);
  const source = complementary.length ? complementary : usable(data?.related);
  const seen = new Set<string>();
  const items: UpsellItem[] = [];
  for (const product of source) {
    const variant = product.selectedOrFirstAvailableVariant;
    if (!variant || seen.has(product.handle) || items.length >= max) continue;
    seen.add(product.handle);
    items.push({
      handle: product.handle,
      title: product.title,
      image: product.featuredImage ?? variant.image ?? null,
      price: variant.price,
      variantId: (product.variantsCount?.count ?? 2) === 1 ? variant.id : null,
      variantTitle: variant.title,
    });
  }
  return items;
}

type SeedLine = {
  merchandise?: { product?: { handle?: string | null } | null } | null;
  /** Build a box bundle line (Cart Transform merge): its items are in the cart too (S2-10). */
  lineComponents?: ReadonlyArray<unknown> | null;
};

const lineHandle = (line: SeedLine) => line.merchandise?.product?.handle;

/**
 * First cart line's product handle (the recommendation seed) and every handle in the cart,
 * including the items inside a merged Build a box line, so nothing in the cart is suggested.
 */
export function upsellSeed(lines: readonly SeedLine[]): {
  handle: string | null;
  inCart: string[];
} {
  const inCart = lines.flatMap((line) =>
    [line, ...((line.lineComponents ?? []) as SeedLine[])].flatMap((l) => {
      const handle = lineHandle(l);
      return handle ? [handle] : [];
    }),
  );
  const handle = inCart[0] ?? null;
  return { handle: handle && UPSELL_HANDLE.test(handle) ? handle : null, inCart };
}

/**
 * A boolean `main-cart` section setting from the published document (default when unset, not a
 * boolean, or no enabled `main-cart`), so the cart drawer (rendered on every page) follows the
 * same merchant toggles as the cart page.
 */
export function mainCartToggle(document: unknown, id: string, fallback: boolean): boolean {
  const value = mainCartSetting(document, id);
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Colour scheme class of the cart page (`main-cart` `color_scheme`, Dawn default `scheme-1`) for
 * the drawer's buttons, so Checkout looks the same in the drawer and on `/cart` (S2-11).
 */
export function mainCartSchemeClass(document: unknown): string {
  const value = mainCartSetting(document, 'color_scheme');
  const id = typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) ? value : 'scheme-1';
  return `color-${id}`;
}

function mainCartSetting(document: unknown, id: string): unknown {
  const cart = (
    document as {
      templates?: Record<
        string,
        {
          sections?: Record<
            string,
            { type?: string; disabled?: boolean; settings?: Record<string, unknown> }
          >;
        }
      >;
    } | null
  )?.templates?.cart;
  const main = Object.values(cart?.sections ?? {}).find(
    (s) => s?.type === 'main-cart' && !s.disabled,
  );
  return main?.settings?.[id];
}

/** `main-cart` `show_upsell` (default on). */
export function cartUpsellEnabled(document: unknown): boolean {
  return mainCartToggle(document, 'show_upsell', true);
}

/** Rails the client asks for (P1-7): the schema's rail minus the image, `auto` when unset. */
export type RailSpec = {
  source: 'auto' | 'collection' | 'products';
  collection?: string | null;
  products?: readonly string[];
};

export const UPSELL_RAIL_MAX = 2;
/** Products shown per rail: automatic rails keep the compact 3, chosen sources up to 6. */
export const UPSELL_RAIL_ITEMS = 6;
const PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d{1,20}$/;

/** No rails configured → the original single automatic rail. */
export const DEFAULT_RAILS: RailSpec[] = [{ source: 'auto' }];

/** Query string for `/__hcms/upsell` (`handle` seed, `c<i>` collection handle, `p<i>` product GIDs). */
export function upsellQuery(rails: readonly RailSpec[], seed: string | null): string {
  const params = new URLSearchParams();
  if (seed && rails.some((r) => r.source === 'auto')) params.set('handle', seed);
  rails.slice(0, UPSELL_RAIL_MAX).forEach((rail, i) => {
    if (rail.source === 'collection' && rail.collection) params.set(`c${i}`, rail.collection);
    if (rail.source === 'products' && rail.products?.length)
      params.set(`p${i}`, rail.products.join(','));
  });
  return params.toString();
}

export type UpsellRequest = {
  handle: string | null;
  collections: [string | null, string | null];
  ids: [string[], string[]];
};

/** Validates the route's params (public data, but handles/GIDs must still be well formed). */
export function parseUpsellRequest(params: URLSearchParams): UpsellRequest {
  const handle = params.get('handle')?.trim() ?? '';
  const collection = (i: number) => {
    const value = params.get(`c${i}`)?.trim() ?? '';
    return UPSELL_HANDLE.test(value) ? value : null;
  };
  const ids = (i: number) =>
    (params.get(`p${i}`) ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => PRODUCT_GID.test(id))
      .slice(0, UPSELL_RAIL_ITEMS);
  return {
    handle: UPSELL_HANDLE.test(handle) ? handle : null,
    collections: [collection(0), collection(1)],
    ids: [ids(0), ids(1)],
  };
}

/** Cards for a collection / hand-picked rail: sold-out, in-cart and duplicate products dropped. */
export function railItems(
  products: readonly (UpsellProduct | null)[] | null | undefined,
  excludeHandles: Iterable<string> = [],
  max = UPSELL_RAIL_ITEMS,
): UpsellItem[] {
  const list = (products ?? []).filter((p): p is UpsellProduct => Boolean(p?.handle));
  return upsellItems({ complementary: list }, excludeHandles, max);
}

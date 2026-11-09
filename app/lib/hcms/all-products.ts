/**
 * `/collections/all` (Online Store parity). Online Store always serves an "all products"
 * collection, but the Storefront API has `collection(handle: "all")` only when the merchant made
 * one. A real `all` collection wins; otherwise the route synthesizes the collection's meta and the
 * official grid lists root `products` (`@hcms/sections` `allProductsGridRequest`). Pure.
 */
export const ALL_PRODUCTS_HANDLE = 'all';

/** Theme content key (Dawn-style) for the synthesized title; Online Store titles it "Products". */
export const ALL_PRODUCTS_TITLE_KEY = 'collections.all.title';
export const ALL_PRODUCTS_TITLE = 'Products';

export type SyntheticCollectionMeta = {
  id: string;
  handle: string;
  title: string;
  description: string;
  seo: null;
  image: null;
};

/** The merchant's override for the current language, else "Products". */
export function allProductsTitle(strings: unknown): string {
  const value =
    strings && typeof strings === 'object'
      ? (strings as Record<string, unknown>)[ALL_PRODUCTS_TITLE_KEY]
      : undefined;
  return typeof value === 'string' && value.trim() ? value : ALL_PRODUCTS_TITLE;
}

/**
 * The collection meta a route renders: the real collection, else a synthesized "all products"
 * collection for the `all` handle, else null (404). `id` is empty: there is no Shopify resource.
 */
export function collectionMetaOrAll<T extends object>(
  handle: string,
  meta: T | null | undefined,
  title: string = ALL_PRODUCTS_TITLE,
): T | SyntheticCollectionMeta | null {
  if (meta) return meta;
  return handle === ALL_PRODUCTS_HANDLE ? syntheticAllCollection(title) : null;
}

export function syntheticAllCollection(
  title: string = ALL_PRODUCTS_TITLE,
): SyntheticCollectionMeta {
  return { id: '', handle: ALL_PRODUCTS_HANDLE, title, description: '', seo: null, image: null };
}

/** True for the synthesized collection (no Shopify id → skip `collection_viewed` analytics). */
export function isSyntheticCollection(meta: { id?: string | null; handle?: string }): boolean {
  return !meta.id && meta.handle === ALL_PRODUCTS_HANDLE;
}

/**
 * Cart line display helpers, pure so `node:test` can load them.
 * - SF-12: Shopify's lone default variant ("Title: Default Title") is not shown as an option.
 * - SF-27: the line links to the product page ON its variant (`?Color=Dawn`), like Dawn's cart.
 */
type Option = { name: string; value: string };

const isDefault = (option: Option) => option.value === 'Default Title';

/** "Dawn / Large", or '' for Shopify's default variant. */
export function lineOptionText(options: readonly Option[] | null | undefined): string {
  return (options ?? [])
    .filter((option) => !isDefault(option))
    .map((option) => option.value)
    .join(' / ');
}

/** `/products/<handle>?Color=Dawn` (no query for the default variant). */
export function lineProductPath(handle: string, options: readonly Option[] | null | undefined) {
  const params = new URLSearchParams(
    (options ?? []).filter((option) => !isDefault(option)).map((o) => [o.name, o.value]),
  );
  const query = params.toString();
  return `/products/${handle}${query ? `?${query}` : ''}`;
}

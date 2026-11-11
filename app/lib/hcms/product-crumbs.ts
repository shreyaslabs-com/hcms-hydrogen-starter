/**
 * Product page breadcrumbs (premium-theme parity P2): `main-product` `show_breadcrumbs` (default
 * off) → Home / <product>. T-2.158: `breadcrumbs_collection` (default on) adds the collection the
 * shopper came from (`?collection=<handle>`) or the product's first collection. Read on the server
 * from the resolved template, so the product route renders the same `Breadcrumbs` as content pages
 * (BreadcrumbList JSON-LD included). Pure.
 */
type TemplateLike = {
  order?: readonly string[];
  sections?: Record<string, { type?: string; disabled?: boolean; settings?: unknown } | undefined>;
};
type CrumbCollection = { handle: string; title: string } | null | undefined;

export function productCrumbs(
  template: TemplateLike | null | undefined,
  title: string,
  collection?: CrumbCollection,
): { label: string; to?: string }[] | undefined {
  const sections = template?.sections ?? {};
  const main = (template?.order ?? Object.keys(sections))
    .map((id) => sections[id])
    .find((section) => section?.type === 'main-product' && !section.disabled);
  const settings = main?.settings as Record<string, unknown> | undefined;
  if (settings?.show_breadcrumbs !== true || !title) return undefined;
  const viaCollection = settings.breadcrumbs_collection !== false && collection?.title;
  return viaCollection
    ? [{ label: collection.title, to: `/collections/${collection.handle}` }, { label: title }]
    : [{ label: title }];
}

/**
 * T-2.160 `main-collection-banner` `show_breadcrumbs` (default on, the trail collection pages
 * always had): false only when the template's enabled banner turns it off. JSON-LD stays either way.
 */
export function collectionCrumbsOn(template: TemplateLike | null | undefined): boolean {
  const sections = template?.sections ?? {};
  const banner = Object.values(sections).find(
    (section) => section?.type === 'main-collection-banner' && !section.disabled,
  );
  return (banner?.settings as Record<string, unknown> | undefined)?.show_breadcrumbs !== false;
}

/** `?collection=<handle>` when it is a valid handle (else the product's first collection). */
export function crumbCollectionHandle(url: URL): string {
  const handle = url.searchParams.get('collection')?.trim() ?? '';
  return /^[\w-]{1,255}$/.test(handle) ? handle : '';
}

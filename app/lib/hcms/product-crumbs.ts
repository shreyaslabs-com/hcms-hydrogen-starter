/**
 * Product page breadcrumbs (premium-theme parity P2): `main-product` `show_breadcrumbs` (default
 * off) → Home / <product>. Read on the server from the resolved template, so the product route
 * renders the same `Breadcrumbs` as content pages (BreadcrumbList JSON-LD included). Pure.
 */
type TemplateLike = {
  order?: readonly string[];
  sections?: Record<string, { type?: string; disabled?: boolean; settings?: unknown } | undefined>;
};

export function productCrumbs(
  template: TemplateLike | null | undefined,
  title: string,
): { label: string }[] | undefined {
  const sections = template?.sections ?? {};
  const main = (template?.order ?? Object.keys(sections))
    .map((id) => sections[id])
    .find((section) => section?.type === 'main-product' && !section.disabled);
  const on = (main?.settings as Record<string, unknown> | undefined)?.show_breadcrumbs === true;
  return on && title ? [{ label: title }] : undefined;
}

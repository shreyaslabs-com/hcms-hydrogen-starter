/**
 * S2-7: only `main-page` renders a page's `<h1>`. A page template without it (contact page made
 * of a contact form + text sections) would have no h1, so the route adds a visually hidden one.
 */
export function needsPageHeading(template: {
  order?: readonly string[];
  sections?: Readonly<Record<string, { type?: string; disabled?: boolean } | null | undefined>>;
}): boolean {
  const sections = template.sections ?? {};
  const ids = template.order ?? Object.keys(sections);
  return !ids.some((id) => {
    const section = sections[id];
    return section?.type === 'main-page' && section.disabled !== true;
  });
}

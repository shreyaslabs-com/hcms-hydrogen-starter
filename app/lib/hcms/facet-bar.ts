/**
 * Horizontal facet bar behaviour (T-2.90, Dawn `filter_type: horizontal`). Each filter is a
 * native `<details>` disclosure (keyboard + no-JS for free); this adds the dropdown manners:
 * one open at a time, Escape closes and returns focus to its `<summary>`, a click outside
 * the bar closes it. DOM-only (no React) so it is unit-testable with fakes.
 */
type DetailsLike = Element & { open: boolean };

function openPanels(root: Element): DetailsLike[] {
  return Array.from(root.querySelectorAll('details[open]')) as DetailsLike[];
}

export function bindFacetBar(
  root: Element,
  doc: Pick<Document, 'addEventListener' | 'removeEventListener'> = document,
) {
  const onKeydown = (event: Event) => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    const panel = (event.target as Element | null)?.closest?.(
      'details[open]',
    ) as DetailsLike | null;
    if (!panel || !root.contains(panel)) return;
    panel.open = false;
    (panel.querySelector('summary') as HTMLElement | null)?.focus();
    event.preventDefault();
  };
  // `toggle` doesn't bubble: listen in the capture phase.
  const onToggle = (event: Event) => {
    const current = event.target as DetailsLike;
    if (!current.open) return;
    for (const panel of openPanels(root)) if (panel !== current) panel.open = false;
  };
  const onOutside = (event: Event) => {
    const target = event.target as Node | null;
    if (target && root.contains(target)) return;
    for (const panel of openPanels(root)) panel.open = false;
  };
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('toggle', onToggle, true);
  doc.addEventListener('pointerdown', onOutside);
  return () => {
    root.removeEventListener('keydown', onKeydown);
    root.removeEventListener('toggle', onToggle, true);
    doc.removeEventListener('pointerdown', onOutside);
  };
}

/** The section data map (`section:<id>` → slice) of a fetched HCMS route loader result. */
export function nextPageSectionData(loaderData: unknown): Record<string, unknown> | null {
  const data = (loaderData as { hcms?: { data?: unknown } | null } | null | undefined)?.hcms?.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

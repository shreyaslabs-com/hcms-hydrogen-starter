/**
 * Below-the-fold section deferral (ADR 011, T-2.131). The SDK marks sections outside the first
 * screen with `data-hcms-defer` (`""` = by visibility, `"idle"` = fixed overlays). Before
 * hydrating, `entry.client` loads only the code of the other sections (and the theme blocks
 * inside them); a deferred section keeps its server HTML (React leaves its `<Suspense>` boundary
 * dehydrated) until its code loads: when it nears the viewport (~1 screen), on idle, or on the
 * first interaction, whichever comes first. `budgets.mjs` mirrors `planHydration`.
 *
 * In the entry chunk, so kept small: planning only (the pure part is unit-tested with
 * `node:test`, so relative imports only). The triggers live in `deferred-wake.ts`, loaded as soon
 * as hydration starts.
 */

export type SectionMark = {
  type: string;
  /** `null` = not deferred; `''` = by visibility; `'idle'` = idle / interaction only. */
  defer: string | null;
  /** Theme block types inside it (section-local blocks excluded). */
  blockTypes: readonly string[];
  /** Already on screen at boot (anchor link, scroll restore, short page): load it now. */
  inViewport: boolean;
};

export type HydrationPlan = {
  /** Types loaded before hydration. */
  eager: string[];
  /** Per deferred section (index in the marks): its types not already eager. */
  deferred: { index: number; types: string[]; idle: boolean }[];
};

/**
 * Splits the page's section / theme-block types (ADR 011): a section is eager unless marked
 * (and not already in view when marked by visibility); blocks follow their section; a type used
 * by any eager section, or by a block outside every section, is eager. Preview never defers.
 */
export function planHydration(
  sections: readonly SectionMark[],
  looseBlockTypes: readonly string[],
  preview = false,
): HydrationPlan {
  const later = (s: SectionMark) =>
    !preview && s.defer !== null && !(s.defer === '' && s.inViewport);
  const eager = new Set(looseBlockTypes);
  for (const s of sections) if (!later(s)) for (const t of [s.type, ...s.blockTypes]) eager.add(t);
  const deferred: HydrationPlan['deferred'] = [];
  sections.forEach((s, index) => {
    if (later(s))
      deferred.push({
        index,
        types: [...new Set([s.type, ...s.blockTypes])].filter((t) => !eager.has(t)),
        idle: s.defer === 'idle',
      });
  });
  return { eager: [...eager], deferred };
}

/** Reads the marks from the server HTML (one pass over sections, one over theme blocks). */
export function readSectionMarks(doc: Document) {
  const elements = [...doc.querySelectorAll('[data-hcms-section-type]')];
  const sections = elements.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      type: el.getAttribute('data-hcms-section-type') ?? '',
      defer: el.getAttribute('data-hcms-defer'),
      blockTypes: [] as string[],
      inViewport: rect.height > 0 && rect.top < innerHeight && rect.bottom > 0,
    };
  });
  const looseBlockTypes: string[] = [];
  for (const el of doc.querySelectorAll('[data-hcms-block-type]:not([data-hcms-local])')) {
    const owner = el.closest('[data-hcms-section-type]');
    (owner ? sections[elements.indexOf(owner)]?.blockTypes : looseBlockTypes)?.push(
      el.getAttribute('data-hcms-block-type') ?? '',
    );
  }
  return { elements, sections, looseBlockTypes };
}

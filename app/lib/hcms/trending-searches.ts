/**
 * Trending searches (T-2.72): the search drawer's empty state shows the terms of the first enabled
 * `trending-searches` section (@hcms/sections) whose `show_in_search` is on: a layout group's first
 * (header, footer, overlay), else the search template's (where the starting themes put it). Pure, so `node:test` can load it; read once by the root loader.
 * Limits match the section's (`TRENDING_MAX_TERMS`, 60 characters per term).
 */
export type SearchPromo = {
  imageUrl: string;
  heading: string | null;
  link: string | null;
  label: string | null;
};
export type TrendingSearches = {
  heading: string | null;
  terms: string[];
  /** Merchant-picked collection shown before typing (handle) + its heading. */
  popular: { handle: string; heading: string | null } | null;
  promo: SearchPromo | null;
  showCollections: boolean;
  showQueries: boolean;
};

type ResolveImage = (value: unknown) => string | null;
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
/** Same-site paths and https links only. */
const safeLink = (value: unknown) => {
  const link = text(value);
  return link && (/^\/(?!\/)/.test(link) || /^https:\/\//i.test(link)) ? link : null;
};
const HANDLE = /^[a-z0-9][a-z0-9-]{0,254}$/i;

const MAX_TERMS = 12;
const MAX_LENGTH = 60;

type Block = { type?: string; disabled?: boolean; settings?: Record<string, unknown> };
type Section = {
  type?: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
  blocks?: Record<string, Block>;
  block_order?: string[];
};
type Group = { order?: string[]; sections?: Record<string, Section> };

function termsOf(section: Section): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const blockId of section.block_order ?? []) {
    const block = section.blocks?.[blockId];
    const raw = block && !block.disabled ? block.settings?.term : null;
    if (typeof raw !== 'string') continue;
    const term = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

export function trendingSearchesFrom(
  document: unknown,
  resolveImage: ResolveImage = () => null,
): TrendingSearches | null {
  const doc = document as {
    groups?: Record<string, Group>;
    templates?: Record<string, Group>;
  } | null;
  const groups = doc?.groups ?? {};
  const places: (Group | undefined)[] = [
    groups.header,
    groups.footer,
    groups.overlay,
    doc?.templates?.search,
  ];
  for (const group of places) {
    for (const id of group?.order ?? []) {
      const section = group?.sections?.[id];
      if (section?.type !== 'trending-searches' || section.disabled) continue;
      const settings = section.settings ?? {};
      if (settings.show_in_search === false) continue;
      const terms = termsOf(section);
      const handle = text(settings.popular_collection);
      const imageUrl = resolveImage(settings.promo_image);
      const popular =
        handle && HANDLE.test(handle) ? { handle, heading: text(settings.popular_heading) } : null;
      const promo = imageUrl
        ? {
            imageUrl,
            heading: text(settings.promo_heading),
            link: safeLink(settings.promo_link),
            label: text(settings.promo_label),
          }
        : null;
      if (terms.length === 0 && !popular && !promo) continue;
      return {
        heading: text(settings.heading),
        terms,
        popular,
        promo,
        showCollections: settings.show_collections !== false,
        showQueries: settings.show_queries !== false,
      };
    }
  }
  return null;
}

/** `/search?q=…` (unprefixed; `LocaleLink` adds the market prefix). */
export const trendingSearchHref = (term: string) => `/search?q=${encodeURIComponent(term)}`;

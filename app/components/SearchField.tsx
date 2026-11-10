import { Suspense, lazy, useRef, useState } from 'react';
import { useNavigate, useRouteLoaderData } from 'react-router';

import type { TrendingSearches } from '~/lib/hcms/trending-searches';

import { useLocalePath } from '~/components/LocaleLink';
import { HeaderIcon } from '~/components/HeaderControls';

const FIELD_ID = 'header-search-field';
const PANEL_ID = 'header-search-panel';
const SearchDropdown = lazy(() =>
  import('~/components/SearchDrawer').then((m) => ({ default: m.SearchDropdown })),
);

/**
 * Header search field (`search_style: field`, replica P1-8). A real `GET /search` form, so it works
 * without JS. The suggestions panel (and its code) loads on the first focus/pointer; it opens under
 * the field while typing. Arrow Down moves into the panel, Escape closes and returns to the field,
 * a link click or focus leaving closes it. With nothing typed it only opens when the merchant set
 * up an empty state (trending terms, popular products or a promo); never a blank box.
 */
export function SearchField() {
  const navigate = useNavigate();
  const localize = useLocalePath();
  const wrapper = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  // The panel is wider than the field: it grows toward the middle of the screen, so a field on the
  // start side of the header (logo centred) doesn't push it off the edge (SF-5).
  const [alignStart, setAlignStart] = useState(false);
  const trending = useRouteLoaderData<{ trendingSearches?: TrendingSearches | null }>(
    'root',
  )?.trendingSearches;
  const hasEmptyState = Boolean(
    trending && (trending.terms.length > 0 || trending.popular || trending.promo),
  );
  const openPanel = (event?: { currentTarget: HTMLInputElement }) => {
    if (event && !event.currentTarget.value.trim() && !hasEmptyState) {
      setOpen(false);
      return;
    }
    const rect = wrapper.current?.getBoundingClientRect();
    if (rect) {
      const startHalf = (rect.left + rect.right) / 2 < window.innerWidth / 2;
      setAlignStart(document.documentElement.dir === 'rtl' ? !startHalf : startHalf);
    }
    setOpen(true);
  };

  const focusables = () =>
    Array.from(
      wrapper.current?.querySelectorAll<HTMLElement>(`#${PANEL_ID} a[href], #${PANEL_ID} button`) ??
        [],
    ).filter((el) => !(el as HTMLButtonElement).disabled);
  const focusField = () => document.getElementById(FIELD_ID)?.focus();

  return (
    <div
      ref={wrapper}
      className="relative"
      onPointerEnter={() => setArmed(true)}
      onBlur={(event) => {
        if (!wrapper.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest(`#${PANEL_ID} a`)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          focusField();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const items = focusables();
          if (!open || items.length === 0) return;
          event.preventDefault();
          const at = items.indexOf(document.activeElement as HTMLElement);
          const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
          if (next < 0) focusField();
          else items[Math.min(next, items.length - 1)]?.focus();
        }
      }}
    >
      <form
        role="search"
        action={localize('/search')}
        method="get"
        onSubmit={(event) => {
          const term = new FormData(event.currentTarget).get('q');
          if (typeof term !== 'string' || !term.trim()) return;
          event.preventDefault();
          setOpen(false);
          void navigate(`${localize('/search')}?q=${encodeURIComponent(term.trim())}`);
        }}
        className="relative"
      >
        <label htmlFor={FIELD_ID} className="sr-only">
          Search
        </label>
        <span
          className="pointer-events-none absolute start-3 top-1/2 inline-flex -translate-y-1/2 text-[color:var(--color-text,var(--color-on-surface))] opacity-70"
          aria-hidden="true"
        >
          <HeaderIcon name="search" />
        </span>
        <input
          id={FIELD_ID}
          type="search"
          name="q"
          autoComplete="off"
          placeholder="Search"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          data-testid="search-field"
          className="hcms-search-field__input focus-visible:outline-accent h-10 w-56 rounded-full border border-current/30 bg-transparent ps-10 pe-3 text-sm text-[color:var(--color-text,var(--color-on-surface))] placeholder:text-current placeholder:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:w-72"
          onFocus={(event) => {
            setArmed(true);
            openPanel(event);
          }}
          onInput={openPanel}
        />
      </form>
      <div
        id={PANEL_ID}
        role="dialog"
        aria-label="Search suggestions"
        hidden={!open}
        className={`bg-surface text-on-surface border-border absolute ${alignStart ? 'start-0' : 'end-0'} top-full z-50 mt-2 w-[min(34rem,90vw)] rounded border shadow-lg`}
      >
        {armed ? (
          <Suspense fallback={null}>
            <SearchDropdown inputId={FIELD_ID} open={open} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}

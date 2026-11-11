import type { BrowseLayoutProps } from '@hcms/hydrogen';
import { getSortByValue, type CollectionState } from '@shopify/hydrogen';
import { useCollection } from '@shopify/hydrogen/react';
import { Suspense, lazy, useEffect, useRef } from 'react';

import {
  ActiveFilterChips,
  ClearAllFilters,
  COLLECTION_SORT_OPTIONS,
  currentSortValue,
  FacetForm,
  FilterDrawer,
  HorizontalFacets,
  SEARCH_SORT_OPTIONS,
  Toolbar,
} from '~/components/CollectionBrowse';

/** T-2.160 floating "Sort | Filter" bar: its own chunk, fetched only for that mobile layout. */
const FloatingBrowseBar = lazy(() => import('~/components/hcms/FloatingBrowseBar'));

/**
 * The storefront's `BrowseLayout` (D-22): Hydrogen collection-browse UI (filters, sort, active
 * chips) around the official product grid. Needs the route's `CollectionProvider`.
 * Dawn layouts (desktop): `vertical` = sidebar, `horizontal` = facet bar of dropdowns above the
 * grid (T-2.90), `drawer` = filter drawer. Mobile always uses the drawer. `sticky`
 * (`enable_sticky_filters`) pins the filter/sort bar below the sticky header.
 */
export function BrowseLayout({
  kind,
  basePath,
  filters,
  currencyCode,
  enableFiltering,
  enableSorting,
  layout,
  productCount,
  sticky = false,
  mobileLayout = 'drawer',
  sortStyle = 'dropdown',
  children,
}: BrowseLayoutProps) {
  const hasFilters = enableFiltering && filters.length > 0;
  const sidebar = hasFilters && layout === 'vertical';
  const horizontal = hasFilters && layout === 'horizontal';
  // T-2.160 phones: compact dropdown pills, or the floating "Sort | Filter" bar (lazy chunk).
  const mobileBar = hasFilters && mobileLayout === 'dropdowns';
  const floating = mobileLayout === 'floating' && (hasFilters || enableSorting);
  const facetsWhere = horizontal ? (mobileBar ? 'all' : 'desktop') : mobileBar ? 'mobile' : null;
  const sortOptions = kind === 'search' ? SEARCH_SORT_OPTIONS : COLLECTION_SORT_OPTIONS;
  const defaultSortValue = getSortByValue(
    kind === 'search' ? 'RELEVANCE' : 'COLLECTION_DEFAULT',
    false,
  );
  const state: CollectionState = useCollection();
  const bar = useRef<HTMLDivElement>(null);

  // Sticky bar sits below a sticky header (its height varies with the header settings).
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header.sticky');
    if (sticky && header) bar.current?.style.setProperty('top', `${header.offsetHeight}px`);
  }, [sticky]);

  // null = more pages exist and the Storefront API has no collection total: no count.
  const countText =
    productCount === null ? '' : `${productCount} ${productCount === 1 ? 'product' : 'products'}`;
  const controls = (
    <>
      <Toolbar
        countText={countText}
        sortOptions={sortOptions}
        defaultSortValue={defaultSortValue}
        showFilterButton={hasFilters}
        filterButtonOnDesktop={!sidebar && !horizontal}
        filterButtonOnMobile={!mobileBar && !floating}
        showSort={enableSorting}
        sortOnMobile={!floating}
        sortStyle={sortStyle}
      />
      {facetsWhere ? (
        <HorizontalFacets
          availableFilters={filters}
          currencyCode={currencyCode}
          where={facetsWhere}
        />
      ) : null}
    </>
  );
  const results = (
    // Floating bar: room below the last row so the pill never covers pagination (phones).
    <div className={floating ? 'max-lg:pb-20' : undefined}>
      {sticky ? (
        <div ref={bar} className="bg-surface sticky top-0 z-30 pt-3">
          {controls}
        </div>
      ) : (
        controls
      )}
      {enableFiltering ? (
        <ActiveFilterChips basePath={basePath} clearAllTo={basePath} currencyCode={currencyCode} />
      ) : null}
      {children}
    </div>
  );
  return (
    <>
      {sidebar ? (
        <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-10">
          <aside className="hidden lg:block" aria-label="Filters">
            <div className="sticky top-24">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="type-heading-sm text-on-surface">Filters</h2>
                {enableFiltering ? <ClearAllFilters to={basePath} /> : null}
              </div>
              <FacetForm availableFilters={filters} currencyCode={currencyCode} />
            </div>
          </aside>
          {results}
        </div>
      ) : (
        results
      )}
      {hasFilters ? (
        <FilterDrawer
          availableFilters={filters}
          currencyCode={currencyCode}
          clearAllTo={basePath}
          countText={countText}
        />
      ) : null}
      {floating ? (
        <Suspense fallback={null}>
          <FloatingBrowseBar
            sortOptions={sortOptions}
            sortValue={currentSortValue(state) ?? defaultSortValue}
            showSort={enableSorting}
            showFilter={hasFilters}
          />
        </Suspense>
      ) : null}
    </>
  );
}

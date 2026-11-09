import type { BrowseLayoutProps } from '@hcms/hydrogen';
import { getSortByValue } from '@shopify/hydrogen';
import { useEffect, useRef } from 'react';

import {
  ActiveFilterChips,
  ClearAllFilters,
  COLLECTION_SORT_OPTIONS,
  FacetForm,
  FilterDrawer,
  HorizontalFacets,
  SEARCH_SORT_OPTIONS,
  Toolbar,
} from '~/components/CollectionBrowse';

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
  children,
}: BrowseLayoutProps) {
  const hasFilters = enableFiltering && filters.length > 0;
  const sidebar = hasFilters && layout === 'vertical';
  const horizontal = hasFilters && layout === 'horizontal';
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
        sortOptions={kind === 'search' ? SEARCH_SORT_OPTIONS : COLLECTION_SORT_OPTIONS}
        defaultSortValue={getSortByValue(
          kind === 'search' ? 'RELEVANCE' : 'COLLECTION_DEFAULT',
          false,
        )}
        showFilterButton={hasFilters}
        filterButtonOnDesktop={!sidebar && !horizontal}
        showSort={enableSorting}
      />
      {horizontal ? (
        <HorizontalFacets availableFilters={filters} currencyCode={currencyCode} />
      ) : null}
    </>
  );
  const results = (
    <div>
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
    </>
  );
}

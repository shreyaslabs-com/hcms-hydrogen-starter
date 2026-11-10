import {
  formatMoney,
  getFilterRemovalUrl,
  getSortByValue,
  isFilterInputActive,
  parseCollectionParams,
  serializeCollectionParams,
  type CollectionState,
  type MoneyV2,
  type ProductFilter,
} from '@shopify/hydrogen';
import { useCollection, useCollectionForm } from '@shopify/hydrogen/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFetcher, useLocation } from 'react-router';
import type { BrowseFilterView, NextPage } from '@hcms/hydrogen';
import { Link, useLocalePath } from '~/components/LocaleLink';
import { FacetValues, type FacetOption } from '~/components/hcms/FacetValues';
import { bindFacetBar, nextPageSectionData } from '~/lib/hcms/facet-bar';
import { facetDisplay, swatchPaint } from '~/lib/hcms/filter-display';

import { DEFAULT_MONEY_LOCALE, useFormatPrice } from '~/lib/money';

export type SortOption = {
  label: string;
  value: string;
};

export const COLLECTION_SORT_OPTIONS: SortOption[] = [
  { label: 'Featured', value: getSortByValue('COLLECTION_DEFAULT', false) },
  { label: 'Best selling', value: getSortByValue('BEST_SELLING', false) },
  { label: 'Alphabetically, A–Z', value: getSortByValue('TITLE', false) },
  { label: 'Alphabetically, Z–A', value: getSortByValue('TITLE', true) },
  { label: 'Price, low to high', value: getSortByValue('PRICE', false) },
  { label: 'Price, high to low', value: getSortByValue('PRICE', true) },
  { label: 'Date, old to new', value: getSortByValue('CREATED', false) },
  { label: 'Date, new to old', value: getSortByValue('CREATED', true) },
];

export const SEARCH_SORT_OPTIONS: SortOption[] = [
  { label: 'Relevance', value: getSortByValue('RELEVANCE', false) },
  { label: 'Price, low to high', value: getSortByValue('PRICE', false) },
  { label: 'Price, high to low', value: getSortByValue('PRICE', true) },
];

export type BrowseFilterValue = {
  id: string;
  label: string;
  count: number;
  input?: string | null;
  swatch?: {
    color?: string | null;
    image?: {
      previewImage?: {
        url?: string | null;
        altText?: string | null;
      } | null;
    } | null;
  } | null;
};

export type BrowseFilter = {
  id: string;
  label: string;
  type?: string | null;
  presentation?: string | null;
  /** T-2.114 merchant presentation (`filter_settings`, resolved by the grid section). */
  view?: BrowseFilterView;
  values: readonly BrowseFilterValue[];
};

export type BrowsePageInfo = {
  hasNextPage: boolean;
  endCursor?: string | null;
};

type LoadMoreResponse<T> = {
  products: readonly T[];
  pageInfo: BrowsePageInfo;
  dataSearch: string;
};

const FILTER_DRAWER_ID = 'collection-filter-drawer';
const PRICE_MIN_PARAM = 'filter.v.price.gte';
const PRICE_MAX_PARAM = 'filter.v.price.lte';

function supportsDialogCommands(): boolean {
  if (typeof HTMLButtonElement === 'undefined') return false;
  return (
    'command' in HTMLButtonElement.prototype && 'commandForElement' in HTMLButtonElement.prototype
  );
}

function openDialogFallback(id: string): void {
  if (supportsDialogCommands() || typeof document === 'undefined') return;
  const dialog = document.getElementById(id);
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

function closeDialog(id: string): void {
  if (typeof document === 'undefined') return;
  const dialog = document.getElementById(id);
  if (dialog instanceof HTMLDialogElement) dialog.close();
}

function requestFormSubmit(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  event.currentTarget.form?.requestSubmit();
}

function currentSortValue(state: CollectionState): string | undefined {
  return state.sortKey ? getSortByValue(state.sortKey, state.reverse) : undefined;
}

function filterValueInputParamEntries(input: string): Array<{ name: string; value: string }> {
  let filter: ProductFilter;
  try {
    filter = JSON.parse(input) as ProductFilter;
  } catch {
    return [];
  }

  return Array.from(
    serializeCollectionParams({ filters: [filter], sortKey: undefined, reverse: false }),
    ([name, value]) => ({ name, value }),
  );
}

function hiddenInputsFromParams(params: URLSearchParams, exclude = new Set<string>()) {
  return Array.from(params).flatMap(([name, value], index) => {
    if (exclude.has(name)) return [];
    return <input key={`${name}-${value}-${index}`} type="hidden" name={name} value={value} />;
  });
}

function activeFilterParams(state: CollectionState) {
  return serializeCollectionParams({ filters: state.filters, sortKey: undefined, reverse: false });
}

function buildPathWithRemoval(basePath: string, removal: string): string {
  if (removal === '?') return basePath;

  const [pathname, existingSearch = ''] = basePath.split('?');
  const params = new URLSearchParams(existingSearch);
  const removalParams = new URLSearchParams(removal.startsWith('?') ? removal.slice(1) : removal);

  for (const [name, value] of removalParams) params.append(name, value);

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function priceFilter(state: CollectionState) {
  return state.filters.find((filter) => filter.price != null)?.price;
}

function money(amount: number, currencyCode: string): MoneyV2 {
  return { amount: String(amount), currencyCode };
}

function describeFilter(
  filter: ProductFilter,
  currencyCode: string,
  formatPrice: (money: MoneyV2) => string,
): string {
  if (filter.available != null) return filter.available ? 'In stock' : 'Out of stock';
  if (filter.productType) return filter.productType;
  if (filter.productVendor) return filter.productVendor;
  if (filter.tag) return filter.tag;
  if (filter.variantOption) return filter.variantOption.value ?? filter.variantOption.name;
  if (filter.productMetafield) return filter.productMetafield.value ?? filter.productMetafield.key;
  if (filter.variantMetafield) return filter.variantMetafield.value ?? filter.variantMetafield.key;
  if (filter.taxonomyMetafield) return filter.taxonomyMetafield.value;
  if (filter.category) return filter.category.id;
  if (filter.price) {
    const min = filter.price.min;
    const max = filter.price.max;
    if (min != null && max != null) {
      return `${formatPrice(money(min, currencyCode))} – ${formatPrice(money(max, currencyCode))}`;
    }
    if (min != null) return `From ${formatPrice(money(min, currencyCode))}`;
    if (max != null) return `Up to ${formatPrice(money(max, currencyCode))}`;
  }
  return 'Filter';
}

function activeValueCount(filter: BrowseFilter, state: CollectionState): number {
  if (filter.type === 'PRICE_RANGE') return priceFilter(state) ? 1 : 0;
  return filter.values.filter(
    (value) => value.input && isFilterInputActive(state.filters, value.input),
  ).length;
}

function isMutuallyExclusive(filter: BrowseFilter, inputName: string): boolean {
  return filter.type === 'BOOLEAN' || inputName === 'filter.v.availability';
}

function uncheckSiblings(input: HTMLInputElement) {
  const form = input.form;
  if (!form) return;
  for (const candidate of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    if (candidate !== input && candidate.name === input.name) candidate.checked = false;
  }
}

function FacetGroup({
  filter,
  state,
  currencyCode,
}: {
  filter: BrowseFilter;
  state: CollectionState;
  currencyCode: string;
}) {
  const selectedCount = activeValueCount(filter, state);
  const labelId = useId();

  return (
    <details className="group block" open={!filter.view?.collapsed}>
      <summary className="marker-hidden text-on-surface flex w-full cursor-pointer items-center justify-between py-4 text-sm font-medium motion-safe:transition motion-safe:active:scale-[0.97]">
        <span className="inline-flex items-center gap-1.5" aria-hidden="true">
          <span id={labelId} aria-hidden="true">
            {filter.label}
          </span>
          {selectedCount > 0 ? (
            <span
              className="bg-interactive text-interactive-text inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium"
              aria-hidden="true"
            >
              {selectedCount}
            </span>
          ) : null}
        </span>
        <span className="sr-only">
          {selectedCount > 0 ? `${filter.label}, ${selectedCount} selected` : filter.label}
        </span>
        <span
          className="inline-flex size-4 shrink-0 items-center justify-center group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200"
          aria-hidden="true"
        >
          <img src="/icons/icon-chevron-down.svg" alt="" className="size-4" />
        </span>
      </summary>
      <div className="pb-4">
        <FacetBody filter={filter} state={state} labelId={labelId} currencyCode={currencyCode} />
      </div>
    </details>
  );
}

function ValuesFacet({
  filter,
  state,
  labelId,
  display,
}: {
  filter: BrowseFilter;
  state: CollectionState;
  labelId: string;
  display: 'list' | 'swatches' | 'buttons';
}) {
  const options = filter.values.flatMap((value): FacetOption[] => {
    if (!value.input) return [];
    const entries = filterValueInputParamEntries(value.input);
    if (entries.length !== 1) return [];
    const [{ name, value: paramValue }] = entries;
    const paint = display === 'swatches' ? swatchPaint(value) : null;
    return [
      {
        id: value.id,
        label: value.label,
        count: value.count,
        name,
        value: paramValue,
        active: isFilterInputActive(state.filters, value.input),
        ...(paint ? { color: paint.color, image: paint.image } : {}),
      },
    ];
  });
  return (
    <FacetValues
      labelId={labelId}
      display={display}
      options={options}
      maxValues={filter.view?.maxValues}
      onChange={(event, option) => {
        if (event.currentTarget.checked && isMutuallyExclusive(filter, option.name)) {
          uncheckSiblings(event.currentTarget);
        }
        requestFormSubmit(event);
      }}
    />
  );
}

function PriceRangeFacet({
  state,
  currencyCode,
}: {
  state: CollectionState;
  currencyCode: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minInput = useRef<HTMLInputElement>(null);
  const maxInput = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const minId = `${idPrefix}-price-gte`;
  const maxId = `${idPrefix}-price-lte`;
  const activePrice = priceFilter(state);
  const min = activePrice?.min ?? '';
  const max = activePrice?.max ?? '';
  const currencySymbol = formatMoney(
    { amount: '0', currencyCode },
    { locale: DEFAULT_MONEY_LOCALE },
  ).currencyNarrowSymbol;

  useEffect(() => {
    for (const [input, value] of [
      [minInput.current, min],
      [maxInput.current, max],
    ] as const) {
      if (!input) continue;
      const matches =
        value === '' ? input.value === '' : input.value !== '' && Number(input.value) === value;
      if (!matches) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        input.value = String(value);
      }
    }
  }, [min, max]);

  useEffect(() => {
    function restoreHistoryPrice() {
      // Cancel the draft before the history loader settles, even when the price is unchanged.
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const { filters } = parseCollectionParams(new URLSearchParams(window.location.search));
      const price = filters.find((filter) => filter.price != null)?.price;
      if (minInput.current) minInput.current.value = String(price?.min ?? '');
      if (maxInput.current) maxInput.current.value = String(price?.max ?? '');
    }

    window.addEventListener('popstate', restoreHistoryPrice);
    return () => {
      window.removeEventListener('popstate', restoreHistoryPrice);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function submitAfterTyping(event: React.ChangeEvent<HTMLInputElement>) {
    if (timer.current) clearTimeout(timer.current);
    const form = event.currentTarget.form;
    timer.current = setTimeout(() => form?.requestSubmit(), 350);
  }

  return (
    <div className="min-w-0 pt-2">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <label
          htmlFor={minId}
          className="border-border rounded-input bg-surface has-[input:focus-visible]:outline-interactive flex min-w-0 items-center gap-1 border px-2 py-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2"
        >
          <span className="text-on-surface-secondary shrink-0 text-sm" aria-hidden="true">
            {currencySymbol}
          </span>
          <input
            type="number"
            ref={minInput}
            id={minId}
            aria-label={`Minimum price in ${currencyCode}`}
            name={PRICE_MIN_PARAM}
            min="0"
            step="any"
            placeholder="Min"
            defaultValue={min}
            className="bg-surface text-on-surface w-full min-w-0 flex-1 rounded-none border-0 p-0 text-sm focus-visible:outline-none"
            onChange={submitAfterTyping}
          />
        </label>
        <span className="text-on-surface-secondary text-center text-sm">to</span>
        <label
          htmlFor={maxId}
          className="border-border rounded-input bg-surface has-[input:focus-visible]:outline-interactive flex min-w-0 items-center gap-1 border px-2 py-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2"
        >
          <span className="text-on-surface-secondary shrink-0 text-sm" aria-hidden="true">
            {currencySymbol}
          </span>
          <input
            type="number"
            ref={maxInput}
            id={maxId}
            aria-label={`Maximum price in ${currencyCode}`}
            name={PRICE_MAX_PARAM}
            min="0"
            step="any"
            placeholder="Max"
            defaultValue={max}
            className="bg-surface text-on-surface w-full min-w-0 flex-1 rounded-none border-0 p-0 text-sm focus-visible:outline-none"
            onChange={submitAfterTyping}
          />
        </label>
      </div>
    </div>
  );
}

function FacetBody({
  filter,
  state,
  labelId,
  currencyCode,
}: {
  filter: BrowseFilter;
  state: CollectionState;
  labelId: string;
  currencyCode: string;
}) {
  const display = facetDisplay(filter);
  if (display === 'price') return <PriceRangeFacet state={state} currencyCode={currencyCode} />;
  return <ValuesFacet filter={filter} state={state} labelId={labelId} display={display} />;
}

export function Toolbar({
  countText,
  defaultSortValue,
  sortOptions,
  extraHiddenInputs,
  filterDrawerId = FILTER_DRAWER_ID,
  showFilterButton = true,
  filterButtonOnDesktop = false,
  showSort = true,
}: {
  countText: string;
  defaultSortValue: string;
  sortOptions: SortOption[];
  extraHiddenInputs?: ReactNode;
  filterDrawerId?: string;
  /** HCMS `BrowseLayout` (D-22): filtering/sorting toggles and the desktop drawer layout. */
  showFilterButton?: boolean;
  filterButtonOnDesktop?: boolean;
  showSort?: boolean;
}) {
  const state: CollectionState = useCollection();
  const { formProps } = useCollectionForm();
  const resolvedSortValue = currentSortValue(state) ?? defaultSortValue;
  const hiddenParams = activeFilterParams(state);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        {showFilterButton ? (
          <button
            type="button"
            commandfor={filterDrawerId}
            command="show-modal"
            className={`button-outline rounded-button focus-visible:outline-accent min-h-touch-target inline-flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97] ${filterButtonOnDesktop ? '' : 'lg:hidden'}`}
            aria-controls={filterDrawerId}
            aria-haspopup="dialog"
            onClick={() => openDialogFallback(filterDrawerId)}
          >
            <span
              className="inline-flex size-5 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <img src="/icons/icon-filter.svg" alt="" className="size-5" />
            </span>
            Filters
            {state.filters.length > 0 ? (
              <>
                <span className="hcms-filter-count" aria-hidden="true">
                  {state.filters.length}
                </span>
                <span className="sr-only">{`, ${state.filters.length} applied`}</span>
              </>
            ) : null}
          </button>
        ) : null}
        <span className="text-on-surface-secondary min-w-0 text-sm break-words" aria-live="polite">
          {countText}
        </span>
      </div>
      {showSort ? (
        <form {...formProps()} method="get" className="flex min-w-0 items-center gap-2">
          {hiddenInputsFromParams(hiddenParams)}
          {extraHiddenInputs}
          <label
            htmlFor="sort-by"
            className="text-on-surface-secondary shrink-0 text-sm whitespace-nowrap"
          >
            Sort by
          </label>
          <select
            id="sort-by"
            name="sort_by"
            value={resolvedSortValue}
            className="w-auto max-w-full cursor-pointer font-medium"
            onChange={requestFormSubmit}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <noscript>
            <button
              type="submit"
              className="button-outline rounded-button focus-visible:outline-accent min-h-touch-target inline-flex shrink-0 cursor-pointer items-center justify-center px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Sort
            </button>
          </noscript>
        </form>
      ) : null}
    </div>
  );
}

export function FacetForm({
  availableFilters,
  currencyCode,
  extraHiddenInputs,
  bar = false,
}: {
  availableFilters: readonly BrowseFilter[];
  currencyCode: string;
  extraHiddenInputs?: ReactNode;
  /** T-2.90 horizontal facet bar: one dropdown per filter (see `HorizontalFacets`). */
  bar?: boolean;
}) {
  const state: CollectionState = useCollection();
  const { formProps } = useCollectionForm();
  const sort = currentSortValue(state);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => (bar && list.current ? bindFacetBar(list.current) : undefined), [bar]);

  return (
    <form {...formProps()} method="get" {...(bar ? { 'aria-label': 'Filters' } : {})}>
      {sort ? <input type="hidden" name="sort_by" value={sort} /> : null}
      {extraHiddenInputs}
      {bar ? (
        <ul key={state.handle} ref={list} role="list" className="flex flex-wrap gap-2">
          {availableFilters.map((filter) => (
            <li key={filter.id}>
              <FacetDropdown filter={filter} state={state} currencyCode={currencyCode} />
            </li>
          ))}
        </ul>
      ) : (
        <div key={state.handle} className="divide-border divide-y">
          {availableFilters.map((filter) => (
            <FacetGroup key={filter.id} filter={filter} state={state} currencyCode={currencyCode} />
          ))}
        </div>
      )}
      <noscript>
        <button
          type="submit"
          className="rounded-button button-primary focus-visible:outline-accent mt-4 inline-flex h-11 items-center justify-center px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Apply filters
        </button>
      </noscript>
    </form>
  );
}

export function FilterDrawer({
  availableFilters,
  currencyCode,
  extraHiddenInputs,
  id = FILTER_DRAWER_ID,
  clearAllTo,
  countText,
}: {
  availableFilters: readonly BrowseFilter[];
  currencyCode: string;
  extraHiddenInputs?: ReactNode;
  id?: string;
  /** T-2.118: Online Store drawer footer — "Clear all" (when filters are applied) + results. */
  clearAllTo?: string;
  countText?: string;
}) {
  const state: CollectionState = useCollection();
  return (
    <dialog
      id={id}
      className="drawer-left bg-surface text-on-surface"
      aria-labelledby="filter-drawer-title"
      closedby="any"
    >
      <div className="flex h-full flex-col">
        <div className="border-border flex shrink-0 items-center border-b py-2 ps-4">
          <h2 id="filter-drawer-title" className="text-on-surface flex-1 text-lg font-medium">
            Filters
            {countText ? (
              <span className="text-on-surface-secondary ms-2 text-sm font-normal">
                {countText}
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            commandfor={id}
            command="close"
            className="button-icon focus-visible:outline-accent inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]"
            aria-label="Close"
            onClick={() => closeDialog(id)}
          >
            <img src="/icons/icon-x.svg" alt="" className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <FacetForm
            availableFilters={availableFilters}
            currencyCode={currencyCode}
            extraHiddenInputs={extraHiddenInputs}
          />
        </div>
        {clearAllTo !== undefined ? (
          <div className="hcms-filter-drawer__footer border-border border-t">
            {state.filters.length > 0 ? (
              <Link
                to={clearAllTo}
                preventScrollReset
                className="hcms-filter-clear"
                onClick={() => closeDialog(id)}
              >
                Clear all
              </Link>
            ) : (
              <span />
            )}
            <button
              type="button"
              commandfor={id}
              command="close"
              className="rounded-button button-primary focus-visible:outline-accent inline-flex h-11 cursor-pointer items-center justify-center px-5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => closeDialog(id)}
            >
              {countText ? `View ${countText}` : 'View results'}
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

/** "Clear all" next to the sidebar heading (T-2.118); nothing when no filter is applied. */
export function ClearAllFilters({ to }: { to: string }) {
  const state: CollectionState = useCollection();
  if (state.filters.length === 0) return null;
  return (
    <Link to={to} preventScrollReset className="hcms-filter-clear">
      Clear all
    </Link>
  );
}

export function ActiveFilterChips({
  basePath,
  clearAllTo,
  currencyCode,
}: {
  basePath: string;
  clearAllTo: string;
  currencyCode: string;
}) {
  const state: CollectionState = useCollection();
  const formatPrice = useFormatPrice();
  if (state.filters.length === 0) return null;

  const currentParams = serializeCollectionParams(state);

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-2"
      role="region"
      aria-label="Active filters"
    >
      {state.filters.map((filter, index) => {
        const label = describeFilter(filter, currencyCode, formatPrice);
        const removal = getFilterRemovalUrl(currentParams, filter);
        const to = buildPathWithRemoval(basePath, removal);

        return (
          <Link
            key={`${label}-${index}-${removal}`}
            to={to}
            preventScrollReset
            className="chip-filled hover:bg-border min-h-touch-target inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]"
            aria-label={`Remove ${label} filter`}
          >
            {label}
            <span
              className="inline-flex size-4 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <img src="/icons/icon-x.svg" alt="" className="size-4" />
            </span>
          </Link>
        );
      })}
      <Link to={clearAllTo} preventScrollReset className="hcms-filter-clear">
        Clear all
      </Link>
    </div>
  );
}

export function useLoadMore<T>(
  initialNodes: readonly T[],
  initialPageInfo: BrowsePageInfo,
  dataSearch: string,
) {
  const fetcher = useFetcher();
  const [nodes, setNodes] = useState<readonly T[]>(initialNodes);
  const [pageInfo, setPageInfo] = useState<BrowsePageInfo>(initialPageInfo);
  const requestedSearch = useRef<string | null>(null);
  const appendedSearches = useRef(new Set<string>());

  useEffect(() => {
    setNodes(initialNodes);
    setPageInfo(initialPageInfo);
    requestedSearch.current = null;
    appendedSearches.current.clear();
  }, [dataSearch, initialNodes, initialPageInfo]);

  useEffect(() => {
    const data = fetcher.data as LoadMoreResponse<T> | undefined;
    if (!data || data.dataSearch !== requestedSearch.current) return;
    if (appendedSearches.current.has(data.dataSearch)) return;

    appendedSearches.current.add(data.dataSearch);
    requestedSearch.current = null;
    setNodes((current) => [...current, ...data.products]);
    setPageInfo(data.pageInfo);
  }, [fetcher.data]);

  return {
    nodes,
    pageInfo,
    isLoading: fetcher.state !== 'idle',
    loadMore: (href: string, nextDataSearch: string) => {
      requestedSearch.current = nextDataSearch;
      fetcher.load(href);
    },
  };
}

export function LoadMore({
  pageInfo,
  loadedCount,
  countLabel,
  isLoading,
  onLoad,
}: {
  pageInfo: BrowsePageInfo;
  loadedCount: number;
  countLabel?: string;
  isLoading: boolean;
  onLoad: (href: string, nextDataSearch: string) => void;
}) {
  const location = useLocation();

  if (!pageInfo.hasNextPage || !pageInfo.endCursor) return null;

  const params = new URLSearchParams(location.search);
  params.set('after', pageInfo.endCursor);
  const nextSearch = params.toString();
  const href = `${location.pathname}?${nextSearch}`;

  return (
    <div className="mt-12 flex flex-col items-center gap-3">
      <p className="text-on-surface-secondary text-sm">
        {countLabel ?? `Showing ${loadedCount} products`}
      </p>
      <Link
        to={href}
        preventScrollReset
        aria-disabled={isLoading}
        className={`button-outline rounded-button focus-visible:outline-accent inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97] ${isLoading ? 'pointer-events-none opacity-50' : ''}`}
        onClick={(event) => {
          event.preventDefault();
          if (!isLoading) onLoad(href, nextSearch);
        }}
      >
        {isLoading ? 'Loading…' : 'Load more'}
      </Link>
    </div>
  );
}

/**
 * Dawn `filter_type: horizontal` (T-2.90): one dropdown disclosure per filter in a bar above the
 * grid (desktop; mobile uses the drawer). Native `<details>` = keyboard + no-JS; `bindFacetBar`
 * adds Escape / one-open / close-outside.
 */
export function HorizontalFacets(props: {
  availableFilters: readonly BrowseFilter[];
  currencyCode: string;
}) {
  return (
    <div className="mb-4 hidden lg:block">
      <FacetForm {...props} bar />
    </div>
  );
}

function FacetDropdown({
  filter,
  state,
  currencyCode,
}: {
  filter: BrowseFilter;
  state: CollectionState;
  currencyCode: string;
}) {
  const selectedCount = activeValueCount(filter, state);
  const labelId = useId();
  return (
    <details className="group relative">
      <summary className="marker-hidden button-outline rounded-button min-h-touch-target focus-visible:outline-accent inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        <span id={labelId}>{filter.label}</span>
        {selectedCount > 0 ? (
          <>
            <span
              className="bg-interactive text-interactive-text inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium"
              aria-hidden="true"
            >
              {selectedCount}
            </span>
            <span className="sr-only">{`, ${selectedCount} selected`}</span>
          </>
        ) : null}
        <img
          src="/icons/icon-chevron-down.svg"
          alt=""
          aria-hidden="true"
          className="size-4 group-open:rotate-180 motion-safe:transition-transform"
        />
      </summary>
      <div className="border-border bg-surface rounded-card absolute start-0 top-full z-30 mt-2 max-h-96 w-72 overflow-y-auto border p-4 shadow-lg">
        <FacetBody filter={filter} state={state} labelId={labelId} currencyCode={currencyCode} />
      </div>
    </details>
  );
}

/**
 * Adapter `useNextPage` (T-2.90): "Load more" / infinite scroll fetch the next page through THIS
 * route's loader (`.data` request: one batched Storefront query), never a separate endpoint.
 */
export function useRouteNextPage(): NextPage {
  const fetcher = useFetcher();
  const localize = useLocalePath();
  const [href, setHref] = useState<string | null>(null);
  const idle = fetcher.state === 'idle';
  const data = idle ? nextPageSectionData(fetcher.data) : null;
  return {
    load: (next) => {
      setHref(next);
      void fetcher.load(localize(next));
    },
    loading: !idle,
    href: data ? href : null,
    data,
  };
}

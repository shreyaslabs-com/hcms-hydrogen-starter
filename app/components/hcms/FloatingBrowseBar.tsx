import type { CollectionState } from '@shopify/hydrogen';
import { useCollection, useCollectionForm } from '@shopify/hydrogen/react';

import {
  FILTER_DRAWER_ID,
  SortChoices,
  activeFilterParams,
  closeDialog,
  hiddenInputsFromParams,
  openDialogFallback,
  type SortOption,
} from '~/components/CollectionBrowse';

const SORT_SHEET_ID = 'collection-sort-sheet';

/**
 * T-2.160 `mobile_filter_layout: floating` (own lazy chunk: loads only for that layout): a
 * "Sort | Filter" pill fixed at the bottom of the screen below `lg` (fixed = no layout shift).
 * Filter opens the existing filter drawer; Sort opens a bottom sheet `<dialog>` with the sort
 * options as radios (submitted on change, closes; Escape / backdrop close it natively).
 */
export default function FloatingBrowseBar({
  sortOptions,
  sortValue,
  showSort,
  showFilter,
}: {
  sortOptions: SortOption[];
  sortValue: string;
  showSort: boolean;
  showFilter: boolean;
}) {
  const state: CollectionState = useCollection();
  const { formProps } = useCollectionForm();
  const applied = state.filters.length;
  if (!showSort && !showFilter) return null;
  const button =
    'focus-visible:outline-accent min-h-touch-target inline-flex cursor-pointer items-center gap-2 px-5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  return (
    <>
      <div className="hcms-browse-bar flex lg:hidden" role="group" aria-label="Sort and filter">
        {showSort ? (
          <button
            type="button"
            commandfor={SORT_SHEET_ID}
            command="show-modal"
            aria-haspopup="dialog"
            aria-controls={SORT_SHEET_ID}
            className={button}
            onClick={() => openDialogFallback(SORT_SHEET_ID)}
          >
            Sort
          </button>
        ) : null}
        {showSort && showFilter ? (
          <span aria-hidden="true" className="hcms-browse-bar__divider" />
        ) : null}
        {showFilter ? (
          <button
            type="button"
            commandfor={FILTER_DRAWER_ID}
            command="show-modal"
            aria-haspopup="dialog"
            aria-controls={FILTER_DRAWER_ID}
            className={button}
            onClick={() => openDialogFallback(FILTER_DRAWER_ID)}
          >
            Filter
            {applied > 0 ? (
              <>
                <span className="hcms-filter-count" aria-hidden="true">
                  {applied}
                </span>
                <span className="sr-only">{`, ${applied} applied`}</span>
              </>
            ) : null}
          </button>
        ) : null}
      </div>
      {showSort ? (
        <dialog
          id={SORT_SHEET_ID}
          className="hcms-sort-sheet bg-surface text-on-surface"
          aria-labelledby={`${SORT_SHEET_ID}-title`}
          closedby="any"
        >
          <div className="flex items-center justify-between gap-4 pb-3">
            <h2 id={`${SORT_SHEET_ID}-title`} className="text-lg font-medium">
              Sort by
            </h2>
            <button
              type="button"
              commandfor={SORT_SHEET_ID}
              command="close"
              aria-label="Close"
              className="button-icon focus-visible:outline-accent inline-flex size-11 cursor-pointer items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => closeDialog(SORT_SHEET_ID)}
            >
              <img src="/icons/icon-x.svg" alt="" className="size-5" aria-hidden="true" />
            </button>
          </div>
          <form {...formProps()} method="get">
            {hiddenInputsFromParams(activeFilterParams(state))}
            <SortChoices
              options={sortOptions}
              value={sortValue}
              stacked
              onPicked={() => closeDialog(SORT_SHEET_ID)}
            />
          </form>
        </dialog>
      ) : null}
    </>
  );
}

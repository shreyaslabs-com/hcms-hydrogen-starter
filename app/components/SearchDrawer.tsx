import { QuickAddButton, type ProductCardData } from '@hcms/sections';
import { getPredictiveSearchItemUrl, getSearchResultUrl } from '@shopify/hydrogen';
import type { PredictiveSearchProductItem, PredictiveSearchState } from '@shopify/hydrogen';
import {
  PredictiveSearchProvider,
  usePredictiveSearch,
  usePredictiveSearchActions,
  usePredictiveSearchForm,
} from '@shopify/hydrogen/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useRouteLoaderData } from 'react-router';
import { Link, useLocalePath } from '~/components/LocaleLink';

import { SEARCH_DRAWER_ID, closeSearchDrawer } from '~/lib/cart-drawer';
import { useFormatPrice } from '~/lib/money';
import { describeSuggestions } from '~/lib/predictive-search';
import { routeTemplates } from '~/lib/route-templates';
import { trendingSearchHref, type TrendingSearches } from '~/lib/hcms/trending-searches';

const SEARCH_PAGE_PATH = '/search';
const TITLE_ID = 'search-drawer-title';
const INPUT_ID = 'search-drawer-query';
const RESULTS_ID = 'search-drawer-results';

type RootData = { trendingSearches?: TrendingSearches | null };
const useSearchPanelConfig = () => useRouteLoaderData<RootData>('root')?.trendingSearches ?? null;

export function SearchDrawer() {
  const localize = useLocalePath();
  return (
    <PredictiveSearchProvider searchAction={localize(SEARCH_PAGE_PATH)}>
      <SearchDialog />
    </PredictiveSearchProvider>
  );
}

/**
 * Under the header's search field (`search_style: field`, replica P1-8). Loaded on the field's
 * first focus; it listens to the field's input (`inputId`) and shows the same panel as the drawer.
 */
export function SearchDropdown({ inputId, open }: { inputId: string; open: boolean }) {
  const localize = useLocalePath();
  return (
    <PredictiveSearchProvider searchAction={localize(SEARCH_PAGE_PATH)}>
      <DropdownBody inputId={inputId} open={open} />
    </PredictiveSearchProvider>
  );
}

function DropdownBody({ inputId, open }: { inputId: string; open: boolean }) {
  const { search, clear } = usePredictiveSearchActions();
  useEffect(() => {
    const input = document.getElementById(inputId);
    if (!(input instanceof HTMLInputElement)) return;
    const sync = () => (input.value.trim() ? search(input.value) : clear());
    sync();
    input.addEventListener('input', sync);
    return () => input.removeEventListener('input', sync);
  }, [inputId, search, clear]);
  if (!open) return null;
  return <SearchPanel active layout="dropdown" />;
}

function SearchDialog() {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();
  const localize = useLocalePath();
  const { clear } = usePredictiveSearchActions();
  const { formProps, register } = usePredictiveSearchForm();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <dialog
      id={SEARCH_DRAWER_ID}
      className="drawer-right bg-surface text-on-surface"
      aria-labelledby={TITLE_ID}
      data-testid="search-drawer"
      closedby="any"
      onToggle={(event) => setActive(event.nativeEvent.newState === 'open')}
      onClose={() => {
        // Assigning through the element keeps React's input value tracker in
        // sync. form.reset() bypasses it, so a later paste of the same term
        // would land on the stale tracked value and never fire onChange.
        if (inputRef.current) inputRef.current.value = '';
        clear();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 py-2 ps-4 pe-2">
          <h2 id={TITLE_ID} className="sr-only">
            Search
          </h2>
          <form
            {...formProps({
              className: 'relative flex-1',
              'aria-labelledby': TITLE_ID,
              onSubmit: (event, term) => {
                event.preventDefault();
                closeSearchDrawer();
                void navigate(getSearchResultUrl({ baseUrl: localize(SEARCH_PAGE_PATH), term }));
              },
            })}
          >
            <label htmlFor={INPUT_ID} className="sr-only">
              Search products
            </label>
            <span
              className="text-on-surface-secondary pointer-events-none absolute start-3 top-1/2 inline-flex size-5 -translate-y-1/2"
              aria-hidden="true"
            >
              <img src="/icons/icon-search.svg" alt="" className="size-5" />
            </span>
            <input
              ref={inputRef}
              {...register('query', {
                id: INPUT_ID,
                placeholder: 'Search',
                'aria-controls': RESULTS_ID,
                className: 'h-11 w-full ps-10',
                onKeyDown: (event) => {
                  // Chromium spends the first Escape on clearing a type=search
                  // input, which would stop the dialog's own Escape handling.
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  closeSearchDrawer();
                },
              })}
            />
          </form>
          <button
            type="button"
            commandfor={SEARCH_DRAWER_ID}
            command="close"
            className="button-icon focus-visible:outline-accent inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]"
            aria-label="Close"
            onClick={() => closeSearchDrawer()}
          >
            <img src="/icons/icon-x.svg" alt="" className="size-5" aria-hidden="true" />
          </button>
        </div>
        <SearchPanel active={active} layout="drawer" />
      </div>
    </dialog>
  );
}

type PanelProps = {
  /** Panel is showing (drawer open / dropdown open): the popular products load then. */
  active: boolean;
  /** `dropdown` = under the header field (promo beside the lists). */
  layout: 'drawer' | 'dropdown';
};

/** Shared by the drawer and the header field's dropdown. */
function SearchPanel({ active, layout }: PanelProps) {
  const state = usePredictiveSearch();
  const { status, result, term } = state;
  const config = useSearchPanelConfig();
  const promo = term.length === 0 ? (config?.promo ?? null) : null;
  const wide = layout === 'dropdown' && promo !== null;

  return (
    <div
      id={layout === 'drawer' ? RESULTS_ID : undefined}
      className={
        layout === 'drawer'
          ? 'flex-1 overflow-y-auto p-4'
          : 'max-h-[min(36rem,75vh)] overflow-y-auto p-4'
      }
      aria-busy={status === 'loading'}
    >
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {describeSuggestions(state)}
      </p>
      <div className={wide ? 'grid gap-4 sm:grid-cols-[1fr_12rem]' : 'grid gap-4'}>
        <div className="grid min-w-0 content-start gap-4">
          {term.length === 0 ? (
            <>
              <TrendingChips />
              <PopularProducts active={active} />
            </>
          ) : null}
          <SuggestionsBody
            status={status}
            result={result}
            showQueries={config?.showQueries !== false}
            showCollections={config?.showCollections !== false}
          />
          {term.length > 0 ? (
            <Link
              to={getSearchResultUrl({ baseUrl: SEARCH_PAGE_PATH, term })}
              className="text-on-surface focus-visible:outline-accent inline-flex min-h-11 items-center text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => closeSearchDrawer()}
            >
              View all results for “{term}”
            </Link>
          ) : null}
        </div>
        {promo ? <PromoTile promo={promo} /> : null}
      </div>
    </div>
  );
}

function PromoTile({ promo }: { promo: NonNullable<TrendingSearches['promo']> }) {
  const body = (
    <>
      <img
        src={promo.imageUrl}
        alt=""
        width={400}
        height={500}
        loading="lazy"
        className="bg-surface-secondary aspect-4/5 w-full rounded object-cover"
      />
      {promo.heading ? (
        <span className="text-on-surface mt-2 block text-sm font-medium">{promo.heading}</span>
      ) : null}
      {promo.link && promo.label ? (
        <span className="text-on-surface mt-1 block text-sm underline">{promo.label}</span>
      ) : null}
    </>
  );
  return promo.link ? (
    <Link
      to={promo.link}
      className="focus-visible:outline-accent block no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      onClick={() => closeSearchDrawer()}
    >
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

const popularCache = new Map<string, Promise<ProductCardData[]>>();

/** The merchant's popular collection (empty state), loaded once per handle when the panel opens. */
function PopularProducts({ active }: { active: boolean }) {
  const popular = useSearchPanelConfig()?.popular;
  const localize = useLocalePath();
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const handle = popular?.handle;
  useEffect(() => {
    if (!active || !handle) return;
    let cancelled = false;
    let request = popularCache.get(handle);
    if (!request) {
      const created = fetch(localize(`/__hcms/search-popular?handle=${encodeURIComponent(handle)}`))
        .then(
          (response) =>
            (response.ok ? response.json() : { products: [] }) as Promise<{
              products?: ProductCardData[];
            }>,
        )
        .then((body) => body.products ?? [])
        .catch(() => []);
      popularCache.set(handle, created);
      void created.then((list) => list.length === 0 && popularCache.delete(handle));
      request = created;
    }
    void request.then((list) => !cancelled && setProducts(list));
    return () => {
      cancelled = true;
    };
  }, [active, handle, localize]);
  if (!popular || products.length === 0) return null;
  return (
    <section aria-labelledby="search-popular-heading" className="grid gap-2">
      <h3 id="search-popular-heading" className="text-on-surface-secondary text-sm font-medium">
        {popular.heading ?? 'Popular products'}
      </h3>
      <ul role="list" className="grid gap-1">
        {products.map((product) => (
          <li key={product.id}>
            <ProductRow
              product={product}
              href={`/products/${product.handle}`}
              image={product.featuredImage ?? null}
              price={product.priceRange.minVariantPrice}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

type RowImage = { url: string; altText?: string | null } | null;
type Money = { amount: string; currencyCode: string };

function ProductRow({
  product,
  href,
  image,
  price,
}: {
  product: ProductCardData;
  href: string;
  image: RowImage;
  price: Money | null;
}) {
  const formatPrice = useFormatPrice();
  return (
    <div className="hover:bg-surface-secondary flex items-center gap-2 rounded p-1 motion-safe:transition-colors">
      <Link
        to={href}
        className="focus-visible:outline-accent flex min-w-0 flex-1 items-center gap-3 rounded p-1 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={() => closeSearchDrawer()}
      >
        {image !== null ? (
          <img
            src={image.url}
            alt={image.altText ?? ''}
            width={48}
            height={48}
            className="bg-surface-secondary size-12 shrink-0 rounded object-cover"
            loading="lazy"
          />
        ) : (
          <span className="bg-surface-secondary size-12 shrink-0 rounded" aria-hidden="true" />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="type-body-sm text-on-surface line-clamp-2 font-medium">
            {product.title}
          </span>
          {price !== null ? (
            <span className="text-on-surface-secondary text-sm">
              {formatPrice(price as Parameters<typeof formatPrice>[0])}
            </span>
          ) : null}
        </span>
      </Link>
      <div className="w-28 shrink-0">
        <QuickAddButton product={product} />
      </div>
    </div>
  );
}

/** Merchant's trending terms (T-2.72) while nothing is typed; chips link to the search page. */
function TrendingChips() {
  const trending = useSearchPanelConfig();
  if (!trending?.terms.length) return null;
  return (
    <section aria-labelledby="search-drawer-trending" className="grid gap-2">
      <h3 id="search-drawer-trending" className="text-on-surface-secondary text-sm font-medium">
        {trending.heading ?? 'Trending searches'}
      </h3>
      <ul role="list" className="flex flex-wrap gap-2">
        {trending.terms.map((term) => (
          <li key={term}>
            <Link
              to={trendingSearchHref(term)}
              className="border-border hover:border-on-surface focus-visible:outline-accent inline-flex min-h-9 items-center rounded-full border px-3 text-sm no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => closeSearchDrawer()}
            >
              {term}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type SuggestionsBodyProps = Pick<PredictiveSearchState, 'status' | 'result'> & {
  showQueries: boolean;
  showCollections: boolean;
};

function SuggestionsBody({ status, result, showQueries, showCollections }: SuggestionsBodyProps) {
  const { products, queries, collections } = result.items;
  const total = products.length + queries.length + collections.length;
  switch (status) {
    case 'idle':
      return null;
    case 'error':
      return (
        <p role="alert" className="text-critical text-sm">
          Suggestions are unavailable right now. Use the full search page instead.
        </p>
      );
    case 'loading':
      if (total === 0) return <p className="text-on-surface-secondary text-sm">Searching…</p>;
      break;
    case 'success':
      if (total === 0) {
        return <p className="text-on-surface-secondary text-sm">No results for “{result.term}”</p>;
      }
  }
  return (
    <div className={status === 'loading' ? 'grid gap-4 opacity-60' : 'grid gap-4'}>
      {showQueries && queries.length > 0 ? (
        <TermList
          heading="Suggestions"
          items={queries.map((query) => ({
            key: query.text,
            label: query.text,
            href: getPredictiveSearchItemUrl(query, { routes: routeTemplates }),
          }))}
        />
      ) : null}
      {showCollections && collections.length > 0 ? (
        <TermList
          heading="Collections"
          items={collections.map((collection) => ({
            key: collection.id,
            label: collection.title,
            href: getPredictiveSearchItemUrl(collection, {
              routes: routeTemplates,
              term: result.term,
            }),
          }))}
        />
      ) : null}
      {products.length > 0 ? (
        <section aria-labelledby="search-products-heading" className="grid gap-2">
          <h3
            id="search-products-heading"
            className="text-on-surface-secondary text-sm font-medium"
          >
            Products
          </h3>
          <SuggestionList products={products} term={result.term} />
        </section>
      ) : null}
    </div>
  );
}

function TermList({
  heading,
  items,
}: {
  heading: string;
  items: { key: string; label: string; href: string }[];
}) {
  const id = `search-${heading.toLowerCase()}-heading`;
  return (
    <section aria-labelledby={id} className="grid gap-1">
      <h3 id={id} className="text-on-surface-secondary text-sm font-medium">
        {heading}
      </h3>
      <ul role="list" className="grid">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.href}
              className="hover:bg-surface-secondary focus-visible:outline-accent flex min-h-10 items-center rounded px-2 text-sm no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => closeSearchDrawer()}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type SuggestionListProps = {
  products: readonly PredictiveSearchProductItem[];
  term: string;
};

/** Predictive hit → the card shape the shared quick add reads. `variantsCount` / `quickVariant` /
 * `requiresSellingPlan` come from the handler's additive fragment (SF-14), so single-variant
 * products add directly; the base `selectedOrFirstAvailableVariant` is the fallback. */
function toCard(product: PredictiveSearchProductItem): ProductCardData {
  const variant = product.selectedOrFirstAvailableVariant;
  const extra = product as unknown as Pick<
    ProductCardData,
    'quickVariant' | 'variantsCount' | 'requiresSellingPlan'
  >;
  const quick = extra.quickVariant ?? null;
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    availableForSale: quick?.availableForSale ?? true,
    featuredImage: variant?.image ?? quick?.image ?? null,
    priceRange: {
      minVariantPrice: variant?.price ?? quick?.price ?? { amount: '0', currencyCode: 'USD' },
    },
    variantsCount: extra.variantsCount ?? null,
    requiresSellingPlan: extra.requiresSellingPlan ?? false,
    quickVariant: quick,
  } as ProductCardData;
}

function SuggestionList({ products, term }: SuggestionListProps) {
  return (
    <ul role="list" className="grid gap-1">
      {products.map((product) => {
        const variant = product.selectedOrFirstAvailableVariant;
        return (
          <li key={product.id}>
            <ProductRow
              product={toCard(product)}
              href={getPredictiveSearchItemUrl(product, { routes: routeTemplates, term })}
              image={variant?.image ?? null}
              price={variant?.price ?? null}
            />
          </li>
        );
      })}
    </ul>
  );
}

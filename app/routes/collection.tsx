import { AnalyticsEvent, getSortByValue } from '@shopify/hydrogen';
import { CollectionProvider } from '@shopify/hydrogen/react';
import { useEffect } from 'react';
import { useLocation, useNavigate, useNavigation, useSearchParams } from 'react-router';
import { Link } from '~/components/LocaleLink';

import {
  ActiveFilterChips,
  COLLECTION_SORT_OPTIONS,
  FacetForm,
  FilterDrawer,
  LoadMore,
  Toolbar,
  useLoadMore,
  useRouteNextPage,
} from '~/components/CollectionBrowse';
import { HcmsTemplatePage } from '~/components/hcms/HcmsTemplatePage';
import { BrowseLayout } from '~/components/hcms/BrowseLayout';
import { RouteSlots, type RouteSlotValue } from '~/components/hcms/RouteSlots';
import { ProductCard } from '~/components/ProductCard';
import { envContext } from '~/lib/env';
import { shouldUseMockShop } from '~/lib/shop';
import { throwNotFound } from '~/lib/hcms/not-found';
import { loadTemplatePage } from '~/lib/hcms/page';
import { browseRouteState } from '~/lib/hcms/route-state';
import { collectionCrumbsOn } from '~/lib/hcms/product-crumbs';
import { loadCollectionPage } from '~/lib/collection';
import { storefrontClientContext } from '~/lib/storefront';
import { routeMeta } from '~/lib/hcms/route-seo';
import { JsonLd } from '~/components/JsonLd';
import { useT } from '@hcms/hydrogen';
import {
  ALL_PRODUCTS_TITLE,
  ALL_PRODUCTS_TITLE_KEY,
  allProductsTitle,
  collectionMetaOrAll,
  isSyntheticCollection,
} from '~/lib/hcms/all-products';

import type { Route } from './+types/collection';

const BROWSE_SLOTS: RouteSlotValue = { BrowseLayout, useNextPage: useRouteNextPage };

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const collection = loaderData?.collection as
    | {
        title?: string;
        description?: string | null;
        image?: {
          url: string;
          altText?: string | null;
          width?: number | null;
          height?: number | null;
        } | null;
        seo?: { title?: string | null; description?: string | null } | null;
        /** Shopify `seo.hidden` metafield ("1" = hide from search engines, T-2.48). */
        hidden?: { value?: string | null } | null;
        id?: string;
        handle?: string;
      }
    | undefined;
  // `/collections/all` without a real collection: title from theme content ("Products").
  const title =
    collection && isSyntheticCollection(collection)
      ? allProductsTitle(
          (matches[0]?.loaderData as { themeStrings?: unknown } | undefined)?.themeStrings,
        )
      : collection?.title;
  return routeMeta(matches, {
    template: (loaderData as { hcms?: { name: string } | null } | undefined)?.hcms?.name ?? null,
    type: 'collection',
    title: title || 'Collection',
    description: collection?.description,
    image: collection?.image,
    resourceSeo: collection?.seo,
    hidden: (collection as { hidden?: { value?: string | null } | null } | null | undefined)
      ?.hidden,
  });
}

/** The route's own needs (meta, analytics, 404) — merged into the template's batched query. */
const COLLECTION_ROUTE_REQUEST = `query HcmsCollectionRoute($handle: String!) {
  collection(handle: $handle) {
    id handle title description
    seo { title description } hidden: metafield(namespace: "seo", key: "hidden") { value }
    image { url altText width height }
  }
}`;

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const handle = params.handle;
  if (!handle) throw new Response('Not Found', { status: 404 });

  // Theme Document `collection` template → official main sections (D-22). URL browse state is
  // parsed here (Hydrogen) and passed to the grid as plain variables: still ONE Storefront query.
  const url = new URL(request.url);
  const page = await loadTemplatePage(
    context,
    'collection',
    { type: 'collection', handle },
    {
      route: {
        ...browseRouteState(url),
        // mock.shop's search has no catalogue index: `/collections/all` lists root `products`.
        ...(shouldUseMockShop(context.get(envContext)) ? { catalogSearch: false } : {}),
      },
      extra: { route: { query: COLLECTION_ROUTE_REQUEST, variables: { handle } } },
    },
  );
  if (page) {
    // Online Store's `/collections/all` exists even when the shop has no `all` collection.
    const meta = collectionMetaOrAll(
      handle,
      (page.data.route as { collection?: CollectionMeta | null } | null)?.collection,
    );
    if (!meta) return throwNotFound(context, request);
    return {
      hcms: page,
      collection: meta,
      dataSearch: url.searchParams.toString(),
      crumbs: collectionCrumbsOn(page.template),
      origin: url.origin,
    } as const;
  }

  const storefrontClient = context.get(storefrontClientContext);
  return {
    hcms: null,
    ...(await loadCollectionPage({
      storefrontClient,
      handle,
      request,
      catalogSearch: !shouldUseMockShop(context.get(envContext)),
    })),
  } as const;
}

type CollectionMeta = {
  id: string;
  handle: string;
  title: string;
  description: string;
  seo?: { title: string | null; description: string | null } | null;
  image: {
    url: string;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
};
type LegacyLoaderData = Extract<Route.ComponentProps['loaderData'], { hcms: null }>;

type CollectionData = LegacyLoaderData['collection'];
type ProductNode = LegacyLoaderData['products'][number];

function CollectionViewedTracker({ collection }: { collection: CollectionMeta }) {
  const { id, handle } = collection;
  useEffect(() => {
    if (isSyntheticCollection({ id, handle })) return; // no Shopify collection to report
    window.Shopify?.analytics?.publish(AnalyticsEvent.COLLECTION_VIEWED, {
      collection: { id, handle },
    });
  }, [id, handle]);

  return null;
}

/** Display title; the synthesized `/collections/all` reads theme content (T-2.33). */
function useCollectionTitle(collection: CollectionMeta) {
  const t = useT();
  return isSyntheticCollection(collection)
    ? t(ALL_PRODUCTS_TITLE_KEY, ALL_PRODUCTS_TITLE)
    : collection.title;
}

function BreadcrumbJsonLd({ collection, origin }: { collection: CollectionMeta; origin: string }) {
  const title = useCollectionTitle(collection);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${origin}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: title,
        item: `${origin}/collections/${collection.handle}`,
      },
    ],
  };

  return <JsonLd data={jsonLd} />;
}

function Breadcrumb({ collection }: { collection: CollectionMeta }) {
  const title = useCollectionTitle(collection);
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="text-on-surface-secondary flex items-center gap-1.5 text-sm">
        <li>
          <Link
            to="/"
            className="hover:text-on-surface rounded-sm py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current motion-safe:transition-colors"
          >
            Home
          </Link>
        </li>
        <li aria-hidden="true" className="text-on-surface-secondary">
          /
        </li>
        <li>
          <span aria-current="page" className="text-on-surface font-medium">
            {title}
          </span>
        </li>
      </ol>
    </nav>
  );
}

function CollectionHeader({ collection }: { collection: CollectionData }) {
  return (
    <div className="mb-8">
      <div className="grid gap-6 md:grid-cols-[1fr_16rem] md:items-start">
        <div>
          <h1 className="type-display text-on-surface mb-2">{collection.title}</h1>
          {collection.description ? (
            <div className="richtext text-on-surface-secondary type-body-sm max-w-2xl">
              <p>{collection.description}</p>
            </div>
          ) : null}
        </div>
        {collection.image ? (
          <div className="bg-surface-secondary aspect-landscape rounded-card overflow-hidden">
            <img
              src={collection.image.url}
              alt={collection.image.altText ?? collection.title}
              width={collection.image.width ?? undefined}
              height={collection.image.height ?? undefined}
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProductGrid({ products }: { products: readonly ProductNode[] }) {
  if (products.length === 0) return null;

  return (
    <div className="px-1 contain-paint">
      <ul
        id="product-grid"
        data-testid="product-grid"
        role="list"
        className="grid grid-cols-2 gap-x-1 gap-y-10 lg:grid-cols-3"
      >
        {products.map((product, index) => (
          <li key={`${product.handle}-${index}`}>
            <ProductCard product={product} priority={index < 3} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ collectionPath }: { collectionPath: string }) {
  return (
    <div className="border-border bg-surface-secondary rounded-card border p-8 text-center">
      <h2 className="type-heading-md text-on-surface">No products found</h2>
      <p className="text-on-surface-secondary mt-2 text-sm">
        Try removing filters to see more products in this collection.
      </p>
      <Link
        to={collectionPath}
        preventScrollReset
        className="rounded-button button-primary focus-visible:outline-accent mt-6 inline-flex h-11 items-center justify-center px-4 text-sm font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,background-color,border-color,transform] motion-safe:active:scale-[0.97]"
      >
        Clear all filters
      </Link>
    </div>
  );
}

function CollectionResults({ loaderData }: { loaderData: LegacyLoaderData }) {
  const location = useLocation();
  const navigation = useNavigation();
  const isUpdating =
    navigation.state === 'loading' &&
    navigation.location?.pathname === location.pathname &&
    navigation.location.search !== location.search;
  const collectionPath = `/collections/${loaderData.collection.handle}`;
  const { nodes, pageInfo, isLoading, loadMore } = useLoadMore(
    loaderData.products,
    loaderData.pageInfo,
    loaderData.dataSearch,
  );
  const countText = `Showing ${nodes.length}`;
  const defaultSortValue = getSortByValue('COLLECTION_DEFAULT', false);

  return (
    <>
      <Toolbar
        countText={countText}
        sortOptions={COLLECTION_SORT_OPTIONS}
        defaultSortValue={defaultSortValue}
      />
      <ActiveFilterChips
        basePath={collectionPath}
        clearAllTo={collectionPath}
        currencyCode={loaderData.currencyCode}
      />
      <h2 className="sr-only">Products</h2>
      <div
        aria-busy={isUpdating}
        className={`motion-safe:transition-opacity motion-safe:duration-150 ${isUpdating ? 'opacity-60' : 'opacity-100'}`}
      >
        {nodes.length > 0 ? (
          <ProductGrid products={nodes} />
        ) : (
          <EmptyState collectionPath={collectionPath} />
        )}
      </div>
      <LoadMore
        pageInfo={pageInfo}
        loadedCount={nodes.length}
        countLabel={`Showing ${nodes.length} products`}
        isLoading={isLoading}
        onLoad={loadMore}
      />
      <FilterDrawer
        availableFilters={loaderData.availableFilters}
        currencyCode={loaderData.currencyCode}
      />
    </>
  );
}

export default function CollectionRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  return (
    <CollectionProvider
      data={{ handle: loaderData.collection.handle, dataSearch: loaderData.dataSearch }}
      urlSearch={searchParams.toString()}
      onChange={(search) => {
        const nextParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
        nextParams.delete('after');
        const nextSearch = nextParams.toString();
        void navigate(
          { search: nextSearch ? `?${nextSearch}` : '' },
          {
            replace: searchParams.size > 0,
            preventScrollReset: true,
          },
        );
      }}
    >
      <CollectionViewedTracker collection={loaderData.collection} />
      {loaderData.hcms ? (
        <main className="flex-1" id="main-content" tabIndex={-1}>
          <BreadcrumbJsonLd collection={loaderData.collection} origin={loaderData.origin} />
          {/* `main-collection-banner` `show_breadcrumbs` (T-2.160); JSON-LD stays. */}
          {loaderData.crumbs ? (
            <div className="max-w-page px-margin mx-auto w-full pt-8">
              <Breadcrumb collection={loaderData.collection} />
            </div>
          ) : null}
          <RouteSlots value={BROWSE_SLOTS}>
            <HcmsTemplatePage page={loaderData.hcms} />
          </RouteSlots>
        </main>
      ) : (
        <LegacyCollection loaderData={loaderData} />
      )}
    </CollectionProvider>
  );
}

function LegacyCollection({ loaderData }: { loaderData: LegacyLoaderData }) {
  return (
    <main className="flex-1" id="main-content" tabIndex={-1}>
      <div className="max-w-page px-margin mx-auto w-full py-8 md:py-12">
        <BreadcrumbJsonLd collection={loaderData.collection} origin={loaderData.origin} />
        <Breadcrumb collection={loaderData.collection} />
        <CollectionHeader collection={loaderData.collection} />
        <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-10">
          <aside className="hidden lg:block" aria-label="Filters">
            <div className="sticky top-8">
              <h2 className="type-heading-sm text-on-surface mb-2">Filters</h2>
              <FacetForm
                availableFilters={loaderData.availableFilters}
                currencyCode={loaderData.currencyCode}
              />
            </div>
          </aside>
          <div>
            <CollectionResults loaderData={loaderData} />
          </div>
        </div>
      </div>
    </main>
  );
}

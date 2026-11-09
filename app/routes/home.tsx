import { gql } from '@shopify/hydrogen';
import { useRouteLoaderData } from 'react-router';
import { Link } from '~/components/LocaleLink';

import {
  CollectionCard,
  COLLECTION_CARD_FRAGMENT,
  type CollectionCardData,
} from '~/components/CollectionCard';
import { HomeHero } from '~/components/HomeHero';
import { HcmsTemplatePage } from '~/components/hcms/HcmsTemplatePage';
import { loadTemplatePage } from '~/lib/hcms/page';
import { ProductCard, PRODUCT_CARD_FRAGMENT, type ProductCardData } from '~/components/ProductCard';
import { selectHomeHero } from '~/lib/home-hero';
import { storefrontClientContext } from '~/lib/storefront';
import { FALLBACK_SHOP_NAME } from '~/lib/storefront-shop';
import type { loader as rootLoader } from '~/root';
import { routeMeta } from '~/lib/hcms/route-seo';
import { JsonLd } from '~/components/JsonLd';
import { organizationJsonLd, websiteJsonLd } from '~/lib/hcms/json-ld';

import type { Route } from './+types/home';

const HOME_QUERY = gql(
  `
    query Home($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
      products(first: 8, sortKey: CREATED_AT, reverse: true) {
        nodes {
          ...ProductCard
        }
      }
      collections(first: 3) {
        nodes {
          ...CollectionCard
        }
      }
      heroCollections: collections(first: 1, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          title
          handle
          description
          image {
            url
            altText
          }
          products(first: 1) {
            nodes {
              featuredImage {
                url
                altText
              }
            }
          }
        }
      }
    }
  `,
  [PRODUCT_CARD_FRAGMENT, COLLECTION_CARD_FRAGMENT],
);

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return routeMeta(matches, {
    template: (loaderData as { hcms?: { name: string } | null } | undefined)?.hcms?.name ?? null,
    type: 'index',
    title: 'Home',
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  const storefrontClient = context.get(storefrontClientContext);
  // Theme Document `index` template → HCMS sections, all data in ONE batched query (T-1.2.12).
  const page = await loadTemplatePage(context, 'index');
  if (page)
    return { hcms: page, featuredProducts: [], featuredCollections: [], heroCollections: [] };

  const { data } = await storefrontClient.graphql(HOME_QUERY);

  // New arrivals: the most recently created products (by creation date, not
  // publication date), newest first, in the order the Storefront API returns.
  const featuredProducts: ProductCardData[] = data?.products.nodes ?? [];
  const featuredCollections: CollectionCardData[] = data?.collections.nodes ?? [];
  // The hero features the most recently updated collection, independent of the
  // category list above.
  const heroCollections = data?.heroCollections.nodes ?? [];

  return {
    hcms: null,
    featuredProducts,
    featuredCollections,
    heroCollections,
  };
}

function NewArrivals({ products }: { products: readonly ProductCardData[] }) {
  return (
    <section className="bg-surface w-full pt-20 pb-12" aria-labelledby="new-arrivals-heading">
      <div className="max-w-page px-margin mx-auto mb-4 flex items-center justify-between gap-4">
        <h2 id="new-arrivals-heading" className="type-heading-xl">
          New arrivals
        </h2>
        <Link
          to="/collections"
          className="min-h-touch-target text-on-surface focus-visible:outline-accent inline-flex items-center gap-1 rounded-sm text-sm font-normal no-underline hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-opacity"
        >
          <span>Collections</span>
          <span
            className="inline-flex size-4 shrink-0 items-center justify-center"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </Link>
      </div>

      {products.length > 0 ? (
        <div className="max-w-page px-margin mx-auto contain-paint">
          <ul
            role="list"
            className="grid grid-cols-1 gap-x-1 gap-y-10 md:grid-cols-2 lg:grid-cols-4"
          >
            {products.map((product) => (
              <li key={product.handle}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ShopByCategory({ collections }: { collections: readonly CollectionCardData[] }) {
  return (
    <section className="w-full py-12" aria-labelledby="category-heading">
      <h2 id="category-heading" className="type-heading-xl max-w-page px-margin mx-auto mb-4">
        Shop by category
      </h2>
      {collections.length > 0 ? (
        <ul role="list" className="max-w-page px-margin mx-auto grid grid-cols-1 md:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.handle}>
              <CollectionCard collection={collection} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Organization + WebSite (sitelinks search box) on the home page only (T-1.7.2). */
function HomeJsonLd() {
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  if (!rootData) return null;
  const name = rootData.shopInfo.name;
  return (
    <JsonLd
      data={[
        organizationJsonLd({ name, origin: rootData.origin, logo: rootData.shopInfo.logo }),
        websiteJsonLd({ name, origin: rootData.origin }),
      ]}
    />
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  if (loaderData.hcms) {
    return (
      <main className="flex-1" id="main-content" tabIndex={-1}>
        <HomeJsonLd />
        {/* Home sections use h2s (Dawn puts the logo in an h1 on the home page): one h1 for
            screen readers and search engines (SF-20). */}
        <h1 className="sr-only">{rootData?.shopInfo.name ?? FALLBACK_SHOP_NAME}</h1>
        <HcmsTemplatePage page={loaderData.hcms} />
      </main>
    );
  }
  const hero = selectHomeHero(
    loaderData.heroCollections,
    rootData?.shopInfo.name ?? FALLBACK_SHOP_NAME,
  );

  return (
    <main className="flex-1" id="main-content" tabIndex={-1}>
      <HomeJsonLd />
      <HomeHero hero={hero} />
      <NewArrivals products={loaderData.featuredProducts} />
      <ShopByCategory collections={loaderData.featuredCollections} />
    </main>
  );
}

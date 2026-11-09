import { Link } from '~/components/LocaleLink';

import { CollectionCard } from '~/components/CollectionCard';
import { HcmsTemplatePage } from '~/components/hcms/HcmsTemplatePage';
import { loadTemplatePage } from '~/lib/hcms/page';
import { browseRouteState } from '~/lib/hcms/route-state';
import { loadCollectionsPage } from '~/lib/collections';
import { storefrontClientContext } from '~/lib/storefront';
import { routeMeta } from '~/lib/hcms/route-seo';
import { JsonLd } from '~/components/JsonLd';

import type { Route } from './+types/collections';

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return routeMeta(matches, {
    template: (loaderData as { hcms?: { name: string } | null } | undefined)?.hcms?.name ?? null,
    type: 'list_collections',
    title: 'Collections',
  });
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // Theme Document `list_collections` template → `main-list-collections` (D-22).
  const page = await loadTemplatePage(
    context,
    'list_collections',
    {},
    {
      route: browseRouteState(url),
    },
  );
  if (page) return { hcms: page, origin: url.origin } as const;
  const storefrontClient = context.get(storefrontClientContext);
  return { hcms: null, ...(await loadCollectionsPage({ storefrontClient, request })) } as const;
}

type LegacyData = Extract<Route.ComponentProps['loaderData'], { hcms: null }>;
type CollectionNode = LegacyData['collections']['nodes'][number];

function BreadcrumbJsonLd({ origin }: { origin: string }) {
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
        name: 'Collections',
        item: `${origin}/collections`,
      },
    ],
  };

  return <JsonLd data={jsonLd} />;
}

function Breadcrumb() {
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
            Collections
          </span>
        </li>
      </ol>
    </nav>
  );
}

function CollectionsGrid({ collections }: { collections: readonly CollectionNode[] }) {
  if (collections.length === 0) {
    return (
      <div className="border-border bg-surface-secondary rounded-card border p-8 text-center">
        <h2 className="type-heading-md text-on-surface">No collections found</h2>
        <p className="text-on-surface-secondary mt-2 text-sm">No collections available.</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="sr-only">Browse collections</h2>
      <div>
        <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection, index) => (
            <li key={collection.handle}>
              <CollectionCard collection={collection} priority={index === 0} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default function CollectionsRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.hcms)
    return (
      <main className="flex-1" id="main-content" tabIndex={-1}>
        <BreadcrumbJsonLd origin={loaderData.origin} />
        <HcmsTemplatePage page={loaderData.hcms} />
      </main>
    );
  return (
    <main className="flex-1" id="main-content" tabIndex={-1}>
      <div className="max-w-page px-margin mx-auto w-full py-8 md:py-12">
        <BreadcrumbJsonLd origin={loaderData.origin} />
        <Breadcrumb />
        <div className="mb-8">
          <h1 className="type-display text-on-surface">Collections</h1>
        </div>
        <CollectionsGrid collections={loaderData.collections.nodes} />
      </div>
    </main>
  );
}

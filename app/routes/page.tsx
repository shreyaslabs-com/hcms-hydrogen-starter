import { ContentPage, ShopifyHtml } from '~/components/ContentPage';
import { loadPage } from '~/lib/content';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { throwNotFound } from '~/lib/hcms/not-found';
import { loadTemplatePage } from '~/lib/hcms/page';
import { needsPageHeading } from '~/lib/hcms/page-heading';
import { storefrontClientContext } from '~/lib/storefront';
import { routeMeta } from '~/lib/hcms/route-seo';

import type { Route } from './+types/page';

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const page = loaderData?.page;
  return routeMeta(matches, {
    template: (loaderData as { hcms?: { name: string } | null } | undefined)?.hcms?.name ?? null,
    type: 'page',
    title: page?.title || 'Page',
    resourceSeo: page?.seo,
    hidden: (page as { hidden?: { value?: string | null } | null } | null | undefined)?.hidden,
  });
}

const PAGE_META = `query HcmsPageRoute($handle: String!) {
  page(handle: $handle) { id title seo { title description } hidden: metafield(namespace: "seo", key: "hidden") { value } }
}`;
type PageMeta = {
  id: string;
  title: string;
  seo?: { title?: string | null; description?: string | null } | null;
  /** Shopify `seo.hidden` metafield ("1" = hide from search engines, T-2.48). */
  hidden?: { value?: string | null } | null;
};

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  // Theme Document `page` template (D-22): sections + the route's meta in ONE batched query.
  const hcms = await loadTemplatePage(
    context,
    'page',
    { type: 'page', handle: params.handle },
    { extra: { route: { query: PAGE_META, variables: { handle: params.handle } } } },
  );
  if (hcms) {
    const page = (hcms.data.route as { page?: PageMeta | null } | null)?.page;
    if (!page) return throwNotFound(context, request);
    return { hcms, page, origin } as const;
  }
  const storefrontClient = context.get(storefrontClientContext);
  const page = await loadPage(storefrontClient, params.handle);
  return { hcms: null, page, origin } as const;
}

export default function PageRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.hcms)
    return (
      <HcmsMainPage
        page={loaderData.hcms}
        crumbs={[{ label: loaderData.page.title }]}
        origin={loaderData.origin}
      >
        {needsPageHeading(loaderData.hcms.template) ? (
          <h1 className="sr-only">{loaderData.page.title}</h1>
        ) : null}
      </HcmsMainPage>
    );
  const { page, origin } = loaderData;
  return (
    <ContentPage title={page.title} crumbs={[{ label: page.title }]} origin={origin} narrow>
      <ShopifyHtml html={page.body} />
    </ContentPage>
  );
}

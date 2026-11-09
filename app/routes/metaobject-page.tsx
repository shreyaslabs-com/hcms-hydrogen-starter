import { metaobjectTemplate } from '@hcms/hydrogen';
import { mainMetaobject, sectionFromPreset } from '@hcms/sections';

import { ContentPage } from '~/components/ContentPage';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { humanize, loadMetaobjectPage } from '~/lib/content';
import { throwNotFound } from '~/lib/hcms/not-found';
import { loadTemplatePage } from '~/lib/hcms/page';
import { shopifyImageUrl } from '~/lib/image';
import { metaobjectSeo, TITLE_KEYS } from '~/lib/hcms/metaobject-seo';
import { routeMeta } from '~/lib/hcms/route-seo';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/metaobject-page';

/**
 * SEO (T-2.38): the definition's renderable meta title/description fields (`metaobject.seo`)
 * win, then the `metaobject/<type>` template override, then the entry's own title/description.
 */
export function meta({ matches, loaderData }: Route.MetaArgs) {
  const seo = loaderData?.seo;
  return routeMeta(matches, {
    template: loaderData?.hcms?.name ?? null,
    type: loaderData ? `metaobject/${loaderData.type}` : 'metaobject',
    title: seo?.title || loaderData?.title || 'Page',
    description: seo?.description ?? null,
    image: seo?.image ?? null,
    resourceSeo: seo?.resourceSeo ?? null,
  });
}

// Validated against Storefront 2026-10 (renderable SEO fields + fields for title/description/image).
const METAOBJECT_META = `query HcmsMetaobjectRoute($t: String!, $h: String!) {
  metaobject(handle: { type: $t, handle: $h }) {
    handle
    fields { key type value reference { __typename ... on MediaImage { image { url altText width height } } } }
    seo { title { type value } description { type value } }
  }
}`;
type MetaobjectMeta = Parameters<typeof metaobjectSeo>[0];
const HANDLE = /^[a-z0-9][a-z0-9_-]*$/i;

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  if (!HANDLE.test(params.type)) throw new Response('Not Found', { status: 404 });
  // Theme Document `metaobject/<type>` template (T-2.23); without one, a default template with
  // the `main-metaobject` section. Sections + the route's meta: ONE batched query.
  const hcms = await loadTemplatePage(
    context,
    metaobjectTemplate(params.type),
    { type: 'metaobject', handle: params.handle },
    {
      route: { metaobjectType: params.type },
      extra: {
        route: { query: METAOBJECT_META, variables: { t: params.type, h: params.handle } },
      },
      fallback: { order: ['main'], sections: { main: sectionFromPreset(mainMetaobject) } },
    },
  );
  if (hcms) {
    const entry = (hcms.data.route as { metaobject?: MetaobjectMeta | null } | null)?.metaobject;
    if (!entry) return throwNotFound(context, request);
    const seo = metaobjectSeo(entry);
    return { hcms, metaobject: null, type: params.type, title: seo.title, seo, origin } as const;
  }
  const storefrontClient = context.get(storefrontClientContext);
  const metaobject = await loadMetaobjectPage(storefrontClient, params.type, params.handle);
  const seo = metaobjectSeo(metaobject);
  return { hcms: null, metaobject, type: params.type, title: seo.title, seo, origin } as const;
}

type Field = NonNullable<
  Extract<Route.ComponentProps['loaderData'], { hcms: null }>['metaobject']
>['fields'][number];

/**
 * Legacy rendering when the HCMS document is unavailable (T-2.23 renders through the
 * `metaobject/<type>` template): images and text fields in definition order.
 */
function isRenderable(field: Field): boolean {
  if (field.reference?.__typename === 'MediaImage') return Boolean(field.reference.image);
  return Boolean(field.value) && !field.type.includes('reference') && field.type !== 'json';
}

function FieldValue({ field }: { field: Field }) {
  const reference = field.reference;
  if (reference?.__typename === 'MediaImage' && reference.image) {
    const image = reference.image;
    return (
      <img
        src={shopifyImageUrl(image.url, { width: 1200 })}
        alt={image.altText ?? ''}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        loading="lazy"
        className="rounded-card w-full"
      />
    );
  }
  if (field.type === 'multi_line_text_field') {
    return <p className="whitespace-pre-line">{field.value}</p>;
  }
  return <p>{field.value}</p>;
}

export default function MetaobjectPageRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.hcms)
    return (
      <HcmsMainPage
        page={loaderData.hcms}
        crumbs={[{ label: humanize(loaderData.type) }, { label: loaderData.title }]}
        origin={loaderData.origin}
      />
    );
  const { metaobject, title, origin } = loaderData;
  const fields = metaobject.fields.filter(
    (field) => !TITLE_KEYS.includes(field.key) && isRenderable(field),
  );
  return (
    <ContentPage
      title={title}
      crumbs={[{ label: humanize(metaobject.type) }, { label: title }]}
      origin={origin}
      narrow
    >
      <dl className="flex flex-col gap-6">
        {fields.map((field) => (
          <div key={field.key}>
            <dt className="text-on-surface-secondary mb-1 text-sm">{humanize(field.key)}</dt>
            <dd>
              <FieldValue field={field} />
            </dd>
          </div>
        ))}
      </dl>
    </ContentPage>
  );
}

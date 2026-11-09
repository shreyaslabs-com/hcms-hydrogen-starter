import { Link } from '~/components/LocaleLink';

import { ContentPage, formatDate } from '~/components/ContentPage';
import { CursorPagination } from '~/components/hcms/CursorPagination';
import { HcmsImage } from '~/components/hcms/HcmsImage';
import { loadBlog } from '~/lib/content';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { throwNotFound } from '~/lib/hcms/not-found';
import { loadTemplatePage } from '~/lib/hcms/page';
import { browseRouteState } from '~/lib/hcms/route-state';
import { storefrontClientContext } from '~/lib/storefront';
import { routeMeta } from '~/lib/hcms/route-seo';

import type { Route } from './+types/blog';

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const blog = loaderData?.blog;
  return routeMeta(matches, {
    template: (loaderData as { hcms?: { name: string } | null } | undefined)?.hcms?.name ?? null,
    type: 'blog',
    title: blog?.title || 'Blog',
    resourceSeo: blog?.seo,
    hidden: (blog as { hidden?: { value?: string | null } | null } | null | undefined)?.hidden,
  });
}

const BLOG_META = `query HcmsBlogRoute($handle: String!) {
  blog(handle: $handle) { id handle title seo { title description } hidden: metafield(namespace: "seo", key: "hidden") { value } }
}`;
type BlogMeta = {
  id: string;
  handle: string;
  title: string;
  seo?: { title?: string | null; description?: string | null } | null;
  /** Shopify `seo.hidden` metafield ("1" = hide from search engines, T-2.48). */
  hidden?: { value?: string | null } | null;
};

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { tag } = params as { tag?: string };
  // Theme Document `blog` template (D-22); cursor pagination via route state.
  const hcms = await loadTemplatePage(
    context,
    'blog',
    { type: 'blog', handle: params.blogHandle },
    {
      // `/blogs/<blog>/tagged/<tag>` (T-2.41, `routes/blog-tagged.tsx`) filters by tag.
      route: { ...browseRouteState(url), ...(tag ? { tag } : {}) },
      extra: { route: { query: BLOG_META, variables: { handle: params.blogHandle } } },
    },
  );
  if (hcms) {
    const blog = (hcms.data.route as { blog?: BlogMeta | null } | null)?.blog;
    if (!blog) return throwNotFound(context, request);
    return { hcms, blog, origin: url.origin } as const;
  }
  return { hcms: null, ...(await legacyBlog(context, params.blogHandle, request)) } as const;
}

async function legacyBlog(
  context: Route.LoaderArgs['context'],
  blogHandle: string,
  request: Request,
) {
  const storefrontClient = context.get(storefrontClientContext);
  const { blog, pagination } = await loadBlog(storefrontClient, blogHandle, request);
  return { blog, pagination, origin: new URL(request.url).origin };
}

type Article = Extract<
  Route.ComponentProps['loaderData'],
  { hcms: null }
>['blog']['articles']['nodes'][number];

function ArticleCard({
  article,
  blogHandle,
  priority,
}: {
  article: Article;
  blogHandle: string;
  priority: boolean;
}) {
  return (
    <article className="flex flex-col gap-3">
      <Link
        to={`/blogs/${blogHandle}/${article.handle}`}
        className="group flex flex-col gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
      >
        {article.image ? (
          <HcmsImage
            image={article.image}
            aspectRatio={3 / 2}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            priority={priority}
            className="rounded-card w-full object-cover"
          />
        ) : null}
        <h2 className="type-heading-md text-on-surface group-hover:underline">{article.title}</h2>
      </Link>
      <p className="text-on-surface-secondary text-sm">
        <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
        {article.authorV2?.name ? ` · ${article.authorV2.name}` : null}
      </p>
      {article.excerpt ? <p className="text-on-surface-secondary">{article.excerpt}</p> : null}
    </article>
  );
}

export default function BlogRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.hcms)
    return (
      <HcmsMainPage
        page={loaderData.hcms}
        crumbs={[{ label: loaderData.blog.title }]}
        origin={loaderData.origin}
      />
    );
  const { blog, pagination, origin } = loaderData;
  const { nodes } = blog.articles;
  return (
    <ContentPage title={blog.title} crumbs={[{ label: blog.title }]} origin={origin}>
      {nodes.length === 0 ? (
        <p className="text-on-surface-secondary">No articles yet.</p>
      ) : (
        <ul role="list" className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {nodes.map((article, index) => (
            <li key={article.id}>
              <ArticleCard article={article} blogHandle={blog.handle} priority={index === 0} />
            </li>
          ))}
        </ul>
      )}
      <CursorPagination
        previous={pagination.previous}
        next={pagination.next}
        previousLabel="Newer articles"
        nextLabel="Older articles"
      />
    </ContentPage>
  );
}

import { Link } from '~/components/LocaleLink';

import { ContentPage, ShopifyHtml, formatDate } from '~/components/ContentPage';
import { HcmsImage } from '~/components/hcms/HcmsImage';
import { loadArticle } from '~/lib/content';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { throwNotFound } from '~/lib/hcms/not-found';
import { loadTemplatePage } from '~/lib/hcms/page';
import { storefrontClientContext } from '~/lib/storefront';
import { routeMeta } from '~/lib/hcms/route-seo';
import { JsonLd } from '~/components/JsonLd';
import { articleJsonLd } from '~/lib/hcms/json-ld';
import { FALLBACK_SHOP_NAME } from '~/lib/storefront-shop';
import type { loader as rootLoader } from '~/root';
import { useLocation, useRouteLoaderData } from 'react-router';

import type { Route } from './+types/article';

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const article = loaderData?.article;
  return routeMeta(matches, {
    template: (loaderData as { hcms?: { name: string } | null } | undefined)?.hcms?.name ?? null,
    type: 'article',
    title: article?.title || 'Article',
    description: article?.excerpt,
    image: article?.image,
    resourceSeo: article?.seo,
    hidden: (article as { hidden?: { value?: string | null } | null } | null | undefined)?.hidden,
    ogType: 'article',
  });
}

const ARTICLE_META = `query HcmsArticleRoute($blog: String!, $article: String!) {
  blog(handle: $blog) {
    handle title
    articleByHandle(handle: $article) {
      id title excerpt publishedAt authorV2 { name }
      seo { title description } hidden: metafield(namespace: "seo", key: "hidden") { value } image { url altText width height }
    }
  }
}`;
type ArticleMeta = {
  id: string;
  title: string;
  excerpt?: string | null;
  publishedAt: string;
  authorV2?: { name: string } | null;
  seo?: { title?: string | null; description?: string | null } | null;
  /** Shopify `seo.hidden` metafield ("1" = hide from search engines, T-2.48). */
  hidden?: { value?: string | null } | null;
  image?: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
};

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  // Theme Document `article` template (D-22): the blog handle rides as route state.
  const hcms = await loadTemplatePage(
    context,
    'article',
    { type: 'article', handle: params.articleHandle, parent: params.blogHandle },
    {
      route: { blogHandle: params.blogHandle },
      extra: {
        route: {
          query: ARTICLE_META,
          variables: { blog: params.blogHandle, article: params.articleHandle },
        },
      },
    },
  );
  if (hcms) {
    const blog = (
      hcms.data.route as {
        blog?: { handle: string; title: string; articleByHandle?: ArticleMeta | null } | null;
      } | null
    )?.blog;
    const article = blog?.articleByHandle;
    if (!blog || !article) return throwNotFound(context, request);
    return { hcms, blog, article, origin } as const;
  }
  const storefrontClient = context.get(storefrontClientContext);
  const { blog, article } = await loadArticle(
    storefrontClient,
    params.blogHandle,
    params.articleHandle,
  );
  return { hcms: null, blog, article, origin } as const;
}

export default function ArticleRoute({ loaderData }: Route.ComponentProps) {
  const { blog, article, origin } = loaderData;
  const image = article.image;
  const { pathname } = useLocation();
  const articleLd = articleJsonLd({
    title: article.title,
    url: `${origin}${pathname}`,
    publishedAt: article.publishedAt,
    excerpt: article.excerpt,
    author: article.authorV2?.name,
    image: article.image,
    shopName: useRouteLoaderData<typeof rootLoader>('root')?.shopInfo.name ?? FALLBACK_SHOP_NAME,
    origin,
  });

  if (loaderData.hcms)
    return (
      <HcmsMainPage
        page={loaderData.hcms}
        crumbs={[{ label: blog.title, to: `/blogs/${blog.handle}` }, { label: article.title }]}
        origin={origin}
      >
        <JsonLd data={articleLd} />
      </HcmsMainPage>
    );
  return (
    <ContentPage
      title={article.title}
      crumbs={[{ label: blog.title, to: `/blogs/${blog.handle}` }, { label: article.title }]}
      origin={origin}
      narrow
    >
      <JsonLd data={articleLd} />
      <p className="text-on-surface-secondary -mt-4 mb-8 text-sm">
        <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
        {article.authorV2?.name ? ` · ${article.authorV2.name}` : null}
      </p>
      {image ? (
        <HcmsImage
          image={image}
          sizes="(min-width: 768px) 768px, 100vw"
          priority
          className="rounded-card mb-8 w-full"
        />
      ) : null}
      <ShopifyHtml html={loaderData.article.contentHtml} />
      {loaderData.article.tags.length > 0 ? (
        <ul role="list" aria-label="Tags" className="mt-10 flex flex-wrap gap-2">
          {loaderData.article.tags.map((tag) => (
            <li key={tag} className="border-border rounded-full border px-3 py-1 text-sm">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-10">
        <Link to={`/blogs/${blog.handle}`} className="underline underline-offset-2">
          <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
            ←
          </span>{' '}
          Back to {blog.title}
        </Link>
      </p>
    </ContentPage>
  );
}

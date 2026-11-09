/** Route `meta` with theme SEO (T-1.7.1): root loader `seo` + the page's template name. */
import { pageSeo, seoMeta, type PageSeoInput, type SeoContext } from '~/lib/hcms/seo';
import { getShopNameFromRootMatch } from '~/lib/storefront-shop';

type RootMatch = { loaderData?: unknown } | null | undefined;

export function routeMeta(matches: readonly RootMatch[], input: Omit<PageSeoInput, 'shopName'>) {
  const root = matches[0] as Parameters<typeof getShopNameFromRootMatch>[0];
  const ctx = (matches[0]?.loaderData as { seo?: SeoContext } | undefined)?.seo;
  return seoMeta(pageSeo(ctx, { ...input, shopName: getShopNameFromRootMatch(root) }));
}

import { ContentPage, ShopifyHtml } from '~/components/ContentPage';
import { loadPolicy } from '~/lib/content';
import { storefrontClientContext } from '~/lib/storefront';
import { formatPageTitle, getShopNameFromRootMatch } from '~/lib/storefront-shop';

import type { Route } from './+types/policy';

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const shopName = getShopNameFromRootMatch(matches[0]);
  return [
    { title: formatPageTitle(loaderData?.policy.title ?? 'Policy', shopName) },
    { name: 'description', content: `${loaderData?.policy.title ?? 'Policy'} for ${shopName}.` },
  ];
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const storefrontClient = context.get(storefrontClientContext);
  const policy = await loadPolicy(storefrontClient, params.handle);
  return { policy, origin: new URL(request.url).origin };
}

export default function PolicyRoute({ loaderData }: Route.ComponentProps) {
  const { policy, origin } = loaderData;
  return (
    <ContentPage
      title={policy.title}
      crumbs={[{ label: 'Policies', to: '/policies' }, { label: policy.title }]}
      origin={origin}
      narrow
    >
      <ShopifyHtml html={policy.body} />
    </ContentPage>
  );
}

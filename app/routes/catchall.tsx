import { data } from 'react-router';

import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { loadTemplatePage } from '~/lib/hcms/page';
import { formatPageTitle, getShopNameFromRootMatch } from '~/lib/storefront-shop';

import type { Route } from './+types/catchall';

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: formatPageTitle('Page not found', getShopNameFromRootMatch(matches[0])) },
    { name: 'robots', content: 'noindex' },
  ];
}

/**
 * Unknown URLs: the theme's `404` template (merchant-editable, D-22) with a real 404 status, or
 * the app's NotFound (root ErrorBoundary) when the document has none. Other "not found" cases
 * (missing product, collection…) still use the ErrorBoundary.
 */
export async function loader({ context, request }: Route.LoaderArgs) {
  const hcms = await loadTemplatePage(context, '404');
  if (!hcms) throw new Response('Not Found', { status: 404 });
  return data({ hcms, origin: new URL(request.url).origin }, { status: 404 });
}

export default function CatchAllRoute({ loaderData }: Route.ComponentProps) {
  return <HcmsMainPage page={loaderData.hcms} origin={loaderData.origin} />;
}

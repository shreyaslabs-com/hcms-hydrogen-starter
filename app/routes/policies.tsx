import { Link } from '~/components/LocaleLink';

import { ContentPage } from '~/components/ContentPage';
import { loadPolicies } from '~/lib/content';
import { storefrontClientContext } from '~/lib/storefront';
import { formatPageTitle, getShopNameFromRootMatch } from '~/lib/storefront-shop';

import type { Route } from './+types/policies';

export function meta({ matches }: Route.MetaArgs) {
  const shopName = getShopNameFromRootMatch(matches[0]);
  return [
    { title: formatPageTitle('Policies', shopName) },
    { name: 'description', content: `${shopName} store policies.` },
  ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const storefrontClient = context.get(storefrontClientContext);
  const policies = await loadPolicies(storefrontClient);
  return {
    policies: policies.map(({ id, title, handle }) => ({ id, title, handle })),
    origin: new URL(request.url).origin,
  };
}

export default function PoliciesRoute({ loaderData }: Route.ComponentProps) {
  const { policies, origin } = loaderData;
  return (
    <ContentPage title="Policies" crumbs={[{ label: 'Policies' }]} origin={origin} narrow>
      {policies.length === 0 ? (
        <p className="text-on-surface-secondary">This store hasn't published any policies yet.</p>
      ) : (
        <ul role="list" className="divide-border border-border divide-y border-y">
          {policies.map((policy) => (
            <li key={policy.id}>
              <Link
                to={`/policies/${policy.handle}`}
                className="hover:text-on-surface-secondary block py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                {policy.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContentPage>
  );
}

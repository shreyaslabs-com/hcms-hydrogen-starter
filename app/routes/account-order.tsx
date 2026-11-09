import { mainOrder, sectionFromPreset } from '@hcms/sections';

import { OrderBody } from '~/components/account/OrderBody';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { RouteSlots } from '~/components/hcms/RouteSlots';
import { ORDER_QUERY, accountSession, type AccountSession } from '~/lib/account.server';
import { orderGid } from '~/lib/hcms/account';
import { loadTemplatePage } from '~/lib/hcms/page';
import { routeMeta } from '~/lib/hcms/route-seo';

import type { Route } from './+types/account-order';

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const name = loaderData?.status === 'signed-in' ? loaderData.order.name : null;
  return routeMeta(matches, {
    template: loaderData?.hcms?.name ?? null,
    type: 'customers/order',
    title: name ? `Order ${name}` : 'Order',
    noindex: true,
  });
}

async function orderState(session: AccountSession, id: string) {
  if (session.status !== 'ready') return session;
  try {
    const { data, errors } = await session.client.graphql(ORDER_QUERY, {
      accessToken: session.accessToken,
      variables: { id },
    });
    if (errors?.length && !data?.order)
      return { status: 'error', message: errors[0]?.message ?? 'Order not found.' } as const;
    // Customers only ever read their own orders: someone else's id comes back null → 404.
    if (!data?.order) throw new Response('Not Found', { status: 404 });
    return { status: 'signed-in', order: data.order } as const;
  } catch (error) {
    if (error instanceof Response) throw error;
    return { status: 'error', message: "We couldn't load this order. Try again later." } as const;
  }
}

/**
 * `/account/orders/:id` → Theme Document `customers/order` (T-2.22): `main-order` renders
 * `OrderBody` via the adapter. Older documents without the template get the default preset.
 */
export async function loader({ context, params, request }: Route.LoaderArgs) {
  const id = orderGid(params.id);
  if (!id) throw new Response('Not Found', { status: 404 });
  const session = await accountSession(context, request);
  const [state, hcms] = await Promise.all([
    orderState(session, id),
    loadTemplatePage(
      context,
      'customers/order',
      {},
      { fallback: { order: ['main'], sections: { main: sectionFromPreset(mainOrder) } } },
    ),
  ]);
  return { ...state, hcms, origin: new URL(request.url).origin };
}

export type OrderData = Awaited<ReturnType<typeof loader>>;

export default function AccountOrderRoute({ loaderData }: Route.ComponentProps) {
  if (!loaderData.hcms) return null; // unreachable: `fallback` always yields a template
  return (
    <RouteSlots
      value={{
        OrderPage: ({ showImages, showTracking }) => (
          <OrderBody data={loaderData} showImages={showImages} showTracking={showTracking} />
        ),
      }}
    >
      <HcmsMainPage page={loaderData.hcms} origin={loaderData.origin} />
    </RouteSlots>
  );
}

import { envContext } from '~/lib/env';
import {
  checkShiprocket,
  createShiprocketState,
  validPincode,
  type DeliveryAnswer,
} from '~/lib/hcms/delivery';

import type { Route } from './+types/delivery';

/** Per isolate: Shiprocket token + 10-minute answers by pincode. */
const state = createShiprocketState();

const json = (answer: DeliveryAnswer, status: number, cache: string) =>
  new Response(JSON.stringify(answer), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });

/**
 * `/{market?}/__hcms/delivery?pincode=` (T-2.82): the product page's `delivery_estimate` block
 * (provider "Shiprocket serviceability") asks here. The Shiprocket call is server-side with the
 * storefront's `SHIPROCKET_*` variables (never sent to the browser); answers are cached briefly
 * (CDN 5 min, 1 min browser). A bad pincode is a 400; provider trouble is `{ status: 'unavailable' }`
 * (200, not cached) so the block shows its own estimate instead of an error.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const pincode = new URL(request.url).searchParams.get('pincode')?.trim() ?? '';
  if (!validPincode(pincode)) return json({ status: 'unavailable' }, 400, 'no-store');
  const answer = await checkShiprocket(pincode, context.get(envContext), fetch, state);
  return json(
    answer,
    200,
    answer.status === 'unavailable'
      ? 'no-store'
      : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  );
}

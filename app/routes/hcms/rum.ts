import { envContext } from '~/lib/env';
import { handleRumBeacon } from '~/lib/hcms/rum';

import type { Route } from './+types/rum';

/** `/__hcms/rum` (T-2.15): Core Web Vitals beacons → signed forward to the HCMS admin. */
export function action({ request, context }: Route.ActionArgs) {
  return handleRumBeacon(request, context.get(envContext), (p) => context.waitUntil(p));
}

export function loader() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

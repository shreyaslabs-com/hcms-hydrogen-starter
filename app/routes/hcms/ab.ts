import { envContext } from '~/lib/env';
import { handleExposureBeacon } from '~/lib/hcms/ab';

import type { Route } from './+types/ab';

/** `/__hcms/ab` (T-3.5): A/B exposure beacons → signed forward to the HCMS admin. */
export function action({ request, context }: Route.ActionArgs) {
  return handleExposureBeacon(request, context.get(envContext), (p) => context.waitUntil(p));
}

export function loader() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

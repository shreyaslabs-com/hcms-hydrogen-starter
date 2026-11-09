import { envContext } from '~/lib/env';
import { handleFormPost } from '~/lib/hcms/forms';

import type { Route } from './+types/newsletter';

/** `/{market?}/__hcms/newsletter` (T-1.3.2, D-21): `newsletter` section posts → signed forward to the HCMS admin. */
export function action({ request, context }: Route.ActionArgs) {
  return handleFormPost(request, 'newsletter', context.get(envContext));
}

export function loader() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

import { documentContext } from '~/lib/hcms/document';
import { embedResponse } from '~/lib/hcms/embed';
import { previewContext } from '~/lib/preview';

import type { Route } from './+types/embed';

/**
 * `/{market?}/__hcms/embed/<section>/<block…>?v=<hash>` (2026-11-09): the sandboxed frame document
 * of a Custom HTML section/block with JavaScript (`lib/hcms/embed.ts`). The storefront page loads
 * it in `<iframe sandbox="allow-scripts allow-popups allow-forms">`; scripts never run in the page.
 * Preview requests carry the signed preview token (cookie), so the draft is served there.
 */
export function loader({ request, params, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return embedResponse(
    context.get(documentContext).document,
    params['*'],
    url.searchParams.get('v'),
    {
      origin: url.origin,
      preview: Boolean(context.get(previewContext)),
    },
  );
}

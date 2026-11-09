import { envContext } from '~/lib/env';
import { documentContext } from '~/lib/hcms/document';
import { parseEmbeds } from '~/lib/hcms/embeds';
import { handleFormPost } from '~/lib/hcms/forms';
import { klaviyoBackInStockRequest } from '~/lib/hcms/integrations';

import type { Route } from './+types/back-in-stock';

/**
 * `/{market?}/__hcms/back-in-stock` (T-2.8): the `back_in_stock` product block posts here; the
 * request goes to Klaviyo's Client API with the theme's Klaviyo embed public key (no private key,
 * no vendor JS in the browser). Same spam traps and no-JS behaviour as the newsletter form. The
 * shopper asking to be emailed is the consent for this message; Klaviyo handles the rest.
 */
export function action({ request, context }: Route.ActionArgs) {
  const env = context.get(envContext);
  let companyId: string | undefined;
  try {
    companyId = parseEmbeds(
      context.get(documentContext).document.embeds,
      env.PUBLIC_STORE_DOMAIN,
    ).find((e) => e.type === 'klaviyo')?.config?.companyId;
  } catch {
    companyId = undefined;
  }
  return handleFormPost(request, 'back_in_stock', env, fetch, async (fields) => {
    if (!companyId) return 503;
    const { url, init } = klaviyoBackInStockRequest(
      companyId,
      fields.email ?? '',
      fields.variant ?? '',
    );
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    return res.status;
  });
}

export function loader() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

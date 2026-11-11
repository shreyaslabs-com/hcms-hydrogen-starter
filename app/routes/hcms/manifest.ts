import { SDK_VERSION } from '@hcms/hydrogen';

import { HCMS_TEMPLATE_VERSION } from '~/lib/hcms/template-version';
import { registry } from '~/sections';

/**
 * `/__hcms/manifest` (T-1.1.7, docs/05 flow 4): the section/block schemas this deployment can
 * render. Public JSON (no secrets); the admin and the editor read it. `templateVersion` lets the
 * admin offer storefront code updates (T-2.167).
 */
export function loader() {
  return Response.json(
    { ...registry.manifest(), sdkVersion: SDK_VERSION, templateVersion: HCMS_TEMPLATE_VERSION },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
